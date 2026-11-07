// Nghiệp vụ Plan nội dung (thay Google Sheet "Idea bank - Gốm Vũ Gia, Klayy & GSXD"):
// Idea bank dạng cột theo bước, lịch tuần / tháng quay + đăng. Việc quay/đăng tự lên lịch làm việc (plan.sync.js).
// Ai đăng nhập cũng xem và thêm được ý tưởng. Sửa/đổi trạng thái: quản lý, người tạo, người phụ trách.
// Xoá: quản lý hoặc người tạo.
import { forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { foldText } from '#lib/text.js';
import { monthGrid, todayISO, addDays, addMonths, daysBetween, isISODate, weekDays } from '#lib/dates.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import { BRANDS, PLAN_STATUSES, PLATFORMS, planSchema } from './plan.schema.js';
import * as repo from './plan.repo.js';
import { parseTimeRange, removePlanTasks, syncPlan } from './plan.sync.js';

const byValue = (list) => Object.fromEntries(list.map((o) => [o.value, o]));
const STATUS = byValue(PLAN_STATUSES);
const PLATFORM = byValue(PLATFORMS);
const BRAND = byValue(BRANDS);
// Đã quay / đăng / bỏ = không còn phải lo lịch quay nữa.
const DONE_SHOOTING = new Set(['filmed', 'posted', 'dropped']);
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
 * (cột "Bỏ" chỉ hiện khi bật). Lọc brand, người phụ trách và tìm không dấu.
 * Số ý tưởng nhỏ (vài trăm) nên lọc trong JS để bỏ dấu tiếng Việt (SQLite LIKE không làm được).
 */
export async function getBoard({ brand, owner, q, dropped } = {}, user) {
  const plans = await repo.listAll();
  const words = foldText(q).split(/\s+/).filter(Boolean);
  const ownerId = Number(owner) || null;
  const shown = plans.filter(
    (p) =>
      (!BRAND[brand] || p.brand === brand) &&
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
    owner: ownerId ? String(ownerId) : '',
    query: q?.trim() ?? '',
    dropped: Boolean(dropped),
    droppedTotal: shown.filter((p) => p.status === 'dropped').length,
  };
}

// ---- Lịch đăng và lịch quay (2 lịch riêng), chia theo brand ----

// kind: 'post' = lịch đăng (theo ngày + giờ đăng), 'shoot' = lịch quay (theo ngày quay, khung giờ, địa điểm).
export const calendarKind = (kind) => (kind === 'shoot' ? 'shoot' : 'post');
export const brandFilter = (brand) => (BRAND[brand] ? brand : '');
// Nội dung chưa chọn brand gom vào một nhóm riêng để không bị sót.
const NO_BRAND = { value: '', label: 'Chưa chọn brand', short: '?', badge: 'badge-gray' };
const brandOf = (plan) => BRAND[plan.brand] ?? NO_BRAND;
const dateKeyOf = (kind) => (kind === 'shoot' ? 'shoot_date' : 'post_date');

const CHIPS_PER_DAY = 4;

/** Lịch tháng của một loại (đăng hoặc quay), lọc được theo brand. Mỗi nội dung có nhãn brand viết tắt. */
export async function getMonth(month, { kind, brand } = {}, user) {
  const type = calendarKind(kind);
  const key = dateKeyOf(type);
  const weeks = monthGrid(month);
  const today = todayISO();
  const plans = (await repo.listForRange({ from: weeks[0][0], to: weeks.at(-1)[6] })).filter(
    (p) => p[key] && (!brandFilter(brand) || p.brand === brand),
  );

  const byDate = new Map();
  for (const plan of plans) {
    const item = { ...decorate(plan, user), brandInfo: brandOf(plan), kind: type };
    byDate.set(plan[key], [...(byDate.get(plan[key]) ?? []), item]);
  }
  // Lịch đăng không theo giờ (xếp theo tên); lịch quay theo giờ bắt đầu.
  const timeOf = (p) => (type === 'post' ? null : parseTimeRange(p.shoot_time).start) ?? '~';
  for (const list of byDate.values()) list.sort((a, b) => timeOf(a).localeCompare(timeOf(b)));

  const inMonth = plans.filter((p) => p[key].startsWith(month));
  return {
    weeks: weeks.map((week) =>
      week.map((date) => {
        const list = byDate.get(date) ?? [];
        return {
          date,
          day: Number(date.slice(8)),
          inMonth: date.startsWith(month),
          isToday: date === today,
          total: list.length,
          entries: list.slice(0, CHIPS_PER_DAY),
          more: Math.max(0, list.length - CHIPS_PER_DAY),
        };
      }),
    ),
    // Danh sách theo ngày dưới lịch (điện thoại chỉ thấy số trong ô lịch).
    agenda: [...byDate.keys()]
      .filter((date) => date.startsWith(month))
      .sort()
      .map((date) => ({ date, isToday: date === today, isPast: date < today, entries: byDate.get(date) })),
    summary: {
      total: inMonth.length,
      done: inMonth.filter((p) => (type === 'post' ? p.status === 'posted' : DONE_SHOOTING.has(p.status))).length,
      byBrand: [...BRANDS, NO_BRAND]
        .map((b) => ({ ...b, total: inMonth.filter((p) => brandOf(p) === b).length }))
        .filter((b) => b.total),
    },
    prev: addMonths(month, -1),
    next: addMonths(month, 1),
    thisMonth: today.slice(0, 7),
  };
}

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

/** Cảnh báo giống Sheet cũ: chưa có ngày quay, quay sát ngày đăng (< 2 ngày). */
function withChecks(plan, today) {
  const leadDays = plan.shoot_date && plan.post_date ? daysBetween(plan.shoot_date, plan.post_date) : null;
  return {
    ...plan,
    leadDays,
    shootTight: leadDays != null && leadDays < 2 && !DONE_SHOOTING.has(plan.status),
    missingShoot: Boolean(plan.post_date) && !plan.shoot_date && !DONE_SHOOTING.has(plan.status),
  };
}

/** Đánh dấu 1 người bị xếp quay cùng ngày, cùng khung giờ ở 2 địa điểm khác nhau (xét mọi brand). */
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
 * Lịch tuần của một loại (đăng hoặc quay): mỗi brand một hàng riêng, mỗi hàng 7 ngày, trong ngày xếp theo giờ.
 * Lịch quay kèm danh sách bài sắp đăng chưa chốt ngày quay.
 */
export async function getWeek(date, { kind, brand } = {}, user) {
  const type = calendarKind(kind);
  const key = dateKeyOf(type);
  const only = brandFilter(brand);
  const today = todayISO();
  const days = weekDays(isISODate(date) ? date : today);
  const inWeek = (d) => Boolean(d) && d >= days[0] && d <= days[6];
  const all = markConflicts((await repo.listForRange({ from: days[0], to: days[6] })).map((p) => decorate(withChecks(p, today), user)));

  const entries = all
    .filter((p) => inWeek(p[key]) && (!only || p.brand === only))
    .map((p) => {
      if (type === 'post') return { ...p, kind: type, day: p.post_date, time: null, sortTime: null };
      const { start, end } = parseTimeRange(p.shoot_time);
      return { ...p, kind: type, day: p.shoot_date, time: start ? `${start}${end ? `–${end}` : ''}` : p.shoot_time, sortTime: start };
    })
    .sort((a, b) => (a.sortTime ?? '~').localeCompare(b.sortTime ?? '~'));

  // Chỉ hiện brand có nội dung trong tuần (không có gì thì ẩn hẳn hàng đó).
  const groups = [...BRANDS, NO_BRAND]
    .filter((b) => entries.some((e) => brandOf(e) === b))
    .map((b) => {
      const mine = entries.filter((e) => brandOf(e) === b);
      return {
        ...b,
        total: mine.length,
        days: days.map((d, i) => ({
          date: d,
          weekday: WEEKDAY_SHORT[i],
          dayMonth: dayMonth(d),
          isToday: d === today,
          isPast: d < today,
          entries: mine.filter((e) => e.day === d),
        })),
      };
    });

  let unshot = [];
  if (type === 'shoot') {
    const from = days[0] > today ? days[0] : today;
    unshot = (await repo.listUpcomingWithoutShoot(from))
      .filter((p) => p.post_date <= addDays(days[6], 14) && (!only || p.brand === only))
      .map((p) => ({ ...decorate(p, user), brandInfo: brandOf(p) }));
  }

  return {
    ...weekLabel(days),
    weekdays: days.map((d, i) => ({ weekday: WEEKDAY_SHORT[i], dayMonth: dayMonth(d), isToday: d === today })),
    groups,
    unshot,
    summary: {
      total: entries.length,
      done: entries.filter((e) => (type === 'post' ? e.status === 'posted' : DONE_SHOOTING.has(e.status))).length,
      missingShoot: entries.filter((e) => e.missingShoot).length,
      conflicts: entries.filter((e) => e.conflict).length,
      tight: entries.filter((e) => e.shootTight).length,
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
  const existing = await getEditablePlan(id, user);
  const result = prepare(input);
  if (!result.ok) return result;
  // Form không còn ô Loại video / Tuyến nội dung: giữ nguyên giá trị cũ (VD nhập từ Sheet) khi lưu.
  const plan = await repo.update(id, { ...result.data, topic: existing.topic, video_type: existing.video_type });
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
