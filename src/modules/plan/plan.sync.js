// Đồng bộ Plan nội dung <-> lịch làm việc (bảng tasks), 2 chiều:
// - Plan -> lịch: việc "🎬 Quay: …" (ngày quay, khung giờ, địa điểm, CSVC) giao cho người quay,
//   "📤 Đăng: …" (ngày đăng, cả ngày) giao cho người đăng; chưa chọn thì giao cho người phụ trách.
//   Đổi ngày/người/trạng thái ở Plan thì việc tự đổi theo; bỏ ngày, không còn ai làm hoặc chuyển "Bỏ" thì việc bị xoá.
// - Lịch -> Plan: tick ✓ Xong việc đăng -> Plan "Đã xong"; mở lại việc đăng -> lùi về "Đã chọn".
//   Việc quay tick xong/mở lại tuỳ người làm (Plan không còn bước "Đã quay").
// Việc lấy từ Plan chỉ sửa ở Plan (tasks.service chặn sửa/xoá trực tiếp).
import * as tasksRepo from '#modules/tasks/tasks.repo.js';
import * as repo from './plan.repo.js';

const isUrl = (v) => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
const lines = (...items) => items.filter(Boolean).join('\n') || null;
const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const pad = (n) => String(n).padStart(2, '0');

/**
 * Khung giờ quay gõ tự do -> giờ bắt đầu / kết thúc HH:MM.
 * "15h00 - 15h30", "15:00-15:30", "9h - 11h", "9h30" đều hiểu; không đọc được thì trả null (việc để "Cả ngày").
 */
export function parseTimeRange(text) {
  const times = [...String(text ?? '').matchAll(/(\d{1,2})\s*(?:h|:|giờ|g)\s*(\d{2})?/gi)]
    .map(([, h, m]) => [Number(h), Number(m ?? 0)])
    .filter(([h, m]) => h < 24 && m < 60)
    .map(([h, m]) => `${pad(h)}:${pad(m)}`);
  const [start = null, end = null] = times;
  return { start, end: end && end > start ? end : null };
}

const isDone = (plan) => plan.status === 'posted';

/** Các việc lẽ ra phải có trên lịch cho nội dung này: { shoot?, post? }. */
function desiredTasks(plan) {
  if (plan.status === 'dropped') return {};
  const shooter = plan.shooter_id ?? plan.owner_id;
  const poster = plan.poster_id ?? plan.owner_id;
  const base = { created_by: plan.created_by, priority: 'normal', group_key: null, plan_id: plan.id, brand: plan.brand || null };
  const links = [plan.script, plan.reference_url, ...(plan.extra_reference_urls ?? '').split('\n'), plan.source_url].filter(isUrl).map((u) => u.trim());
  const wanted = {};
  if (plan.shoot_date && shooter) {
    const { start, end } = parseTimeRange(plan.shoot_time);
    wanted.shoot = {
      ...base,
      assignee_id: shooter,
      title: cut(`🎬 Quay: ${plan.title}`, 200),
      date: plan.shoot_date,
      start_time: start,
      end_time: end,
      facilities: plan.props ?? null,
      note: lines(
        plan.location && `📍 Địa điểm: ${plan.location}`,
        !start && plan.shoot_time && `🕒 Giờ quay: ${plan.shoot_time}`,
        plan.script && !isUrl(plan.script) && `Kịch bản: ${plan.script}`,
        plan.post_date && `Đăng ngày ${plan.post_date.split('-').reverse().join('/')}`,
        plan.note,
      ),
      links: lines(...links),
    };
  }
  if (plan.post_date && poster) {
    wanted.post = {
      ...base,
      assignee_id: poster,
      title: cut(`📤 Đăng: ${plan.title}`, 200),
      date: plan.post_date,
      start_time: null, // lịch đăng không theo giờ -> cả ngày
      end_time: null,
      facilities: null,
      note: lines(plan.note),
      links: lines(...[plan.source_url, plan.post_url].filter(isUrl).map((u) => u.trim())),
    };
  }
  return wanted;
}

/** Cho việc trên lịch khớp với nội dung Plan hiện tại (gọi sau mỗi lần thêm/sửa/đổi trạng thái/xoá). */
export async function syncPlan(planId) {
  const [plan, existing] = await Promise.all([repo.findById(planId), tasksRepo.listForPlan(planId)]);
  const wanted = plan ? desiredTasks(plan) : {};
  const updates = [];
  const creates = [];
  const deletes = [];
  for (const kind of ['shoot', 'post']) {
    const current = existing.find((t) => t.plan_kind === kind);
    const task = wanted[kind];
    if (!task) {
      if (current) deletes.push(current.id);
      continue;
    }
    // Plan "Đã xong" -> cả 2 việc xong. Việc đăng theo sát Plan (Plan lùi bước -> mở lại);
    // việc quay giữ trạng thái người làm đang đặt (đã quay xong thì vẫn xong).
    const reopen = kind === 'post' && current?.status === 'done';
    const status = isDone(plan) ? 'done' : !current || reopen ? 'todo' : current.status;
    if (current) updates.push({ id: current.id, task: { ...task, status } });
    else creates.push({ ...task, status, plan_kind: kind });
  }
  if (updates.length || creates.length || deletes.length) await tasksRepo.savePlanTasks({ updates, creates, deletes });
}

export async function syncPlans(ids) {
  for (const id of ids) await syncPlan(id);
}

export const removePlanTasks = (planId) => tasksRepo.removeForPlan(planId);

/** Lịch -> Plan: người làm tick ✓ Xong / Mở lại việc đăng thì Plan thành "Đã xong" / lùi về "Đã chọn". */
export async function applyTaskStatus(task, status) {
  if (!task.plan_id || task.plan_kind !== 'post') return;
  const plan = await repo.findById(task.plan_id);
  if (!plan || plan.status === 'dropped') return;
  const next = status === 'done' ? 'posted' : plan.status === 'posted' ? 'selected' : plan.status;
  if (next !== plan.status) await repo.updateStatus(plan.id, next);
  await syncPlan(plan.id);
}
