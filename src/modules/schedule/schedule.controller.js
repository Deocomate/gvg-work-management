// Màn hình "Hôm nay" và "Lịch". Chỉ đọc dữ liệu; thao tác thật nằm ở module tasks.
import { listLinks } from '#modules/links/links.service.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import { TASK_STATUSES } from '#modules/tasks/tasks.schema.js';
import { canChangeStatus, canEdit, isManager, taskLinks } from '#modules/tasks/tasks.service.js';
import * as service from './schedule.service.js';

const statusInfo = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s]));
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const decorate = (user) => (task) => ({
  ...task,
  statusInfo: statusInfo[task.status],
  isHigh: task.priority === 'high',
  linkList: taskLinks(task),
  canEdit: canEdit(user, task),
  canStatus: canChangeStatus(user, task),
});

// Phần chung: bộ lọc nhân viên cho quản lý.
async function viewerContext(req) {
  const manager = isManager(req.user);
  const assigneeId = service.resolveAssignee(req.user, req.query.user);
  const selectedUser = manager ? (assigneeId ?? service.ALL_USERS) : '';
  return {
    assigneeId,
    manager,
    showAssignee: manager && !assigneeId,
    staffOptions: manager ? await staffOptions() : [],
    allUsers: service.ALL_USERS,
    selectedUser,
    // Giữ lựa chọn của quản lý khi chuyển ngày/tuần/tháng
    userQuery: manager ? `&user=${selectedUser}` : '',
  };
}

const withStatus = (task) => ({ ...task, statusInfo: statusInfo[task.status] });
const withLinks = (task) => ({ ...task, linkList: taskLinks(task) });

// Trang chính: lịch tuần ở trên, việc của ngày đang chọn ở dưới.
export async function today(req, res) {
  const date = service.parseDate(req.query.date);
  const viewer = await viewerContext(req);
  const [day, week, links] = await Promise.all([
    service.getDay({ date, assigneeId: viewer.assigneeId }),
    service.getWeek({ date, assigneeId: viewer.assigneeId }),
    listLinks(),
  ]);
  const withRights = decorate(req.user);

  res.render('schedule/today', {
    title: day.isToday ? 'Việc hôm nay' : 'Việc trong ngày',
    ...viewer,
    ...day,
    date,
    week: {
      ...week,
      days: week.days.map((d, i) => ({ ...d, weekdayLabel: WEEKDAY_LABELS[i], tasks: d.tasks.map(withStatus) })),
    },
    tasks: day.tasks.map(withRights),
    overdue: day.overdue.map(withRights),
    links,
    back: `/today?date=${date}${viewer.userQuery}`,
  });
}

// Phiếu công việc trong ngày (trang in được): luôn gồm việc của tất cả mọi người trong một phiếu.
export async function sheet(req, res) {
  const date = service.parseDate(req.query.date);
  const data = await service.getSheet({ date, assigneeId: null });

  res.render('schedule/sheet', {
    layout: 'print',
    title: 'Phiếu công việc',
    ...data,
    date,
    people: data.people.map((p) => ({ ...p, tasks: p.tasks.map(withLinks), overdue: p.overdue.map(withLinks) })),
    back: `/today?date=${date}`,
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
      week.map((cell) => ({ ...cell, tasks: cell.tasks.map(withStatus) })),
    ),
  });
}
