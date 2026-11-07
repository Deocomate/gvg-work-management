// Nghiệp vụ Plan nội dung: kho ý tưởng (Idea bank), lịch quay/đăng bài và Plan tuần
// (thay cho Google Sheet "Idea bank - Gốm Vũ Gia, Klayy & GSXD").
// Ai đăng nhập cũng xem và thêm được ý tưởng. Sửa/đổi trạng thái: quản lý, người tạo, người phụ trách.
// Xoá: quản lý hoặc người tạo.
import { readFile } from 'node:fs/promises';
import { forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { foldText } from '#lib/text.js';
import { monthGrid, todayISO, addMonths, daysBetween, weekdayOf } from '#lib/dates.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import { BRANDS, CONTENT_LINES, PLAN_STATUSES, PLATFORMS, planSchema } from './plan.schema.js';
import * as repo from './plan.repo.js';

const byValue = (list) => Object.fromEntries(list.map((o) => [o.value, o]));
const STATUS = byValue(PLAN_STATUSES);
const PLATFORM = byValue(PLATFORMS);
const BRAND = byValue(BRANDS);
// Đã quay / đăng / bỏ = không còn phải lo lịch quay nữa.
const DONE_SHOOTING = new Set(['filmed', 'posted', 'dropped']);
const CLOSED = new Set(['posted', 'dropped']);
// Còn ở giai đoạn ý tưởng (chưa có ngày thì nằm trong Idea bank).
const IDEA_STAGES = new Set(['idea', 'selected', 'scripted']);

export const canEdit = (user, plan) =>
  isManager(user) || plan.created_by === user.id || (plan.owner_id != null && plan.owner_id === user.id);
export const canDelete = (user, plan) => isManager(user) || plan.created_by === user.id;

/** Thêm thông tin hiển thị (nhãn, màu, quyền) cho view. */
export const decorate = (plan, user) => ({
  ...plan,
  statusInfo: STATUS[plan.status],
  platformInfo: PLATFORM[plan.platform],
  canEdit: canEdit(user, plan),
  canDelete: canDelete(user, plan),
});

// Bộ lọc trạng thái ở Idea bank. 'unscheduled' (mặc định) = ý tưởng chưa có ngày quay/đăng.
export const STATUS_FILTERS = [
  { value: 'unscheduled', label: 'Chưa lên lịch' },
  { value: 'active', label: 'Đang làm' },
  ...PLAN_STATUSES.map(({ value, label }) => ({ value, label })),
  { value: 'all', label: 'Tất cả' },
];

const matchesStatus = (plan, filter) => {
  if (filter === 'all') return true;
  if (filter === 'unscheduled') return IDEA_STAGES.has(plan.status) && !plan.shoot_date && !plan.post_date;
  if (filter === 'active') return !CLOSED.has(plan.status) && plan.status !== 'idea';
  return plan.status === filter;
};

const searchText = (p) =>
  [p.title, p.description, p.topic, p.brand, p.note, p.script, p.reference_url, p.location, p.owner_name, p.proposer_name, p.writer_name].join(' ');

/**
 * Trang Idea bank: lọc theo trạng thái, brand, kênh, tuyến nội dung và tìm không dấu.
 * Số ý tưởng nhỏ (vài trăm) nên lọc trong JS để bỏ dấu tiếng Việt (SQLite LIKE không làm được).
 */
export async function browseIdeas({ status, platform, topic, brand, q } = {}, user) {
  const [plans, topics] = await Promise.all([repo.listAll(), repo.listTopics()]);
  const filter = STATUS_FILTERS.some((f) => f.value === status) ? status : 'unscheduled';
  const words = foldText(q).split(/\s+/).filter(Boolean);

  const counts = Object.fromEntries(STATUS_FILTERS.map((f) => [f.value, plans.filter((p) => matchesStatus(p, f.value)).length]));
  const shown = plans.filter(
    (p) =>
      matchesStatus(p, filter) &&
      (!PLATFORM[platform] || p.platform === platform) &&
      (!topic || p.topic === topic) &&
      (!BRAND[brand] || p.brand === brand) &&
      (!words.length || words.every((w) => foldText(searchText(p)).includes(w))),
  );

  return {
    plans: shown.map((p) => decorate(p, user)),
    statusFilters: STATUS_FILTERS.map((f) => ({ ...f, total: counts[f.value] })),
    status: filter,
    platform: PLATFORM[platform] ? platform : '',
    topic: topic ?? '',
    topics,
    brand: BRAND[brand] ? brand : '',
    query: q?.trim() ?? '',
  };
}

/** Gợi ý "Tuyến nội dung": danh mục có sẵn + tuyến mọi người đã gõ thêm. */
export async function listTopics() {
  const used = (await repo.listTopics()).map((t) => t.topic);
  return [...new Set([...CONTENT_LINES, ...used])];
}

const CHIPS_PER_DAY = 4;

/** Lịch tháng: mỗi ngày liệt kê nội dung cần quay (🎬) và cần đăng (📤). */
export async function getMonth(month, user) {
  const weeks = monthGrid(month);
  const today = todayISO();
  const plans = await repo.listForRange({ from: weeks[0][0], to: weeks.at(-1)[6] });

  const byDate = new Map();
  const add = (date, entry) => byDate.set(date, [...(byDate.get(date) ?? []), entry]);
  for (const plan of plans) {
    const item = decorate(plan, user);
    if (plan.shoot_date) add(plan.shoot_date, { ...item, kind: 'shoot' });
    if (plan.post_date) add(plan.post_date, { ...item, kind: 'post' });
  }

  const toCell = (date) => {
    // Đăng bài trước (có giờ), quay sau.
    const list = (byDate.get(date) ?? []).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'post' ? -1 : 1));
    return {
      date,
      day: Number(date.slice(8)),
      inMonth: date.startsWith(month),
      isToday: date === today,
      total: list.length,
      shoots: list.filter((e) => e.kind === 'shoot').length,
      posts: list.filter((e) => e.kind === 'post').length,
      entries: list.slice(0, CHIPS_PER_DAY),
      more: Math.max(0, list.length - CHIPS_PER_DAY),
    };
  };

  const inMonth = plans.filter((p) => p.shoot_date?.startsWith(month) || p.post_date?.startsWith(month));
  // Danh sách theo ngày dưới lịch (điện thoại chỉ thấy số trong ô lịch).
  const agenda = [...byDate.keys()]
    .filter((date) => date.startsWith(month))
    .sort()
    .map((date) => ({ date, isToday: date === today, isPast: date < today, entries: byDate.get(date) }));
  return {
    agenda,
    weeks: weeks.map((week) => week.map(toCell)),
    prev: addMonths(month, -1),
    next: addMonths(month, 1),
    thisMonth: today.slice(0, 7),
    summary: {
      shoots: inMonth.filter((p) => p.shoot_date?.startsWith(month)).length,
      posts: inMonth.filter((p) => p.post_date?.startsWith(month)).length,
      posted: inMonth.filter((p) => p.post_date?.startsWith(month) && p.status === 'posted').length,
    },
  };
}

