// Báo cáo tuần marketing (chỉ quản lý). Tuần = Thứ 2 → Chủ nhật, giờ Việt Nam.
// Số tự động, tính lại mỗi lần mở (không lưu riêng):
//   - Nội dung: video lên lịch đăng / đã đăng, lên lịch quay / đã quay theo từng brand (bảng content_plans).
//   - Quảng cáo: chi tiêu, kết quả Facebook + TikTok (dùng lại ads.service, có lưu tạm).
//   - Khách hàng: khách mới theo nguồn, hoá đơn + doanh thu trong tuần (Data khách hàng).
// Nhập tay (bảng weekly_reports, weekly_social_stats, weekly_plan_items): chỉ số kênh mạng xã hội, nhận xét & kế hoạch.
// Kế hoạch: chưa lưu thì lấy sẵn từ Lịch làm việc (reports.plan.js).
// Kênh MXH: ô chưa nhập thì lấy thẳng từ Facebook/Instagram/TikTok/YouTube nếu đã kết nối (reports.social.js).
// Mỗi số đều so với tuần trước.
import { forbidden } from '#lib/errors.js';
import { BRANDS } from '#lib/brands.js';
import { addDays, appDateOf, todayISO, weekDays } from '#lib/dates.js';
import { validate } from '#lib/validate.js';
import * as plansRepo from '#modules/plan/plan.repo.js';
import * as customersRepo from '#modules/customers/customers.repo.js';
import { CUSTOMER_SOURCES } from '#modules/customers/customers.schema.js';
import * as adsService from '#modules/ads/ads.service.js';
import { notesSchema, statNumber } from './reports.schema.js';
import { parsePlanRows, planRowsFor, suggestFromCalendar, withResults, withTaskIds } from './reports.plan.js';
import * as repo from './reports.repo.js';
import { connectedAccounts, fetchWeek, mergeStats } from './reports.social.js';

export const canViewReports = (user) => user?.role === 'admin';

export function requireReportAccess(req, res, next) {
  if (canViewReports(req.user)) return next();
  next(forbidden('Báo cáo tuần chỉ dành cho quản lý.'));
}

export const CHANNELS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
];
export const METRICS = [
  { value: 'followers', label: 'Follower (cuối tuần)' },
  { value: 'views', label: 'Lượt xem' },
  { value: 'engagements', label: 'Tương tác' },
];
const NO_BRAND_LABEL = 'Chưa chọn brand';

// ---------------------------------------------------------------- Nội dung

const isShot = (p) => p.filmed === 1 || p.shoot_task_status === 'done' || p.status === 'posted';
const inWeek = (date, from, to) => date != null && date >= from && date <= to;

/** Gom nội dung của một tuần: theo brand + tổng. plans = dòng content_plans (không gồm On hold). */
export function contentStats(plans, { from, to }) {
  const active = plans.filter((p) => p.status !== 'dropped');
  const posts = active.filter((p) => inWeek(p.post_date, from, to));
  const shoots = active.filter((p) => inWeek(p.shoot_date, from, to));
  const sum = (brandPosts, brandShoots) => ({
    planned: brandPosts.length,
    posted: brandPosts.filter((p) => p.status === 'posted').length,
    shootPlanned: brandShoots.length,
    shot: brandShoots.filter(isShot).length,
  });
  const brandNames = [...BRANDS.map((b) => b.value), null];
  const byBrand = brandNames
    .map((brand) => ({
      brand: brand ?? NO_BRAND_LABEL,
      ...sum(posts.filter((p) => (p.brand || null) === brand), shoots.filter((p) => (p.brand || null) === brand)),
    }))
    .filter((row) => row.planned || row.shootPlanned); // brand không có video trong tuần thì ẩn
  return {
    total: sum(posts, shoots),
    byBrand,
    // Danh sách video đăng trong tuần (để in vào báo cáo), theo ngày đăng
    posts: posts
      .map((p) => ({ id: p.id, title: p.title, brand: p.brand || '', post_date: p.post_date, posted: p.status === 'posted', owner: p.poster_name || p.owner_name || '' }))
      .sort((a, b) => a.post_date.localeCompare(b.post_date) || a.title.localeCompare(b.title, 'vi')),
    shoots: shoots
      .map((p) => ({ id: p.id, title: p.title, brand: p.brand || '', shoot_date: p.shoot_date, shoot_time: p.shoot_time || '', shot: isShot(p), owner: p.shooter_name || p.owner_name || '' }))
      .sort((a, b) => a.shoot_date.localeCompare(b.shoot_date) || a.title.localeCompare(b.title, 'vi')),
  };
}

// ---------------------------------------------------------------- Khách hàng

