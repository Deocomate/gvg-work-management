// Nghiệp vụ giao việc. Không biết req/res.
// Quyền:
//   - Quản lý (admin): giao việc cho bất kỳ ai, sửa/xoá mọi việc.
//   - Nhân viên: chỉ tự thêm việc cho mình; sửa/xoá việc do chính mình tạo;
//     đổi trạng thái (bắt đầu/xong) mọi việc được giao cho mình.
import { addDays, daysBetween, weekdayOf } from '#lib/dates.js';
import { badRequest, forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import * as staffRepo from '#modules/staff/staff.repo.js';
import { MAX_REPEAT_DAYS, repeatSchema, statusSchema, taskSchema } from './tasks.schema.js';
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

/** Danh sách ngày cho việc lặp lại, hoặc { error } nếu không hợp lệ. */
export function repeatDates(start, repeat, until) {
  if (repeat === 'none') return { dates: [start] };
  if (!until) return { error: 'Chọn ngày kết thúc lặp lại' };
  const span = daysBetween(start, until);
  if (span <= 0) return { error: 'Ngày kết thúc phải sau ngày bắt đầu' };
  if (span > MAX_REPEAT_DAYS) return { error: `Chỉ lặp lại tối đa ${MAX_REPEAT_DAYS} ngày` };

  const dates = [];
  for (let i = 0; i <= span; i += 1) {
    const day = addDays(start, i);
    const weekday = weekdayOf(day);
    if (repeat === 'daily') dates.push(day);
    if (repeat === 'weekdays' && weekday >= 1 && weekday <= 5) dates.push(day);
    if (repeat === 'weekly' && i % 7 === 0) dates.push(day);
  }
  return dates.length ? { dates } : { error: 'Không có ngày nào phù hợp trong khoảng đã chọn' };
}

export async function createTasks(input, user) {
  const task = validate(taskSchema, withOwnAssignee(input, user));
  const repeat = validate(repeatSchema, input);
  if (!task.ok || !repeat.ok) return { ok: false, errors: { ...task.errors, ...repeat.errors } };

  const data = await resolveAssignee(task.data, user);
  if (!data) return { ok: false, errors: { assignee_id: 'Người thực hiện không tồn tại' } };

  const { dates, error } = repeatDates(data.date, repeat.data.repeat, repeat.data.repeat_until);
  if (error) return { ok: false, errors: { repeat_until: error } };

  const count = await repo.createMany(dates.map((date) => ({ ...data, date, created_by: user.id })));
  return { ok: true, data: { ...data, count } };
}

export async function updateTask(id, input, user) {
  await getEditableTask(id, user);
  const result = validate(taskSchema, withOwnAssignee(input, user));
  if (!result.ok) return result;
  const data = await resolveAssignee(result.data, user);
  if (!data) return { ok: false, errors: { assignee_id: 'Người thực hiện không tồn tại' } };
  return { ok: true, data: await repo.update(id, data) };
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

/** Số việc chưa xong hôm nay của một người (hiện trên menu). */
export const countUnfinished = (date, userId) => repo.countUnfinished({ date, assigneeId: userId });