// ---- Plan tuần (thay tab Plan + Lịch quay của Google Sheet cũ) ----

const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const dayMonth = (iso) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

/**
 * Các tuần của tháng, đánh số như Sheet cũ: tuần (T2 → CN) thuộc tháng chứa ngày Thứ 5 của nó.
 * VD tháng 11/2026: Tuần 1 = 02/11 – 08/11 (tuần 26/10 – 01/11 là Tuần 5 của tháng 10).
 */
export function weeksOfMonth(month) {
  const around = [...monthGrid(addMonths(month, -1)), ...monthGrid(month), ...monthGrid(addMonths(month, 1))];
  const seen = new Set();
  return around
    .filter((days) => days[3].startsWith(month) && !seen.has(days[0]) && seen.add(days[0]))
    .map((days, i) => ({
      days,
      label: `Tuần ${i + 1} (tháng ${Number(month.slice(5))})`,
      range: `${dayMonth(days[0])} – ${dayMonth(days[6])}/${days[6].slice(0, 4)}`,
    }));
}

/** Cảnh báo giống Sheet cũ: chưa có ngày quay, quay sát ngày đăng (< 2 ngày), quá ngày đăng mà chưa đăng. */
function withChecks(plan, today) {
  const leadDays = plan.shoot_date && plan.post_date ? daysBetween(plan.shoot_date, plan.post_date) : null;
  return {
    ...plan,
    leadDays,
    shootTight: leadDays != null && leadDays < 2 && !DONE_SHOOTING.has(plan.status),
    missingShoot: Boolean(plan.post_date) && !plan.shoot_date && !DONE_SHOOTING.has(plan.status),
    overdue: Boolean(plan.post_date) && plan.post_date < today && !CLOSED.has(plan.status),
  };
}

/** Đánh dấu 1 người bị xếp quay cùng ngày, cùng khung giờ ở 2 địa điểm khác nhau. */
function markConflicts(rows) {
  const keyOf = (p) => (p.owner_id && p.shoot_date && p.shoot_time ? `${p.owner_id}|${p.shoot_date}|${foldText(p.shoot_time)}` : null);
  const places = new Map();
  for (const p of rows) {
    const key = keyOf(p);
    if (key) places.set(key, new Set([...(places.get(key) ?? []), foldText(p.location)]));
  }
  return rows.map((p) => ({ ...p, conflict: Boolean(keyOf(p)) && places.get(keyOf(p)).size > 1 }));
}