/** Khách mới trong tuần (theo ngày giờ VN của lúc nhập) + hoá đơn trong tuần. */
async function customerStats({ from, to }) {
  // created_at là giờ UTC: lấy rộng ra 1 ngày mỗi bên rồi lọc lại theo ngày VN.
  const [rows, invoices] = await Promise.all([
    customersRepo.listCreatedBetween(`${addDays(from, -1)} 00:00:00`, `${addDays(to, 2)} 00:00:00`),
    customersRepo.invoiceTotalsBetween(from, to),
  ]);
  const created = rows.filter((c) => inWeek(appDateOf(c.created_at), from, to));
  const bySource = CUSTOMER_SOURCES.map((s) => ({ label: s.label, count: created.filter((c) => c.source === s.value).length }));
  const unknown = created.filter((c) => !c.source).length;
  if (unknown) bySource.push({ label: 'Chưa ghi nguồn', count: unknown });
  return {
    newCustomers: created.length,
    bySource: bySource.filter((s) => s.count).sort((a, b) => b.count - a.count),
    invoiceCount: Number(invoices.count),
    revenue: Number(invoices.total),
    buyers: Number(invoices.customers),
  };
}

// ---------------------------------------------------------------- Quảng cáo

/** Tổng quảng cáo của tuần. Tuần chưa bắt đầu thì không có số (null). */
async function adsStats({ from, to }, today) {
  if (from > today) return null;
  const report = await adsService.getReport('custom', { custom: { from, to: to > today ? today : to } });
  if (!report.anyConfigured) return { configured: false };
  return {
    configured: true,
    platforms: report.platforms
      .filter((p) => p.configured)
      .map((p) => ({ key: p.key, label: p.label, currency: p.currency, error: p.error ?? null, totals: p.totals ?? null })),
    combined: report.combined,
  };
}

// ---------------------------------------------------------------- Kênh MXH (nhập tay)

const statKey = (brand, channel) => `${brand}|${channel}`;

