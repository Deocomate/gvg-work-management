// 3 tab nội dung trên trang Lịch làm việc, mỗi tab một cấu trúc riêng (dữ liệu lấy từ Plan nội dung):
// - Lịch đăng: bài theo ngày đăng, tick riêng từng kênh Facebook / TikTok (đủ 2 kênh = "Đã xong").
// - Lịch quay: buổi quay theo ngày (giờ, địa điểm, ngày đăng), tick "Đã quay", link REF + Kịch bản.
// - Kịch bản: theo hạn kịch bản (tự tính theo ngày đăng/quay hoặc chọn riêng), người viết, tick "Kịch bản xong".
import { forbidden } from '#lib/errors.js';
import { addDays, isISODate, todayISO } from '#lib/dates.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import * as tasksRepo from '#modules/tasks/tasks.repo.js';
import { BRANDS, extraReferences } from './plan.schema.js';
import * as repo from './plan.repo.js';
import { getPlan } from './plan.service.js';
import { parseTimeRange, syncPlan } from './plan.sync.js';

/** Kịch bản phải xong trước ngày đăng bao nhiêu ngày (và trước ngày quay 1 ngày). */
export const SCRIPT_LEAD_DAYS = 3;

export const CHANNELS = [
  { value: 'fb', label: 'Facebook', column: 'posted_fb' },
  { value: 'tt', label: 'TikTok', column: 'posted_tt' },
];

const posted = (p) => p.status === 'posted';
export const channelDone = (p, ch) => posted(p) || Boolean(p[CHANNELS.find((c) => c.value === ch).column]);
export const isFilmed = (p) => (p.filmed != null ? Boolean(p.filmed) : p.shoot_task_status === 'done' || posted(p));
export const isScriptDone = (p) => (p.script_done != null ? Boolean(p.script_done) : isFilmed(p));

/** Hạn kịch bản: ngày chọn riêng, không thì trước ngày đăng SCRIPT_LEAD_DAYS ngày (và không muộn hơn ngày trước buổi quay). */
export function autoScriptDeadline(p) {
  const options = [p.post_date && addDays(p.post_date, -SCRIPT_LEAD_DAYS), p.shoot_date && addDays(p.shoot_date, -1)].filter(Boolean);
  return options.length ? options.sort()[0] : null;
}
export const scriptDeadline = (p) => p.script_deadline || autoScriptDeadline(p);

/** Tick được: người sửa được nội dung, hoặc người đăng / quay / viết kịch bản của nội dung đó. */
export const canTick = (user, p) =>
  isManager(user) || [p.created_by, p.owner_id, p.poster_id, p.shooter_id, p.writer_id].includes(user.id);

async function tickablePlan(id, user) {
  const plan = await getPlan(id);
  if (!canTick(user, plan)) throw forbidden('Bạn chỉ tick được nội dung mình phụ trách, đăng, quay hoặc viết kịch bản.');
  return plan;
}

/** Bật/tắt một ô tick: field = 'fb' | 'tt' | 'filmed' | 'script'. */
export async function tick(id, field, on, user) {
  const plan = await tickablePlan(id, user);
  const value = Boolean(on);
  if (field === 'fb' || field === 'tt') {
    const next = Object.fromEntries(CHANNELS.map((c) => [c.column, c.value === field ? value : channelDone(plan, c.value)]));
    const both = next.posted_fb && next.posted_tt;
    const status = both ? 'posted' : posted(plan) ? 'selected' : plan.status === 'idea' ? 'selected' : plan.status;
    await repo.updateChannels(plan.id, { ...next, status });
    if (status !== plan.status) await syncPlan(plan.id);
  } else if (field === 'filmed') {
    // Có việc "Quay" trên lịch thì tick luôn việc đó (2 nơi khớp nhau); không thì lưu ở Plan.
    if (plan.shoot_task_id) {
      await tasksRepo.updateStatus(plan.shoot_task_id, value ? 'done' : 'todo');
      await repo.updateFilmed(plan.id, null);
    } else await repo.updateFilmed(plan.id, value ? 1 : 0);
  } else if (field === 'script') {
    await repo.updateScriptDone(plan.id, value ? 1 : 0);
  }
  return plan;
}

/** Chọn hạn kịch bản riêng ('' = về tự động). */
export async function setScriptDeadline(id, date, user) {
  const plan = await tickablePlan(id, user);
  await repo.updateScriptDeadline(plan.id, isISODate(date) ? date : null);
  return plan;
}

// ---- Dữ liệu cho từng tab ----

const BRAND = Object.fromEntries(BRANDS.map((b) => [b.value, b]));
const NO_BRAND = { value: '', label: 'Chưa gắn brand', short: '?', badge: 'badge-gray' };
const brandOf = (p) => BRAND[p.brand] ?? NO_BRAND;
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const isLink = (v) => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
const firstRef = (p) => [p.reference_url, ...extraReferences(p.extra_reference_urls)].find(isLink) ?? null;
// Bộ lọc brand dùng chung với Lịch làm việc: tên brand, 'none' (chưa gắn) hoặc '' (tất cả)
const matchBrand = (brand) => (p) => !brand || (brand === 'none' ? !BRAND[p.brand] : p.brand === brand);

