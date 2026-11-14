// Màn hình "Hôm nay" và "Lịch". Chỉ đọc dữ liệu; thao tác thật nằm ở module tasks.
import { BRANDS, NO_BRAND, brandInfo, parseBrandFilter } from '#lib/brands.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import { TASK_STATUSES } from '#modules/tasks/tasks.schema.js';
import { canChangeStatus, canEdit, isManager, taskLinks } from '#modules/tasks/tasks.service.js';
import * as service from './schedule.service.js';

const statusInfo = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s]));
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEK_CELL_LIMIT = 4; // số việc tối đa mỗi ô lịch tuần (trang Lịch làm việc), còn lại "+N việc khác"

// Loại việc hiện trên lịch tuần: việc từ Plan theo plan_kind, việc khác đoán theo chữ đầu tên việc.
const TASK_KINDS = {
  shoot: { label: 'Quay', badge: 'kind-shoot' },
  edit: { label: 'Dựng', badge: 'kind-edit' },
  post: { label: 'Đăng', badge: 'kind-post' },
  other: { label: 'Khác', badge: 'kind-other' },
};
export function taskKind(task) {
  if (task.plan_kind === 'shoot' || task.plan_kind === 'post') return TASK_KINDS[task.plan_kind];
  const head = String(task.title || '').replace(/^[^p{L}]+/u, '').toLowerCase();
  if (head.startsWith('quay')) return TASK_KINDS.shoot;
  if (head.startsWith('dựng') || head.startsWith('edit')) return TASK_KINDS.edit;
  if (head.startsWith('đăng')) return TASK_KINDS.post;
  return TASK_KINDS.other;
}
// Tên việc trên ô tuần: bỏ tiền tố "🎬 Quay: " / "📤 Đăng: " vì đã có nhãn loại việc
const shortTitle = (title) => String(title || '').replace(/^S*s*(Quay|Đăng|Dựng)s*:s*/u, '');
// "Nguyễn Thị Hoa, Lê Văn Nam" → "Hoa, Nam" (tên gọi = chữ cuối)
const givenNames = (names) => String(names || '').split(',').map((n) => n.replace(/(xong)/, '').trim().split(/s+/).pop()).filter(Boolean).join(', ');
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
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
// Ô lịch tuần: thêm loại việc, tên ngắn, tên người phụ trách (khi xem cả nhóm)
const weekCell = (task) => ({
  ...withStatus(task),
  kind: taskKind(task),
  shortTitle: shortTitle(task.title),
  who: givenNames([task.assignee_name, task.coworkers].filter(Boolean).join(', ')),
});
const withLinks = (task) => ({ ...task, linkList: taskLinks(task) });

// Trang chính "Lịch làm việc": thanh công cụ tuần → bảng chấm công tuần → lịch việc 7 ngày → chi tiết ngày + việc tồn.
export async function today(req, res) {
  const date = service.parseDate(req.query.date);
  const viewer = await viewerContext(req);
  const [day, week] = await Promise.all([
    service.getDay({ date, assigneeId: viewer.assigneeId, brand: viewer.brand }),
    service.getWeek({ date, assigneeId: viewer.assigneeId, brand: viewer.brand }),
  ]);
  const withRights = decorate(req.user);
  const overdue = day.overdue.map((t) => ({ ...withRights(t), shortDate: ddmm(t.date) }));
  const tasks = day.tasks.map(withRights);
  const days = week.days.map((d, i) => ({
    ...d,
    weekdayLabel: WEEKDAY_LABELS[i],
    ddmm: ddmm(d.date),
    isSelected: d.date === date,
    tasks: d.tasks.map(withStatus),
    // Mỗi ô chỉ liệt kê vài việc đầu cho lịch tuần gọn; còn lại "+N việc khác" mở chi tiết ngày đó bên dưới
    shown: d.tasks.slice(0, WEEK_CELL_LIMIT).map(weekCell),
    more: Math.max(0, d.tasks.length - WEEK_CELL_LIMIT),
  }));
  const first = days[0].date;
  const last = days[6].date;
  const isThisWeek = first <= day.today && day.today <= last;
  // Lọc người làm cũng áp dụng cho bảng công: tên người đang xem (bảng công tự khớp với tên trong phần Lương)
  const filterName = viewer.manager && viewer.assigneeId
    ? viewer.staffOptions.find((o) => o.value === viewer.assigneeId)?.label ?? ''
    : '';

  res.render('schedule/today', {
    title: 'Lịch làm việc',
    ...viewer,
    ...day,
    date,
    week: { ...week, days, label: `${ddmm(first)} – ${ddmm(last)}/${last.slice(0, 4)}`, isThisWeek },
    tasks,
    // Việc đã xong của ngày đang xem gập lại cho đỡ rối
    activeTasks: tasks.filter((t) => t.status !== 'done'),
    doneTasks: tasks.filter((t) => t.status === 'done'),
    // Việc tồn: hiện vài việc đầu, còn lại gập trong "Xem tất cả"
    overdue,
    overdueTop: overdue.slice(0, OVERDUE_VISIBLE),
    overdueRest: overdue.slice(OVERDUE_VISIBLE),
    att: {
      days: days.map((d) => d.date).join(','),
      focus: String(req.query.att || '').slice(0, 40),
      filterName,
    },
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