/** Bảng chỉ số kênh: chỉ những brand + kênh có số tuần này hoặc tuần trước. Follower so với tuần trước. */
export function socialRows(current, previous) {
  const prevMap = new Map(previous.map((s) => [statKey(s.brand, s.channel), s]));
  const rows = [];
  for (const b of BRANDS) {
    for (const ch of CHANNELS) {
      const cur = current.find((s) => s.brand === b.value && s.channel === ch.value);
      if (!cur) continue;
      const prev = prevMap.get(statKey(b.value, ch.value)) ?? null;
      rows.push({
        brand: b.value,
        channel: ch.label,
        followers: cur.followers,
        views: cur.views,
        engagements: cur.engagements,
        autoFields: cur.autoFields ?? [], // chỉ số lấy tự động từ nền tảng
        prev: prev && { followers: prev.followers, views: prev.views, engagements: prev.engagements },
        // Follower tăng thêm trong tuần = cuối tuần này − cuối tuần trước
        followerGain: cur.followers != null && prev?.followers != null ? cur.followers - prev.followers : null,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- Tổng hợp

/** Tuần chứa ngày `date` (YYYY-MM-DD). */
export function weekOf(date) {
  const days = weekDays(date);
  return { from: days[0], to: days[6] };
}

export async function getWeekReport(date) {
  const today = todayISO();
  const week = weekOf(date);
  const prevWeek = weekOf(addDays(week.from, -7));
  const nextWeek = weekOf(addDays(week.from, 7));
  const [plans, prevPlans, nextPlans, customers, prevCustomers, ads, prevAds, notes, social, prevSocial, planItems, prevPlanItems, autoSocial, prevAutoSocial] = await Promise.all([
    plansRepo.listForRange(week),
    plansRepo.listForRange(prevWeek),
    plansRepo.listForRange(nextWeek),
    customerStats(week),
    customerStats(prevWeek),
    adsStats(week, today),
    adsStats(prevWeek, today),
    repo.findNotes(week.from),
    repo.listSocial(week.from),
    repo.listSocial(prevWeek.from),
    repo.listPlanItems(week.from),
    repo.listPlanItems(prevWeek.from),
    fetchWeek(week, today),
    fetchWeek(prevWeek, today),
  ]);
  return {
    ...week,
    prevWeek,
    today,
    isThisWeek: week.from <= today && today <= week.to,
    prev: prevWeek.from,
    next: addDays(week.from, 7),
    content: contentStats(plans, week),
    prevContent: contentStats(prevPlans, prevWeek).total,
    customers,
    prevCustomers,
    ads,
    prevAds,
    notes: notes ?? {},
    social: socialRows(mergeStats(social, autoSocial), mergeStats(prevSocial, prevAutoSocial)),
    socialConnected: connectedAccounts().length > 0,
    nextWeek,
    nextContent: contentStats(nextPlans, nextWeek),
    ...(await planSections({ week, nextWeek, prevWeek, planItems, prevPlanItems })),
  };
}

/**
 * Kế hoạch tuần tới (viết ở báo cáo này) + kết quả kế hoạch tuần này (viết ở báo cáo tuần trước).
 * Tuần nào chưa lưu kế hoạch thì dùng luôn việc trên Lịch làm việc của tuần đó (fromCalendar = true).
 */
async function planSections({ week, nextWeek, planItems, prevPlanItems }) {
  const [next, current] = await Promise.all([
    planItems.length ? planItems.map(withTaskIds) : suggestFromCalendar(nextWeek),
    prevPlanItems.length ? prevPlanItems.map(withTaskIds) : suggestFromCalendar(week),
  ]);
  return {
    planItems: next,
    planFromCalendar: !planItems.length && next.length > 0,
    prevPlanItems: await withResults(current),
    prevPlanFromCalendar: !prevPlanItems.length && current.length > 0,
  };
}

// ---------------------------------------------------------------- Form nhập tay

/** Tên ô số trong form: s_<số thứ tự brand>_<kênh>_<chỉ số> (tên brand có dấu cách nên dùng số thứ tự). */
export const statField = (brandIndex, channel, metric) => `s_${brandIndex}_${channel}_${metric}`;

/**
 * Dữ liệu cho form: values = { highlights, …, s_0_tiktok_followers: 1200, … }.
 * Kế hoạch tuần tới chưa lưu -> điền sẵn từ Lịch làm việc; addFromCalendar -> thêm việc trên lịch còn thiếu.
 */
export async function getWeekForm(date, { addFromCalendar = false } = {}) {
  const week = weekOf(date);
  const [notes, saved, planItems, prevPlanItems, auto] = await Promise.all([
    repo.findNotes(week.from),
    repo.listSocial(week.from),
    repo.listPlanItems(week.from),
    repo.listPlanItems(addDays(week.from, -7)),
    fetchWeek(week, todayISO()),
  ]);
  const social = mergeStats(saved, auto);
  const autoCells = []; // tên các ô điền sẵn từ nền tảng
  const values = { highlights: notes?.highlights ?? '', issues: notes?.issues ?? '', next_plan: notes?.next_plan ?? '' };
  for (const s of social) {
    const i = BRANDS.findIndex((b) => b.value === s.brand);
    if (i < 0) continue;
    for (const m of METRICS) {
      values[statField(i, s.channel, m.value)] = s[m.value] ?? '';
      if (s.autoFields.includes(m.value)) autoCells.push(statField(i, s.channel, m.value));
    }
  }
  const nextWeek = weekOf(addDays(week.from, 7));
  const plan = await planRowsFor(planItems.map(withTaskIds), nextWeek, { addFromCalendar });
  return {
    ...week,
    nextWeek,
    values,
    autoCells,
    socialConnected: connectedAccounts().length > 0,
    planItems: plan.rows,
    planAdded: addFromCalendar ? plan.added : null,
    planFromCalendar: !planItems.length && plan.rows.length > 0,
    // Kế hoạch tuần trước chỉ hiện để tick khi đã lưu (dòng lấy từ lịch tự tính, không cần tick)
    prevPlanItems: await withResults(prevPlanItems.map(withTaskIds)),
  };
}

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Kiểm tra + lưu form. Trả { ok, errors } — errors theo tên ô. */
export async function saveWeek(date, input, userId) {
  const week = weekOf(date);
  const notes = validate(notesSchema, input);
  const errors = { ...notes.errors };
  const stats = [];
  BRANDS.forEach((b, i) => {
    for (const ch of CHANNELS) {
      const row = { brand: b.value, channel: ch.value };
      for (const m of METRICS) {
        const name = statField(i, ch.value, m.value);
        const parsed = statNumber.safeParse(input[name]);
        if (parsed.success) row[m.value] = parsed.data;
        else errors[name] = parsed.error.issues[0].message;
      }
      if (METRICS.some((m) => row[m.value] != null)) stats.push(row);
    }
  });
  const plan = parsePlanRows(input);
  Object.assign(errors, plan.errors);
  if (Object.keys(errors).length) return { ok: false, errors, planRows: plan.rows };
  // Tuần trước: chỉ cập nhật Xong khi form có hiện danh sách đó (ô ẩn prev_plan_shown)
  const prevWeekStart = input.prev_plan_shown ? addDays(week.from, -7) : null;
  const doneIds = asList(input.prev_plan_done).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  await repo.saveWeek(week.from, notes.data, stats, userId, { plans: plan.items, prevWeekStart, doneIds });
  return { ok: true, errors: {} };
}
