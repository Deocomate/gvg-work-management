// Tab Plan: Idea bank dạng cột theo bước (/plan) và Lịch quay/đăng — tuần (/plan/weeks) hoặc tháng (/plan/calendar).
import { safeBack } from '#lib/redirect.js';
import { isISODate } from '#lib/dates.js';
import { parseMonth } from '#modules/schedule/schedule.service.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import { BRANDS, PLATFORMS, PLAN_STATUSES, VIDEO_TYPES } from './plan.schema.js';
import * as service from './plan.service.js';
import { importFromSheet } from './plan.import.js';

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const str = (v) => (typeof v === 'string' ? v.slice(0, 100) : '');

/** Sau khi lưu: có ngày đăng thì về tuần đó trên Lịch đăng, chỉ có ngày quay thì Lịch quay, không thì Idea bank. */
const afterSave = (plan) => {
  if (plan.post_date) return `/plan/weeks?kind=post&week=${plan.post_date}`;
  if (plan.shoot_date) return `/plan/weeks?kind=shoot&week=${plan.shoot_date}`;
  return '/plan';
};

const KIND_TEXT = {
  post: { title: 'Lịch đăng', subtitle: 'Bài cần đăng theo ngày, chia theo brand', icon: '📤', verb: 'Đăng', dateParam: 'post_date', unit: 'bài cần đăng', done: 'đã đăng' },
  shoot: { title: 'Lịch quay', subtitle: 'Buổi quay theo ngày, khung giờ, địa điểm, chia theo brand', icon: '🎬', verb: 'Quay', dateParam: 'shoot_date', unit: 'buổi quay', done: 'đã quay' },
};

/** Dữ liệu chung cho thanh chuyển Tuần/Tháng + brand trên 2 lịch. */
function calendarNav({ kind, brand, view, week, month }) {
  const q = (extra) => new URLSearchParams({ kind, ...(brand ? { brand } : {}), ...extra }).toString();
  const here = view === 'week' ? (b) => `/plan/weeks?${q({ week, ...(b ? { brand: b } : {}) })}` : (b) => `/plan/calendar?${q({ month, ...(b ? { brand: b } : {}) })}`;
  const all = view === 'week' ? `/plan/weeks?kind=${kind}&week=${week}` : `/plan/calendar?kind=${kind}&month=${month}`;
  return {
    tab: kind,
    view,
    kind,
    brand,
    text: KIND_TEXT[kind],
    statusLegend: PLAN_STATUSES.filter((s) => s.value !== 'dropped'),
    weekHref: `/plan/weeks?${q({ week: week ?? `${month}-01` })}`,
    monthHref: `/plan/calendar?${q({ month: month ?? week.slice(0, 7) })}`,
    brandLinks: [
      { label: 'Tất cả brand', href: all, active: !brand },
      ...BRANDS.map((b) => ({ label: b.label, href: here(b.value), active: brand === b.value })),
    ],
  };
}

// Form gọn: mỗi nhóm ô là một mục gập lại, tự mở khi đã có dữ liệu hoặc có lỗi.
const SECTION_FIELDS = {
  idea: ['proposer_id', 'note'],
  script: ['writer_id', 'script'],
  shoot: ['shoot_date', 'shoot_time', 'location', 'props'],
  post: ['post_date', 'source_url', 'post_url'],
};
const openSections = (values, errors) =>
  Object.fromEntries(Object.entries(SECTION_FIELDS).map(([name, fields]) => [name, fields.some((f) => values[f] || errors[f])]));

async function renderForm(req, res, { plan = null, values = {}, errors = {}, status = 200 }) {
  const [owners, topics] = await Promise.all([staffOptions(), service.listTopics()]);
  res.status(status).render('plan/form', {
    title: plan ? 'Sửa nội dung' : 'Thêm ý tưởng',
    plan,
    values,
    errors,
    open: openSections(values, errors),
    back: safeBack(values.back, '/plan'),
    platformOptions: PLATFORMS,
    statusOptions: PLAN_STATUSES,
    ownerOptions: owners.map((o) => ({ ...o, value: String(o.value) })),
    brandOptions: BRANDS,
    videoTypeOptions: VIDEO_TYPES,
    topics,
  });
}

