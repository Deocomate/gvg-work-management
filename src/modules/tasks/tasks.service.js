// Nghiệp vụ giao việc. Không biết req/res.
// Quyền:
//   - Quản lý (admin): giao việc cho bất kỳ ai, sửa/xoá mọi việc.
//   - Nhân viên: chỉ tự thêm việc cho mình; sửa/xoá việc do chính mình tạo;
//     đổi trạng thái (bắt đầu/xong) mọi việc được giao cho mình.
import { addDays, daysBetween, weekdayOf } from '#lib/dates.js';
import { badRequest, forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import * as staffRepo from '#modules/staff/staff.repo.js';
import { MAX_REPEAT_DAYS, repeatSchema, splitLinks, statusSchema, taskSchema } from './tasks.schema.js';
import * as repo from './tasks.repo.js';

export const isManager = (user) => user?.role === 'admin';

export const canEdit = (user, task) =>
  isManager(user) || (task.created_by === user.id && task.assignee_id === user.id);

export const canChangeStatus = (user, task) => isManager(user) || task.assignee_id === user.id;

export async function getTask(id) {
  const task = await repo.findById(id);
  if (!task) throw notFound('Không tìm thấy công việc này.');
  return task;
}

/** Lấy việc để sửa/xoá — 403 nếu không có quyền. */
export async function getEditableTask(id, user) {
  const task = await getTask(id);
  if (!canEdit(user, task)) throw forbidden('Bạn chỉ sửa được việc do chính bạn tạo.');
  return task;
}

// Nhân viên luôn tự giao cho mình (bỏ qua giá trị gửi lên) — áp dụng TRƯỚC khi validate.
const withOwnAssignee = (input, user) => (isManager(user) ? input : { ...input, assignee_id: user.id });

// Quản lý phải chọn người có thật.
async function resolveAssignee(data, user) {
  if (isManager(user) && !(await staffRepo.findById(data.assignee_id))) return null;
  return data;
}

/**
 * Danh sách ngày cho việc lặp lại, hoặc { error: { field: message } } nếu không hợp lệ.
 * Ngày bắt đầu luôn là lần đầu tiên; sau đó lặp vào các thứ đã chọn (0 = CN … 6 = T7) tới `until`.
 */
export function repeatDates(start, repeat, until, days = []) {
  if (repeat === 'none') return { dates: [start] };
  if (!days.length) return { error: { repeat_days: 'Chọn ít nhất một thứ để lặp lại' } };
  if (!until) return { error: { repeat_until: 'Chọn ngày kết thúc lặp lại' } };
  const span = daysBetween(start, until);
  if (span <= 0) return { error: { repeat_until: 'Ngày kết thúc phải sau ngày bắt đầu' } };
  if (span > MAX_REPEAT_DAYS) return { error: { repeat_until: `Chỉ lặp lại tối đa ${MAX_REPEAT_DAYS} ngày` } };

  const dates = [start];
  for (let i = 1; i <= span; i += 1) {
    const day = addDays(start, i);
    if (days.includes(weekdayOf(day))) dates.push(day);
  }
  return dates.length > 1 ? { dates } : { error: { repeat_days: 'Không có ngày nào phù hợp trong khoảng đã chọn' } };
}

// Validate việc + phần lặp lại cùng lúc để form báo đủ lỗi một lần.
async function validateTaskInput(input, user) {
  const task = validate(taskSchema, withOwnAssignee(input, user));
  const repeat = validate(repeatSchema, input);
  if (!task.ok || !repeat.ok) return { ok: false, errors: { ...task.errors, ...repeat.errors } };

  const data = await resolveAssignee(task.data, user);
  if (!data) return { ok: false, errors: { assignee_id: 'Người thực hiện không tồn tại' } };

  const { repeat: kind, repeat_until: until, repeat_days: days } = repeat.data;
  const { dates, error } = repeatDates(data.date, kind, until, days);
  if (error) return { ok: false, errors: error };
  return { ok: true, data, dates };
}

export async function createTasks(input, user) {
  const result = await validateTaskInput(input, user);
  if (!result.ok) return result;
  const { data, dates } = result;
  const count = await repo.createMany(dates.map((date) => ({ ...data, date, created_by: user.id })));
  return { ok: true, data: { ...data, count } };
}

/** Sửa việc; nếu chọn lặp lại thì việc này giữ ngày của nó và thêm bản sao (chưa làm) cho các ngày sau. */
export async function updateTask(id, input, user) {
  await getEditableTask(id, user);
  const result = await validateTaskInput(input, user);
  if (!result.ok) return result;
  const { data, dates } = result;
  const repeats = dates.slice(1).map((date) => ({ ...data, date, status: 'todo', created_by: user.id }));
  const updated = await repo.update(id, data);
  const added = repeats.length ? await repo.createMany(repeats) : 0;
  return { ok: true, data: { ...updated, added } };
}

export async function deleteTask(id, user) {
  await getEditableTask(id, user);
  await repo.remove(id);
}

export async function changeStatus(id, status, user) {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) throw badRequest('Trạng thái không hợp lệ.');
  const task = await getTask(id);
  if (!canChangeStatus(user, task)) throw forbidden('Đây không phải việc của bạn.');
  await repo.updateStatus(id, parsed.data);
  return { ...task, status: parsed.data };
}

/** Link liên quan của việc để hiển thị: [{ url, label }], label gọn kiểu "tiktok.com/@kenh/video…". */
export function taskLinks(task) {
  return splitLinks(task.links).map((url) => {
    const { hostname, pathname } = new URL(url);
    const path = pathname === '/' ? '' : pathname;
    const label = `${hostname.replace(/^www\./, '')}${path}`;
    return { url, label: label.length > 48 ? `${label.slice(0, 47)}…` : label };
  });
}

/** Số việc chưa xong hôm nay của một người (hiện trên menu). */
export const countUnfinished = (date, userId) => repo.countUnfinished({ date, assigneeId: userId });
