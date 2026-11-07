// Nghiệp vụ Plan nội dung (thay Google Sheet "Idea bank - Gốm Vũ Gia, Klayy & GSXD"):
// Idea bank dạng cột theo bước, lịch tuần / tháng quay + đăng. Việc quay/đăng tự lên lịch làm việc (plan.sync.js).
// Ai đăng nhập cũng xem và thêm được ý tưởng. Sửa/đổi trạng thái: quản lý, người tạo, người phụ trách.
// Xoá: quản lý hoặc người tạo.
import { forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { foldText } from '#lib/text.js';
import { monthGrid, todayISO, addDays, addMonths, daysBetween, isISODate, weekDays } from '#lib/dates.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import { BRANDS, CONTENT_LINES, PLAN_STATUSES, PLATFORMS, planSchema } from './plan.schema.js';
import * as repo from './plan.repo.js';
import { parseTimeRange, removePlanTasks, syncPlan } from './plan.sync.js';

const byValue = (list) => Object.fromEntries(list.map((o) => [o.value, o]));
const STATUS = byValue(PLAN_STATUSES);
const PLATFORM = byValue(PLATFORMS);
const BRAND = byValue(BRANDS);
// Đã quay / đăng / bỏ = không còn phải lo lịch quay nữa.
const DONE_SHOOTING = new Set(['filmed', 'posted', 'dropped']);
const CLOSED = new Set(['posted', 'dropped']);
// Còn ở giai đoạn ý tưởng: gắn ngày quay/đăng thì tự thành "Đã lên lịch".
const IDEA_STAGES = new Set(['idea', 'selected', 'scripted']);

export const canEdit = (user, plan) =>
  isManager(user) || plan.created_by === user.id || (plan.owner_id != null && plan.owner_id === user.id);
export const canDelete = (user, plan) => isManager(user) || plan.created_by === user.id;

// Nút "bước tiếp theo" trên thẻ ở Idea bank. edit = mở form để chọn ngày.
const NEXT_STEP = {
  idea: { status: 'selected', label: '👍 Chọn' },
  selected: { status: 'scripted', label: '✍ Xong kịch bản' },
  scripted: { edit: true, label: '📅 Lên lịch' },
  scheduled: { status: 'filmed', label: '🎬 Đã quay' },
  filmed: { status: 'posted', label: '✅ Đã đăng' },
};

/** Thêm thông tin hiển thị (nhãn, màu, quyền, bước tiếp) cho view. */
export const decorate = (plan, user) => ({
  ...plan,
  statusInfo: STATUS[plan.status],
  platformInfo: PLATFORM[plan.platform],
  nextStep: NEXT_STEP[plan.status] ?? null,
  canEdit: canEdit(user, plan),
  canDelete: canDelete(user, plan),
});

const searchText = (p) =>
  [p.title, p.description, p.topic, p.brand, p.note, p.script, p.reference_url, p.location, p.owner_name, p.proposer_name, p.writer_name].join(' ');

// Cột "Đã đăng" chỉ hiện bài mới nhất để bảng không dài mãi.
const POSTED_SHOWN = 12;

/**
 * Idea bank dạng bảng cột theo bước: Mới → Đã chọn → Đã viết kịch bản → Đã lên lịch → Đã quay → Đã đăng
 * (cột "Bỏ" chỉ hiện khi bật). Lọc brand, tuyến, người phụ trách và tìm không dấu.
 * Số ý tưởng nhỏ (vài trăm) nên lọc trong JS để bỏ dấu tiếng Việt (SQLite LIKE không làm được).
 */
export async function getBoard({ brand, topic, owner, q, dropped } = {}, user) {
  const [plans, topics] = await Promise.all([repo.listAll(), repo.listTopics()]);
  const words = foldText(q).split(/\s+/).filter(Boolean);
  const ownerId = Number(owner) || null;
  const shown = plans.filter(
    (p) =>
      (!BRAND[brand] || p.brand === brand) &&
      (!topic || p.topic === topic) &&
      (!ownerId || p.owner_id === ownerId || p.writer_id === ownerId) &&
      (!words.length || words.every((w) => foldText(searchText(p)).includes(w))),
  );

  const columns = PLAN_STATUSES.filter((s) => dropped || s.value !== 'dropped').map((s) => {
    let items = shown.filter((p) => p.status === s.value);
    if (s.value === 'posted') items.sort((a, b) => (b.post_date ?? '').localeCompare(a.post_date ?? ''));
    if (['scheduled', 'filmed'].includes(s.value)) {
      items.sort((a, b) => (a.post_date ?? a.shoot_date ?? '~').localeCompare(b.post_date ?? b.shoot_date ?? '~'));
    }
    const total = items.length;
    if (s.value === 'posted') items = items.slice(0, POSTED_SHOWN);
    return { ...s, total, more: total - items.length, items: items.map((p) => decorate(p, user)) };
  });

  return {
    columns,
    total: shown.length,
    brand: BRAND[brand] ? brand : '',
    topic: topic ?? '',
    topics,
    owner: ownerId ? String(ownerId) : '',
    query: q?.trim() ?? '',
    dropped: Boolean(dropped),
    droppedTotal: shown.filter((p) => p.status === 'dropped').length,
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

// ---- Lịch tuần (thay tab Plan + Lịch quay của Google Sheet cũ) ----

const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const dayMonth = (iso) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

/**
 * Tên tuần như Sheet cũ: tuần (T2 → CN) thuộc tháng chứa ngày Thứ 5 của nó.
 * VD 02/11 – 08/11/2026 = "Tuần 1 (tháng 11)"; 26/10 – 01/11/2026 = "Tuần 5 (tháng 10)".
 */
export function weekLabel(days) {
  const thursday = days[3];
  return {
    label: `Tuần ${Math.ceil(Number(thursday.slice(8)) / 7)} (tháng ${Number(thursday.slice(5, 7))})`,
    range: `${dayMonth(days[0])} – ${dayMonth(days[6])}/${days[6].slice(0, 4)}`,
  };
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

/**
 * Lịch tuần: 7 ngày, mỗi ngày liệt kê buổi quay 🎬 (khung giờ, địa điểm) và bài đăng 📤 (giờ đăng), xếp theo giờ.
 * Kèm cảnh báo và danh sách bài sắp đăng chưa chốt ngày quay.
 */
export async function getWeek(date, user) {
  const today = todayISO();
  const days = weekDays(isISODate(date) ? date : today);
  const inWeek = (d) => Boolean(d) && d >= days[0] && d <= days[6];
  const plans = markConflicts((await repo.listForRange({ from: days[0], to: days[6] })).map((p) => decorate(withChecks(p, today), user)));

  const entries = [];
  for (const p of plans) {
    if (inWeek(p.shoot_date)) {
      const { start, end } = parseTimeRange(p.shoot_time);
      entries.push({ ...p, kind: 'shoot', day: p.shoot_date, time: start ? `${start}${end ? `–${end}` : ''}` : p.shoot_time, sortTime: start });
    }
    if (inWeek(p.post_date)) entries.push({ ...p, kind: 'post', day: p.post_date, time: p.post_time, sortTime: p.post_time });
  }
  entries.sort((a, b) => (a.sortTime ?? '~').localeCompare(b.sortTime ?? '~') || (a.kind === 'shoot' ? -1 : 1));

  const from = days[0] > today ? days[0] : today;
  const unshot = (await repo.listUpcomingWithoutShoot(from))
    .filter((p) => p.post_date <= addDays(days[6], 14))
    .map((p) => decorate(p, user));
  const posts = plans.filter((p) => inWeek(p.post_date));

  return {
    ...weekLabel(days),
    days: days.map((d, i) => ({
      date: d,
      weekday: WEEKDAY_SHORT[i],
      dayMonth: dayMonth(d),
      isToday: d === today,
      isPast: d < today,
      entries: entries.filter((e) => e.day === d),
    })),
    unshot,
    summary: {
      shoots: plans.filter((p) => inWeek(p.shoot_date)).length,
      posts: posts.length,
      posted: posts.filter((p) => p.status === 'posted').length,
      missingShoot: posts.filter((p) => p.missingShoot).length,
      overdue: posts.filter((p) => p.overdue).length,
      conflicts: entries.filter((e) => e.kind === 'shoot' && e.conflict).length,
    },
    week: days[0],
    prev: addDays(days[0], -7),
    next: addDays(days[0], 7),
    thisWeek: weekDays(today)[0],
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

/** Ý tưởng (Mới / Đã chọn / Đã viết kịch bản) vừa được gắn ngày quay/đăng thì tự chuyển sang "Đã lên lịch". */
function prepare(input) {
  const result = validate(planSchema, input);
  if (!result.ok) return result;
  const data = result.data;
  if (IDEA_STAGES.has(data.status) && (data.shoot_date || data.post_date)) data.status = 'scheduled';
  return { ok: true, data };
}

export async function createPlan(input, user) {
  const result = prepare(input);
  if (!result.ok) return result;
  // Không chọn "Người góp" thì là người đang nhập.
  const data = { ...result.data, proposer_id: result.data.proposer_id ?? user.id };
  const plan = await repo.create(data, user.id);
  await syncPlan(plan.id);
  return { ok: true, data: plan };
}

export async function updatePlan(id, input, user) {
  await getEditablePlan(id, user);
  const result = prepare(input);
  if (!result.ok) return result;
  const plan = await repo.update(id, result.data);
  if (!plan) throw notFound('Không tìm thấy nội dung này.');
  await syncPlan(id);
  return { ok: true, data: plan };
}

export async function changeStatus(id, status, user) {
  const plan = await getEditablePlan(id, user);
  if (!STATUS[status]) return { ok: false, errors: { status: 'Trạng thái không hợp lệ' } };
  await repo.updateStatus(id, status);
  await syncPlan(id);
  return { ok: true, data: { ...plan, status, statusInfo: STATUS[status] } };
}

export async function deletePlan(id, user) {
  const plan = await getPlan(id);
  if (!canDelete(user, plan)) throw forbidden('Chỉ quản lý hoặc người tạo mới xoá được.');
  await removePlanTasks(id); // khoá ngoại cũng xoá, nhưng Turso không chắc bật PRAGMA foreign_keys
  await repo.remove(id);
  return plan;
}
