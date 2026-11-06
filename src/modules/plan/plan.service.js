// Nghiệp vụ Plan nội dung: kho ý tưởng (Idea bank) + lịch quay/đăng bài.
// Ai đăng nhập cũng xem và thêm được ý tưởng. Sửa/đổi trạng thái: quản lý, người tạo, người phụ trách.
// Xoá: quản lý hoặc người tạo.
import { forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { foldText } from '#lib/text.js';
import { monthGrid, todayISO, addMonths } from '#lib/dates.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import { PLAN_STATUSES, PLATFORMS, planSchema } from './plan.schema.js';
import * as repo from './plan.repo.js';

const byValue = (list) => Object.fromEntries(list.map((o) => [o.value, o]));
const STATUS = byValue(PLAN_STATUSES);
const PLATFORM = byValue(PLATFORMS);

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
  if (filter === 'unscheduled') return plan.status === 'idea' && !plan.shoot_date && !plan.post_date;
  if (filter === 'active') return ['scheduled', 'filmed'].includes(plan.status);
  return plan.status === filter;
};

/**
 * Trang Idea bank: lọc theo trạng thái, kênh, nhóm và tìm không dấu.
 * Số ý tưởng nhỏ (vài trăm) nên lọc trong JS để bỏ dấu tiếng Việt (SQLite LIKE không làm được).
 */
export async function browseIdeas({ status, platform, topic, q } = {}, user) {
  const [plans, topics] = await Promise.all([repo.listAll(), repo.listTopics()]);
  const filter = STATUS_FILTERS.some((f) => f.value === status) ? status : 'unscheduled';
  const words = foldText(q).split(/\s+/).filter(Boolean);

  const counts = Object.fromEntries(STATUS_FILTERS.map((f) => [f.value, plans.filter((p) => matchesStatus(p, f.value)).length]));
  const shown = plans.filter(
    (p) =>
      matchesStatus(p, filter) &&
      (!PLATFORM[platform] || p.platform === platform) &&
      (!topic || p.topic === topic) &&
      (!words.length || words.every((w) => foldText([p.title, p.description, p.topic, p.owner_name].join(' ')).includes(w))),
  );

  return {
    plans: shown.map((p) => decorate(p, user)),
    statusFilters: STATUS_FILTERS.map((f) => ({ ...f, total: counts[f.value] })),
    status: filter,
    platform: PLATFORM[platform] ? platform : '',
    topic: topic ?? '',
    topics,
    query: q?.trim() ?? '',
  };
}

export const listTopics = () => repo.listTopics();

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

/** Ý tưởng vừa được gắn ngày quay/đăng thì tự chuyển sang "Đã lên lịch". */
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
  return { ok: true, data: await repo.create(result.data, user.id) };
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
