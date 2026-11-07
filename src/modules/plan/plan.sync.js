// Đồng bộ Plan nội dung <-> lịch làm việc (bảng tasks), 2 chiều:
// - Plan -> lịch: nội dung có người phụ trách tạo việc "🎬 Quay: …" (ngày quay, khung giờ, địa điểm, CSVC)
//   và "📤 Đăng: …" (ngày + giờ đăng) cho người đó. Đổi ngày/người/trạng thái ở Plan thì việc tự đổi theo;
//   bỏ ngày, bỏ người phụ trách hoặc chuyển "Bỏ" thì việc bị xoá.
// - Lịch -> Plan: tick ✓ Xong việc quay -> Plan "Đã quay"; tick xong việc đăng -> "Đã đăng"; mở lại thì lùi bước.
// Việc lấy từ Plan chỉ sửa ở Plan (tasks.service chặn sửa/xoá trực tiếp).
import * as tasksRepo from '#modules/tasks/tasks.repo.js';
import { PLATFORMS } from './plan.schema.js';
import * as repo from './plan.repo.js';

const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));
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

const DONE_FOR = { shoot: new Set(['filmed', 'posted']), post: new Set(['posted']) };

/** Các việc lẽ ra phải có trên lịch cho nội dung này: { shoot?, post? }. */
function desiredTasks(plan) {
  if (!plan.owner_id || plan.status === 'dropped') return {};
  const base = { assignee_id: plan.owner_id, created_by: plan.created_by, priority: 'normal', group_key: null, plan_id: plan.id };
  const links = [plan.script, plan.reference_url, plan.source_url].filter(isUrl).map((u) => u.trim());
  const wanted = {};
  if (plan.shoot_date) {
    const { start, end } = parseTimeRange(plan.shoot_time);
    wanted.shoot = {
      ...base,
      title: cut(`🎬 Quay: ${plan.title}`, 200),
      date: plan.shoot_date,
      start_time: start,
      end_time: end,
      facilities: plan.props ?? null,
      note: lines(
        plan.location && `📍 Địa điểm: ${plan.location}`,
        !start && plan.shoot_time && `🕒 Giờ quay: ${plan.shoot_time}`,
        plan.brand && `Brand: ${plan.brand}`,
        plan.script && !isUrl(plan.script) && `Kịch bản: ${plan.script}`,
        plan.post_date && `Đăng ngày ${plan.post_date.split('-').reverse().join('/')}`,
        plan.note,
      ),
      links: lines(...links),
    };
  }
  if (plan.post_date) {
    wanted.post = {
      ...base,
      title: cut(`📤 Đăng: ${plan.title}`, 200),
      date: plan.post_date,
      start_time: plan.post_time ?? null,
      end_time: null,
      facilities: null,
      note: lines(`Kênh: ${PLATFORM_LABEL[plan.platform] ?? plan.platform}`, plan.brand && `Brand: ${plan.brand}`, plan.note),
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
    // Plan đã quay/đăng -> việc xong; Plan lùi bước -> mở lại; còn lại giữ trạng thái người làm đang đặt (VD Đang làm).
    const done = DONE_FOR[kind].has(plan.status);
    const status = done ? 'done' : current?.status === 'done' || !current ? 'todo' : current.status;
    if (current) updates.push({ id: current.id, task: { ...task, status } });
    else creates.push({ ...task, status, plan_kind: kind });
  }
  if (updates.length || creates.length || deletes.length) await tasksRepo.savePlanTasks({ updates, creates, deletes });
}

export async function syncPlans(ids) {
  for (const id of ids) await syncPlan(id);
}

export const removePlanTasks = (planId) => tasksRepo.removeForPlan(planId);

const STEP = ['idea', 'selected', 'scripted', 'scheduled', 'filmed', 'posted'];
const before = (a, b) => STEP.indexOf(a) < STEP.indexOf(b);

/** Lịch -> Plan: người làm tick ✓ Xong / Mở lại việc quay hoặc đăng. */
export async function applyTaskStatus(task, status) {
  if (!task.plan_id) return;
  const plan = await repo.findById(task.plan_id);
  if (!plan || plan.status === 'dropped') return;
  let next = plan.status;
  if (status === 'done') {
    const target = task.plan_kind === 'post' ? 'posted' : 'filmed';
    if (before(plan.status, target)) next = target;
  } else if (task.plan_kind === 'post' && plan.status === 'posted') {
    next = plan.shoot_date ? 'filmed' : 'scheduled';
  } else if (task.plan_kind === 'shoot' && plan.status === 'filmed') {
    next = 'scheduled';
  }
  if (next !== plan.status) await repo.updateStatus(plan.id, next);
  await syncPlan(plan.id);
}
