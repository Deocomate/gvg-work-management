// Màn hình "Hôm nay" và "Lịch". Chỉ đọc dữ liệu; thao tác thật nằm ở module tasks.
import { staffOptions } from '#modules/staff/staff.service.js';
import { TASK_STATUSES } from '#modules/tasks/tasks.schema.js';
import { canChangeStatus, canEdit, isManager } from '#modules/tasks/tasks.service.js';
import * as service from './schedule.service.js';

const statusInfo = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s]));
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const decorate = (user) => (task) => ({
  ...task,
  statusInfo: statusInfo[task.status],
  isHigh: task.priority === 'high',
  canEdit: canEdit(user, task),
  canStatus: canChangeStatus(user, task),
});

// Phần chung: bộ lọc nhân viên cho quản lý.
async function viewerContext(req) {
  const manager = isManager(req.user);
  const assigneeId = service.resolveAssignee(req.user, req.query.user);
  return {
    assigneeId,
    manager,
    showAssignee: manager && !assigneeId,
    staffOptions: manager ? await staffOptions() : [],
    selectedUser: assigneeId ?? '',
    userQuery: manager && assigneeId ? `&user=${assigneeId}` : '',
  };
}

export async function today(req, res) {
  const date = service.parseDate(req.query.date);
  const viewer = await viewerContext(req);
  const day = await service.getDay({ date, assigneeId: viewer.assigneeId });
  const withRights = decorate(req.user);

  res.render('schedule/today', {
    title: day.isToday ? 'Việc hôm nay' : 'Việc trong ngày',
    ...viewer,
    ...day,
    date,
    tasks: day.tasks.map(withRights),
    overdue: day.overdue.map(withRights),
    back: `/today?date=${date}${viewer.userQuery}`,
  });
}

export async function calendar(req, res) {
  const month = service.parseMonth(req.query.month);
  const viewer = await viewerContext(req);
  const data = await service.getMonth({ month, assigneeId: viewer.assigneeId });
  const [year, monthNumber] = month.split('-');

  res.render('schedule/calendar', {
    title: 'Lịch công việc',
    ...viewer,
    ...data,
    month,
    monthLabel: `Tháng ${Number(monthNumber)}/${year}`,
    weekdayLabels: WEEKDAY_LABELS,
    weeks: data.weeks.map((week) =>
      week.map((cell) => ({ ...cell, tasks: cell.tasks.map((t) => ({ ...t, statusInfo: statusInfo[t.status] })) })),
    ),
  });
}