export async function index(req, res) {
  const { brand, topic, owner, q, dropped } = req.query;
  const [data, owners] = await Promise.all([
    service.getBoard({ brand: str(brand), topic: str(topic), owner: str(owner), q: str(q), dropped: dropped === '1' }, req.user),
    staffOptions(),
  ]);
  res.render('plan/index', {
    title: 'Idea bank',
    tab: 'ideas',
    ...data,
    brandOptions: BRANDS,
    ownerOptions: owners.map((o) => ({ ...o, value: String(o.value) })),
    filtered: Boolean(data.brand || data.topic || data.owner || data.query),
    canImport: isManager(req.user),
    back: req.originalUrl,
  });
}

export async function weeks(req, res) {
  const kind = service.calendarKind(req.query.kind);
  const brand = service.brandFilter(req.query.brand);
  const data = await service.getWeek(str(req.query.week), { kind, brand }, req.user);
  res.render('plan/weeks', {
    title: KIND_TEXT[kind].title,
    ...data,
    ...calendarNav({ kind, brand, view: 'week', week: data.week }),
    back: req.originalUrl,
  });
}

export async function calendar(req, res) {
  const month = parseMonth(req.query.month);
  const kind = service.calendarKind(req.query.kind);
  const brand = service.brandFilter(req.query.brand);
  const data = await service.getMonth(month, { kind, brand }, req.user);
  const [year, monthNumber] = month.split('-');
  res.render('plan/calendar', {
    title: KIND_TEXT[kind].title,
    ...data,
    ...calendarNav({ kind, brand, view: 'month', month }),
    month,
    monthLabel: `Tháng ${Number(monthNumber)}/${year}`,
    weekdayLabels: WEEKDAY_LABELS,
    back: req.originalUrl,
  });
}

export async function importSheet(req, res) {
  const { added, skipped, unknown } = await importFromSheet(req.user);
  let message = `Đã nhập ${added} nội dung từ Google Sheet${skipped ? ` (bỏ qua ${skipped} dòng đã có)` : ''}.`;
  if (unknown.length) message += ` Chưa có tài khoản: ${unknown.join(', ')} — tên được ghi vào Ghi chú.`;
  req.flash('success', message);
  res.redirect('/plan');
}

export function newForm(req, res) {
  const values = { platform: 'tiktok', status: 'idea', back: req.query.back };
  // Bấm "+" ở một ngày trên lịch -> điền sẵn ngày đăng / ngày quay
  if (isISODate(req.query.post_date)) values.post_date = req.query.post_date;
  if (isISODate(req.query.shoot_date)) values.shoot_date = req.query.shoot_date;
  // Bấm + ở hàng của một brand -> chọn sẵn brand đó
  if (service.brandFilter(req.query.brand)) values.brand = req.query.brand;
  return renderForm(req, res, { values });
}

export async function create(req, res) {
  const result = await service.createPlan(req.body, req.user);
  if (!result.ok) return renderForm(req, res, { values: req.body, errors: result.errors, status: 422 });
  req.flash('success', `Đã thêm "${result.data.title}".`);
  res.redirect(safeBack(req.body.back, afterSave(result.data)));
}

export async function editForm(req, res) {
  const plan = await service.getEditablePlan(req.params.id, req.user);
  return renderForm(req, res, {
    plan,
    values: {
      ...plan,
      ...Object.fromEntries(['owner_id', 'proposer_id', 'writer_id'].map((f) => [f, plan[f] ? String(plan[f]) : ''])),
      back: req.query.back,
    },
  });
}

export async function update(req, res) {
  const id = req.params.id;
  const result = await service.updatePlan(id, req.body, req.user);
  if (!result.ok) {
    const plan = await service.getPlan(id);
    return renderForm(req, res, { plan, values: req.body, errors: result.errors, status: 422 });
  }
  req.flash('success', 'Đã lưu thay đổi.');
  res.redirect(safeBack(req.body.back, afterSave(result.data)));
}

export async function setStatus(req, res) {
  const result = await service.changeStatus(req.params.id, req.body.status, req.user);
  if (result.ok) req.flash('success', `"${result.data.title}" → ${result.data.statusInfo.label}.`);
  else req.flash('error', result.errors.status);
  res.redirect(safeBack(req.body.back, '/plan'));
}

export async function destroy(req, res) {
  const plan = await service.deletePlan(req.params.id, req.user);
  req.flash('success', `Đã xoá "${plan.title}".`);
  res.redirect(safeBack(req.body.back, '/plan'));
}
