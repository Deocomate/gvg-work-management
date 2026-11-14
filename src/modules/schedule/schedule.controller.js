// Màn hình "Hôm nay" và "Lịch". Chỉ đọc dữ liệu; thao tác thật nằm ở module tasks.
import { BRANDS, NO_BRAND, brandInfo, parseBrandFilter } from '#lib/brands.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import { TASK_STATUSES } from '#modules/tasks/tasks.schema.js';
import { canChangeStatus, canEdit, isManager, taskLinks } from '#modules/tasks/tasks.service.js';
import * as service from './schedule.service.js';

const statusInfo = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s]));
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEK_CELL_LIMIT = 4; // số việc tối đa mỗi ô lịch tuần (trang Hôm nay)
const OVERDUE_VISIBLE = 3; // số việc tồn hiện sẵn, còn lại gập lại

const decorate = (user) => (task) => ({
  ...task,
  statusInfo: statusInfo[task.status],
  brandInfo: brandInfo(task.brand),
  isHigh: task.priority === 'high',
  linkList: taskLinks(task),
  canEdit: canEdit(user, task),
  canStatus: canChangeStatus(user, task),
});

// Phần chung: bộ lọc nhân viên cho quản lý, bộ lọc brand cho mọi người.
async function viewerContext(req) {
  const manager = isManager(req.user);
  const assigneeId = service.resolveAssignee(req.user, req.query.user);
  const selectedUser = manager ? (assigneeId ?? service.ALL_USERS) : '';
  const brand = parseBrandFilter(req.query.brand);
  const brandQuery = brand ? `&brand=${encodeURIComponent(brand)}` : '';
  return {
    brand,
    brandQuery,
    brandOptions: [
      { value: '', label: 'Tất cả brand' },
      ...BRANDS.map((b) => ({ value: b.value, label: b.label })),
      { value: NO_BRAND, label: 'Chưa gắn brand' },
    ],
    assigneeId,
    manager,
    showAssignee: manager && !assigneeId,
    staffOptions: manager ? await staffOptions() : [],
    allUsers: service.ALL_USERS,
    selectedUser,
    // Giữ lựa chọn nhân viên (quản lý) + brand khi chuyển ngày/tuần/tháng
    userQuery: (manager ? `&user=${selectedUser}` : '') + brandQuery,
  };
}

const withStatus = (task) => ({ ...task, statusInfo: statusInfo[task.status], brandInfo: brandInfo(task.brand) });
const withLinks = (task) => ({ ...task, linkList: taskLinks(task) });

// Trang chính: lịch tuần ở trên, việc của ngày đang chọn ở dưới.
export async function today(req, res) {
  const date = service.parseDate(req.query.date);
  const viewer = await viewerContext(req);
  const [day, week] = await Promise.all([
    service.getDay({ date, assigneeId: viewer.assigneeId, brand: viewer.brand }),
    service.getWeek({ date, assigneeId: viewer.assigneeId, brand: viewer.brand }),
  ]);
  const withRights = decorate(req.user);
  const overdue = day.overdue.map((t) => ({ ...withRights(t), shortDate: `${t.date.slice(8, 10)}/${t.date.slice(5, 7)}` }));

  res.render('schedule/today', {
    title: day.isToday ? 'Việc hôm nay' : 'Việc trong ngày',
    ...viewer,
    ...day,
    date,
    week: {
      ...week,
      days: week.days.map((d, i) => ({
        ...d,
        weekdayLabel: WEEKDAY_LABELS[i],
        tasks: d.tasks.map(withStatus),
        // Máy tính: mỗi ô chỉ liệt kê vài việc cho lịch tuần gọn; còn lại ghi "+N việc"
        shown: d.tasks.slice(0, WEEK_CELL_LIMIT).map(withStatus),
        more: Math.max(0, d.tasks.length - WEEK_CELL_LIMIT),
      })),
    },
    tasks: day.tasks.map(withRights),
    // Việc tồn: hiện vài việc đầu, còn lại gập trong "Xem thêm"
    overdue,
    overdueTop: overdue.slice(0, OVERDUE_VISIBLE),
    overdueRest: overdue.slice(OVERDUE_VISIBLE),
    back: `/today?date=${date}${viewer.userQuery}`,
  });
}

// Phiếu công việc trong ngày (trang in được): luôn gồm việc của tất cả mọi người trong một phiếu.
// ?range=week: phiếu cả tuần (T2–CN) chứa ngày đó.
export async function sheet(req, res) {
  const date = service.parseDate(req.query.date);
  if (req.query.range === 'week') return weekSheet(res, date);
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

async function weekSheet(res, date) {
  const data = await service.getWeekSheet({ date });
  res.render('schedule/sheet-week', {
    layout: 'print',
    title: 'Phiếu công việc tuần',
    ...data,
    date,
    from: data.days[0],
    to: data.days[6],
    people: data.people.map((p) => ({ ...p, days: p.days.map((d) => ({ ...d, tasks: d.tasks.map(withLinks) })) })),
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