/** Thông tin chung của một thẻ. */
function card(p, user, today) {
  const brand = brandOf(p);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    brandInfo: brand,
    brandKey: BRAND[p.brand] ? brand.short.toLowerCase() : 'none',
    canTick: canTick(user, p),
    postDM: ddmm(p.post_date),
    shootDM: ddmm(p.shoot_date),
    refUrl: firstRef(p),
    scriptUrl: isLink(p.script) ? p.script.trim() : null,
    scriptText: p.script && !isLink(p.script) ? p.script : null,
    writer: p.writer_name,
    today,
  };
}

const KINDS = {
  dang: {
    person: (p) => [p.poster_id ?? p.owner_id],
    day: (p) => p.post_date,
    build(p, base, today) {
      const channels = CHANNELS.map((c) => ({ ...c, done: channelDone(p, c.value) }));
      const done = channels.every((c) => c.done);
      return { ...base, channels, isDone: done, isLate: !done && p.post_date < today, time: p.post_time };
    },
  },
  quay: {
    person: (p) => [p.shooter_id ?? p.owner_id],
    day: (p) => p.shoot_date,
    build(p, base, today) {
      const done = isFilmed(p);
      const { start, end } = parseTimeRange(p.shoot_time);
      const time = start ? `${start}${end ? `–${end}` : ''}` : p.shoot_time;
      return { ...base, isDone: done, isLate: !done && p.shoot_date < today, time, sortTime: start ?? '~', location: p.location };
    },
  },
  'kich-ban': {
    person: (p) => [p.writer_id ?? p.owner_id],
    day: scriptDeadline,
    build(p, base, today) {
      const done = isScriptDone(p);
      const deadline = scriptDeadline(p);
      return { ...base, isDone: done, isLate: !done && deadline < today, deadline, deadlineDM: ddmm(deadline), customDeadline: Boolean(p.script_deadline) };
    },
  },
};
export const isBoardTab = (tab) => Boolean(KINDS[tab]);

/**
 * Lịch tuần của một tab: 7 ngày, mỗi ngày các thẻ của tab đó. personId: chỉ nội dung người đó đăng/quay/viết.
 * Kèm thống kê cho cột bên phải.
 */
export async function getBoard(tab, { days, brand = '', personId = null }, user) {
  const kind = KINDS[tab];
  const today = todayISO();
  // Hạn kịch bản sớm hơn ngày đăng/quay nên lấy rộng thêm 2 tuần sau rồi lọc lại.
  const rows = (await repo.listForBoard({ from: days[0], to: addDays(days[6], 14) })).filter(
    (p) => matchBrand(brand)(p) && (!personId || kind.person(p).includes(personId)),
  );
  const inRange = (from, to) => rows.filter((p) => kind.day(p) && kind.day(p) >= from && kind.day(p) <= to);
  const items = inRange(days[0], days[6]).map((p) => ({ ...kind.build(p, card(p, user, today), today), day: kind.day(p) }));
  if (tab === 'quay') items.sort((a, b) => a.sortTime.localeCompare(b.sortTime));

  const brandRows = (cols) =>
    [...BRANDS, NO_BRAND]
      .map((b) => {
        const mine = items.filter((i) => i.brandInfo === b);
        return { ...b, total: mine.length, cols: cols.map((fn) => mine.filter(fn).length) };
      })
      .filter((b) => b.total);

  const stats = { total: items.length, done: items.filter((i) => i.isDone).length };
  if (tab === 'dang') {
    stats.channels = CHANNELS.map((c, i) => {
      const done = items.filter((it) => it.channels[i].done).length;
      return { ...c, total: items.length, done, percent: items.length ? Math.round((done / items.length) * 100) : 0 };
    });
    stats.brands = brandRows(CHANNELS.map((_, i) => (it) => it.channels[i].done));
  } else stats.brands = brandRows([(it) => it.isDone]);

  let extra = [];
  if (tab === 'quay') {
    // Bài sắp đăng (từ hôm nay tới 2 tuần sau tuần này) chưa có ngày quay
    const from = days[0] > today ? days[0] : today;
    extra = (await repo.listUpcomingWithoutShoot(from))
      .filter((p) => p.post_date <= addDays(days[6], 14) && matchBrand(brand)(p))
      .map((p) => card(p, user, today));
  } else if (tab === 'kich-ban') {
    // Kịch bản chưa xong, hạn trong 7 ngày tới (tính từ hôm nay)
    const soon = await repo.listForBoard({ from: today, to: addDays(today, 7 + 14) });
    extra = soon
      .filter((p) => matchBrand(brand)(p) && !isScriptDone(p) && scriptDeadline(p) >= today && scriptDeadline(p) <= addDays(today, 7))
      .sort((a, b) => scriptDeadline(a).localeCompare(scriptDeadline(b)))
      .map((p) => ({ ...card(p, user, today), deadlineDM: ddmm(scriptDeadline(p)) }));
  }

  return {
    days: days.map((d) => {
      const list = items.filter((i) => i.day === d);
      return { date: d, ddmm: ddmm(d), isToday: d === today, isPast: d < today, items: list, unfinished: list.filter((i) => !i.isDone).length };
    }),
    stats,
    extra,
    leadDays: SCRIPT_LEAD_DAYS,
  };
}
