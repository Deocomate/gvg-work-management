// Báo cáo tuần — phần Kế hoạch tuần tới.
// - Gợi ý: lấy sẵn các việc đã giao tuần tới trên Lịch làm việc (trừ việc Quay/Đăng từ mục Nội dung — đã có danh sách video riêng).
//   Việc lặp lại nhiều ngày (cùng tên + người + brand) gộp thành một dòng, hạn = ngày cuối.
// - Dòng lấy từ lịch nhớ task_ids -> báo cáo tuần sau tự tính Xong khi mọi việc đó đã bấm Xong trên lịch.
//   Dòng gõ tay thì vẫn tick Xong trong form.
import { validate } from '#lib/validate.js';
import * as tasksRepo from '#modules/tasks/tasks.repo.js';
import { MAX_PLAN_ITEMS, planItemSchema } from './reports.schema.js';

const parseIds = (json) => {
  try {
    const ids = JSON.parse(json ?? '[]');
    return Array.isArray(ids) ? ids.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
};

/** Dòng kế hoạch từ DB -> thêm taskIds (mảng số). */
export const withTaskIds = (item) => ({ ...item, taskIds: parseIds(item.task_ids) });

/** Gợi ý dòng kế hoạch từ việc đã giao trong khoảng ngày [from, to] trên Lịch làm việc. */
export async function suggestFromCalendar({ from, to }) {
  const tasks = (await tasksRepo.listForRange({ from, to, assigneeId: null })).filter((t) => !t.plan_id);
  const groups = new Map();
  for (const t of tasks) {
    const key = `${t.title.trim().toLowerCase()}|${t.assignee_id}|${t.brand ?? ''}`;
    const g = groups.get(key) ?? { title: t.title.trim(), owner_id: t.assignee_id, owner_name: t.assignee_name, brand: t.brand ?? '', dates: [], taskIds: [] };
    g.dates.push(t.date);
    g.taskIds.push(t.id);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      title: g.title,
      target: g.dates.length > 1 ? `${g.dates.length} ngày` : '',
      owner_id: g.owner_id,
      owner_name: g.owner_name,
      brand: g.brand,
      due_date: g.dates.sort().at(-1),
      taskIds: g.taskIds,
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title, 'vi'));
}

/**
 * Dòng cho form: đã lưu thì dùng dòng đã lưu; chưa có dòng nào thì lấy gợi ý từ lịch.
 * addFromCalendar = true (nút "Lấy thêm từ Lịch làm việc"): thêm các việc trên lịch chưa có trong kế hoạch.
 */
export async function planRowsFor(saved, nextWeek, { addFromCalendar = false } = {}) {
  if (saved.length && !addFromCalendar) return { rows: saved, added: 0 };
  const suggestions = await suggestFromCalendar(nextWeek);
  const known = new Set(saved.flatMap((s) => s.taskIds));
  const fresh = suggestions.filter((s) => !s.taskIds.some((id) => known.has(id)));
  return { rows: [...saved, ...fresh].slice(0, MAX_PLAN_ITEMS), added: fresh.length };
}

/**
 * Kết quả kế hoạch: dòng có việc trên lịch -> Xong khi mọi việc còn tồn tại đều Xong (auto = true);
 * việc đã bị xoá hết thì quay về tick tay.
 */
export async function withResults(items) {
  const ids = items.flatMap((i) => i.taskIds);
  const status = new Map((await tasksRepo.statusByIds(ids)).map((t) => [t.id, t.status]));
  return items.map((item) => {
    const linked = item.taskIds.filter((id) => status.has(id));
    if (!linked.length) return { ...item, auto: false, done: Boolean(item.done) };
    const doneCount = linked.filter((id) => status.get(id) === 'done').length;
    return { ...item, auto: true, done: doneCount === linked.length, progress: linked.length > 1 ? `${doneCount}/${linked.length}` : '' };
  });
}

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Các dòng Kế hoạch tuần tới từ form (ô cùng tên lặp lại: plan_title, plan_target…, thứ tự khớp nhau).
 * Dòng trống hết thì bỏ. Trả { items, rows (để vẽ lại form khi lỗi), errors: { plan_<i>_<ô>: … } }.
 */
export function parsePlanRows(input) {
  const fields = ['id', 'title', 'target', 'owner_id', 'brand', 'due_date', 'task_ids'];
  const cols = Object.fromEntries(fields.map((f) => [f, asList(input[`plan_${f}`])]));
  const count = Math.min(cols.title.length, MAX_PLAN_ITEMS);
  const rows = [];
  const items = [];
  const errors = {};
  for (let i = 0; i < count; i++) {
    const row = Object.fromEntries(fields.map((f) => [f, typeof cols[f][i] === 'string' ? cols[f][i] : '']));
    if (!['title', 'target', 'owner_id', 'brand', 'due_date'].some((f) => row[f].trim())) continue;
    const index = rows.length;
    rows.push({ ...row, taskIds: row.task_ids.split(',').filter(Boolean) });
    const parsed = validate(planItemSchema, row);
    if (!parsed.ok) {
      for (const [field, message] of Object.entries(parsed.errors)) errors[`plan_${index}_${field}`] = message;
      rows[index].errors = parsed.errors;
    } else items.push(parsed.data);
  }
  return { items, rows, errors };
}
