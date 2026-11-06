// Tab Plan: Idea bank (/plan) và Lịch quay/đăng (/plan/calendar).
import { safeBack } from '#lib/redirect.js';
import { isISODate } from '#lib/dates.js';
import { parseMonth } from '#modules/schedule/schedule.service.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import { PLATFORMS, PLAN_STATUSES } from './plan.schema.js';
import * as service from './plan.service.js';

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const str = (v) => (typeof v === 'string' ? v.slice(0, 100) : '');

/** Sau khi lưu: có ngày đăng/quay thì về đúng tháng trên lịch, không thì về Idea bank. */
const afterSave = (plan) => {
  const date = plan.post_date || plan.shoot_date;
  return date ? `/plan/calendar?month=${date.slice(0, 7)}` : '/plan';
};

async function renderForm(req, res, { plan = null, values = {}, errors = {}, status = 200 }) {
  const [owners, topics] = await Promise.all([staffOptions(), service.listTopics()]);
  res.status(status).render('plan/form', {
    title: plan ? 'Sửa nội dung' : 'Thêm ý tưởng',
    plan,
    values,
    errors,
    back: safeBack(values.back, '/plan'),
    platformOptions: PLATFORMS,
    statusOptions: PLAN_STATUSES,
    ownerOptions: owners.map((o) => ({ ...o, value: String(o.value) })),
    topics,
  });
}

export async function index(req, res) {
  const { status, platform, topic, q } = req.query;
  const data = await service.browseIdeas({ status: str(status), platform: str(platform), topic: str(topic), q: str(q) }, req.user);
  res.render('plan/index', {
    title: 'Idea bank',
    tab: 'ideas',
    ...data,
    platformOptions: PLATFORMS,
    filtered: Boolean(data.platform || data.topic || data.query),
    back: req.originalUrl,
  });
}

export async function calendar(req, res) {
  const month = parseMonth(req.query.month);
  const data = await service.getMonth(month, req.user);
  const [year, monthNumber] = month.split('-');
  res.render('plan/calendar', {
    title: 'Lịch quay / đăng',
    tab: 'calendar',
    ...data,
    month,
    monthLabel: `Tháng ${Number(monthNumber)}/${year}`,
    weekdayLabels: WEEKDAY_LABELS,
    back: req.originalUrl,
  });
}

export function newForm(req, res) {
  const values = { platform: 'tiktok', status: 'idea', back: req.query.back };
  // Bấm "+" ở một ngày trên lịch -> điền sẵn ngày đăng
  if (isISODate(req.query.post_date)) values.post_date = req.query.post_date;
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
    values: { ...plan, owner_id: plan.owner_id ? String(plan.owner_id) : '', back: req.query.back },
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
