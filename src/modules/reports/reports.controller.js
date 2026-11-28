import { config } from '#config';
import { BRANDS, brandInfo } from '#lib/brands.js';
import { parseDate } from '#modules/schedule/schedule.service.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import * as service from './reports.service.js';
import { weekLabel } from './reports.export.js';

const int = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 2 });
const num = (v) => (v == null ? '—' : int.format(v));
const money = (v, currency = 'VND') =>
  v == null ? '—' : currency === 'VND' ? `${int.format(v)} ₫` : `${dec.format(v)} ${currency}`;
const pctText = (v) => (v == null ? '—' : `${dec.format(v)}%`);

/**
 * So với tuần trước -> { text: '▲ 20%', tone: 'up' | 'down' | 'same' | 'none' }.
 * neutral = chỉ số mà tăng chưa chắc là tốt (chi tiêu, chi phí) -> không tô xanh/đỏ.
 */
export function delta(cur, prev, { neutral = false, lowerIsBetter = false } = {}) {
  if (cur == null || prev == null || (cur === 0 && prev === 0)) return { text: '', tone: 'none' };
  if (cur === prev) return { text: '= tuần trước', tone: 'same' };
  const up = cur > prev;
  const arrow = up ? '▲' : '▼';
  const text = prev === 0 ? `${arrow} từ 0` : `${arrow} ${Math.abs(Math.round(((cur - prev) / prev) * 100))}%`;
  const good = lowerIsBetter ? !up : up;
  return { text, tone: neutral ? 'same' : good ? 'up' : 'down' };
}


function presentAds(ads, prevAds) {
  if (!ads?.configured) return ads;
  const prevOf = (key) => prevAds?.platforms?.find((p) => p.key === key)?.totals ?? null;
  const platforms = ads.platforms.map((p) => {
    const t = p.totals;
    const pt = prevOf(p.key);
    return {
      ...p,
      rows: t && [
        { label: 'Chi tiêu', value: money(t.spend, p.currency), delta: delta(t.spend, pt?.spend, { neutral: true }) },
        { label: 'Kết quả', value: num(t.results), delta: delta(t.results, pt?.results) },
        { label: 'Chi phí / kết quả', value: money(t.costPerResult, p.currency), delta: delta(t.costPerResult, pt?.costPerResult, { lowerIsBetter: true }) },
        { label: 'Hiển thị', value: num(t.impressions), delta: delta(t.impressions, pt?.impressions) },
        { label: 'CTR', value: pctText(t.ctr), delta: delta(t.ctr, pt?.ctr) },
      ],
    };
  });
  const c = ads.combined;
  const pc = prevAds?.combined;
  return {
    ...ads,
    platforms,
    combined: c && {
      spend: money(c.spend, c.currency),
      spendDelta: delta(c.spend, pc?.spend, { neutral: true }),
      results: num(c.results),
      resultsDelta: delta(c.results, pc?.results),
      costPerResult: money(c.costPerResult, c.currency),
      costDelta: delta(c.costPerResult, pc?.costPerResult, { lowerIsBetter: true }),
    },
  };
}

const withBadge = (row) => ({ ...row, badge: brandInfo(row.brand)?.badge ?? 'badge-gray' });