export const WEEK_VIEWS = [
  { value: 'post', label: '📤 Theo ngày đăng' },
  { value: 'shoot', label: '🎬 Lịch quay' },
];

/**
 * Tab "Plan tuần". by = 'post': bảng theo tuần, xếp theo ngày + giờ đăng (như tab Plan của Sheet).
 * by = 'shoot': xếp theo ngày quay → khung giờ → địa điểm (như tab Lịch quay), kèm video sắp đăng chưa có ngày quay.
 */
export async function getWeeks(month, by, user) {
  const view = WEEK_VIEWS.some((v) => v.value === by) ? by : 'post';
  const dateKey = view === 'shoot' ? 'shoot_date' : 'post_date';
  const today = todayISO();
  const weeks = weeksOfMonth(month);
  const from = weeks[0].days[0];
  const to = weeks.at(-1).days[6];
  const inRange = (date) => Boolean(date) && date >= from && date <= to;

  const all = markConflicts((await repo.listForRange({ from, to })).map((p) => decorate(withChecks(p, today), user)));
  const sortKey =
    view === 'shoot'
      ? (p) => [p.shoot_date, p.shoot_time ?? '~', foldText(p.location) || '~'].join('|')
      : (p) => [p.post_date, p.post_time ?? '~'].join('|');
  const rows = all.filter((p) => inRange(p[dateKey])).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const posts = all.filter((p) => inRange(p.post_date));

  return {
    view,
    views: WEEK_VIEWS,
    weeks: weeks.map((w) => ({
      ...w,
      isCurrent: today >= w.days[0] && today <= w.days[6],
      items: rows
        .filter((p) => p[dateKey] >= w.days[0] && p[dateKey] <= w.days[6])
        .map((p) => ({ ...p, weekday: WEEKDAY_NAMES[weekdayOf(p[dateKey])] })),
    })),
    unshot:
      view === 'shoot' ? (await repo.listUpcomingWithoutShoot(today)).map((p) => decorate(withChecks(p, today), user)) : [],
    summary: {
      posts: posts.length,
      posted: posts.filter((p) => p.status === 'posted').length,
      missingShoot: posts.filter((p) => p.missingShoot).length,
      overdue: posts.filter((p) => p.overdue).length,
      conflicts: rows.filter((p) => p.conflict).length,
    },
    prev: addMonths(month, -1),
    next: addMonths(month, 1),
    thisMonth: today.slice(0, 7),
  };
}

export async function getPlan(id) {
  const plan = await repo.findById(id);
  if (!plan) throw notFound('Không tìm thấy nội dung này.');
  return plan;
}

export async function getEditablePlan(id, user) {
  const plan = await getPlan(id);
  if (!canEdit(user, plan)) throw forbidden('Bạn chỉ sửa được nội dung mình tạo hoặc mình phụ trách.');
  return plan;
}

/** Ý tưởng "Mới" vừa được gắn ngày quay/đăng thì tự chuyển sang "Đã lên lịch". */
function prepare(input) {
  const result = validate(planSchema, input);
  if (!result.ok) return result;
  const data = result.data;
  if (data.status === 'idea' && (data.shoot_date || data.post_date)) data.status = 'scheduled';
  return { ok: true, data };
}

export async function createPlan(input, user) {
  const result = prepare(input);
  if (!result.ok) return result;
  // Không chọn "Người góp" thì là người đang nhập.
  const data = { ...result.data, proposer_id: result.data.proposer_id ?? user.id };
  return { ok: true, data: await repo.create(data, user.id) };
}

export async function updatePlan(id, input, user) {
  await getEditablePlan(id, user);
  const result = prepare(input);
  if (!result.ok) return result;
  const plan = await repo.update(id, result.data);
  if (!plan) throw notFound('Không tìm thấy nội dung này.');
  return { ok: true, data: plan };
}

export async function changeStatus(id, status, user) {
  const plan = await getEditablePlan(id, user);
  if (!STATUS[status]) return { ok: false, errors: { status: 'Trạng thái không hợp lệ' } };
  await repo.updateStatus(id, status);
  return { ok: true, data: { ...plan, status, statusInfo: STATUS[status] } };
}

export async function deletePlan(id, user) {
  const plan = await getPlan(id);
  if (!canDelete(user, plan)) throw forbidden('Chỉ quản lý hoặc người tạo mới xoá được.');
  await repo.remove(id);
  return plan;
}
