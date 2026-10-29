// Thêm/sửa/xoá việc và đổi trạng thái nhanh. Không chứa SQL hay quy tắc quyền.
import { formatDayVN, isISODate, todayISO, weekdayOf } from '#lib/dates.js';
import { safeBack } from '#lib/redirect.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import {
  parseWeekdays,
  REPEAT_OPTIONS,
  REPEAT_WEEKDAYS,
  repeatSummary,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from './tasks.schema.js';
import * as service from './tasks.service.js';

const dayUrl = (date) => `/today?date=${date}`;

// Nút thứ cho form: chưa bật lặp lại thì chọn sẵn thứ của ngày công việc; đã bật (form lỗi) thì giữ
// đúng lựa chọn đã gửi — không tick thứ nào thì trình duyệt không gửi repeat_days.
function weekdayChoices(values) {
  const fallback = isISODate(values.date) ? [weekdayOf(values.date)] : [];
  const days = values.repeat === 'weekly' ? parseWeekdays(values.repeat_days) : fallback;
  return {
    weekdayOptions: REPEAT_WEEKDAYS.map((d) => ({ ...d, checked: days.includes(d.value) })),
    repeatSummary: repeatSummary(days),
  };
}

async function renderForm(req, res, { task = null, values = {}, errors = {}, status = 200 }) {
  const manager = service.isManager(req.user);
  res.status(status).render('tasks/form', {
    ...weekdayChoices(values),
    title: task ? 'Sửa công việc' : 'Thêm công việc',
    task,
    values,
    errors,
    manager,
    assigneeOptions: manager ? await staffOptions() : [],
    statusOptions: TASK_STATUSES,
    priorityOptions: TASK_PRIORITIES,
    repeatOptions: REPEAT_OPTIONS,
    back: safeBack(values.back, dayUrl(values.date || todayISO())),
  });
}

export function newForm(req, res) {
  const date = isISODate(req.query.date) ? req.query.date : todayISO();
  // Quản lý phải chủ động chọn người nhận (trừ khi đang xem lịch của một người cụ thể).
  const assignee = Number(req.query.user) || (service.isManager(req.user) ? '' : req.user.id);
  return renderForm(req, res, {
    values: { date, assignee_id: assignee, priority: 'normal', repeat: 'none', back: req.query.back },
  });
}

export async function create(req, res) {
  const result = await service.createTasks(req.body, req.user);
  if (!result.ok) return renderForm(req, res, { values: req.body, errors: result.errors, status: 422 });
  const { title, count, date } = result.data;
  req.flash('success', count > 1 ? `Đã giao “${title}” cho ${count} ngày.` : `Đã thêm “${title}” ngày ${formatDayVN(date)}.`);
  res.redirect(safeBack(req.body.back, dayUrl(date)));
}

export async function editForm(req, res) {
  const task = await service.getEditableTask(req.params.id, req.user);
  return renderForm(req, res, { task, values: { ...task, repeat: 'none', back: req.query.back } });
}

export async function update(req, res) {
  const id = req.params.id;
  const result = await service.updateTask(id, req.body, req.user);
  if (!result.ok) {
    return renderForm(req, res, { task: { id }, values: req.body, errors: result.errors, status: 422 });
  }
  const { added } = result.data;
  req.flash('success', added ? `Đã lưu và lặp lại thêm ${added} ngày.` : 'Đã lưu thay đổi.');
  res.redirect(safeBack(req.body.back, dayUrl(result.data.date)));
}

export async function destroy(req, res) {
  await service.deleteTask(req.params.id, req.user);
  req.flash('success', 'Đã xoá công việc.');
  res.redirect(safeBack(req.body.back, '/today'));
}

const STATUS_MESSAGES = { todo: 'Đã mở lại', doing: 'Đã bắt đầu', done: 'Đã hoàn thành' };

export async function setStatus(req, res) {
  const task = await service.changeStatus(req.params.id, req.body.status, req.user);
  req.flash('success', `${STATUS_MESSAGES[task.status]} “${task.title}”.`);
  res.redirect(safeBack(req.body.back, dayUrl(task.date)));
}