/** Dữ liệu đã định dạng sẵn cho view. */
function present(report) {
  const { content, prevContent, customers, prevCustomers } = report;
  const t = content.total;
  const posted = { value: `${t.posted}/${t.planned}`, delta: delta(t.posted, prevContent.posted) };
  return {
    ...report,
    label: weekLabel(report.from, report.to),
    prevLabel: weekLabel(report.prevWeek.from, report.prevWeek.to),
    kpis: [
      { label: 'Video đã đăng', value: posted.value, sub: 'đã đăng / lên lịch', delta: posted.delta },
      { label: 'Khách mới', value: num(customers.newCustomers), sub: 'nhập vào Data khách hàng', delta: delta(customers.newCustomers, prevCustomers.newCustomers) },
      { label: 'Doanh thu', value: money(customers.revenue), sub: `${customers.invoiceCount} hoá đơn`, delta: delta(customers.revenue, prevCustomers.revenue) },
    ],
    posts: content.posts.map((p) => ({ ...p, badge: brandInfo(p.brand)?.badge ?? 'badge-gray' })),
    ads: presentAds(report.ads, report.prevAds),
    social: report.social.map((s) => ({
      ...s,
      badge: brandInfo(s.brand)?.badge ?? 'badge-gray',
      f: { followers: num(s.followers), views: num(s.views), engagements: num(s.engagements) },
      gain: s.followerGain == null ? '' : `${s.followerGain >= 0 ? '+' : ''}${int.format(s.followerGain)}`,
      gainTone: s.followerGain == null ? 'none' : s.followerGain > 0 ? 'up' : s.followerGain < 0 ? 'down' : 'same',
      viewsDelta: delta(s.views, s.prev?.views),
      engagementsDelta: delta(s.engagements, s.prev?.engagements),
    })),
    revenueText: money(customers.revenue),
    hasNotes: Boolean(report.notes.highlights || report.notes.issues),
    // Kế hoạch tuần tới
    nextLabel: weekLabel(report.nextWeek.from, report.nextWeek.to),
    planItems: report.planItems.map(withBadge),
    nextPosts: report.nextContent.posts.map(withBadge),
    nextShoots: report.nextContent.shoots.map(withBadge),
    // Kết quả kế hoạch đã đề ra tuần trước
    prevPlanItems: report.prevPlanItems.map(withBadge),
    prevPlanDone: report.prevPlanItems.filter((p) => p.done).length,
  };
}

export async function index(req, res) {
  const date = parseDate(req.query.date);
  const report = present(await service.getWeekReport(date));
  res.render('reports/index', {
    title: 'Báo cáo tuần',
    ...report,
    exportFilename: `bao-cao-tuan-${report.from}`,
  });
}

// ---------------------------------------------------------------- Nhập tay

const BLANK_PLAN_ROWS = 3; // form mở lần đầu có sẵn vài dòng trống để gõ luôn

const planRowView = (row = {}) => ({
  id: row.id ?? '',
  title: row.title ?? '',
  target: row.target ?? '',
  owner_id: row.owner_id ?? '',
  brand: row.brand ?? '',
  due_date: row.due_date ?? '',
  errors: row.errors ?? {},
});

function formView(form, errors = {}, ownerOptions = []) {
  const rows = (form.planRows ?? form.planItems).map(planRowView);
  if (!form.planRows && !rows.length) for (let i = 0; i < BLANK_PLAN_ROWS; i++) rows.push(planRowView());
  return {
    title: 'Nhập báo cáo tuần',
    ...form,
    nextLabel: weekLabel(form.nextWeek.from, form.nextWeek.to),
    planRows: rows,
    ownerOptions,
    brandOptions: BRANDS.map((b) => ({ value: b.value, label: b.label })),
    prevPlanItems: form.prevPlanItems.map(withBadge),
    label: weekLabel(form.from, form.to),
    errors,
    channels: service.CHANNELS,
    metrics: service.METRICS,
    // Lưới ô số: mỗi brand một bảng, mỗi kênh một hàng, mỗi chỉ số một cột
    brands: BRANDS.map((b, i) => ({
      ...b,
      rows: service.CHANNELS.map((ch) => ({
        ...ch,
        cells: service.METRICS.map((m) => {
          const name = service.statField(i, ch.value, m.value);
          return { name, label: `${m.label} ${ch.label} ${b.label}`, value: form.values[name] ?? '', error: errors[name] };
        }),
      })),
    })),
  };
}

export async function edit(req, res) {
  const date = parseDate(req.query.date);
  const [form, owners] = await Promise.all([service.getWeekForm(date), staffOptions()]);
  res.render('reports/edit', formView(form, {}, owners));
}

export async function save(req, res) {
  const date = parseDate(req.body.date);
  const result = await service.saveWeek(date, req.body, req.user.id);
  if (!result.ok) {
    const [form, owners] = await Promise.all([service.getWeekForm(date), staffOptions()]);
    // Vẽ lại đúng những gì người dùng vừa nhập (kể cả ô tick Xong của tuần trước)
    const ticked = new Set([req.body.prev_plan_done ?? []].flat().map(String));
    const prevPlanItems = form.prevPlanItems.map((p) => ({ ...p, done: ticked.has(String(p.id)) ? 1 : 0 }));
    return res
      .status(422)
      .render('reports/edit', formView({ ...form, values: { ...form.values, ...req.body }, planRows: result.planRows, prevPlanItems }, result.errors, owners));
  }
  req.flash('success', 'Đã lưu báo cáo tuần.');
  res.redirect(`/reports?date=${service.weekOf(date).from}`);
}

