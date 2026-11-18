// Dữ liệu cho trang Lịch làm việc (/today: lịch tuần + chi tiết ngày) và phiếu công việc in.
import { addDays, isISODate, isISOMonth, nowTimeHM, todayISO, weekDays } from '#lib/dates.js';
import * as tasksRepo from '#modules/tasks/tasks.repo.js';
import { isManager } from '#modules/tasks/tasks.service.js';

export const parseDate = (value) => (isISODate(value) ? value : todayISO());
export const parseMonth = (value) => (isISOMonth(value) ? value : todayISO().slice(0, 7));

/** Giá trị ?user= để quản lý xem việc của tất cả mọi người. */
export const ALL_USERS = 'all';

// Loại việc: việc từ Plan theo plan_kind, việc khác đoán theo chữ đầu tên việc ("Quay …", "Kịch bản: …", "Up website …").
const KIND_PREFIXES = [
  ['shoot', ['quay']],
  ['edit', ['dựng', 'edit']],
  ['post', ['đăng']],
  ['script', ['kịch bản', 'viết kịch bản', 'kb ', 'kb:']],
  ['web', ['up website', 'up web', 'website', 'web ', 'web:']],
];
export function taskKindKey(task) {
  if (task.plan_kind === 'shoot' || task.plan_kind === 'post') return task.plan_kind;
  const head = String(task.title || '').replace(/^[^\p{L}]+/u, '').toLowerCase();
  return KIND_PREFIXES.find(([, words]) => words.some((w) => head.startsWith(w)))?.[0] ?? 'other';
}

// Tab trên trang Lịch làm việc: '' = tất cả việc, còn lại chỉ một loại việc
export const TABS = [
  { value: '', label: 'Tất cả việc', icon: '🗂️' },
  { value: 'dang', label: 'Lịch đăng', icon: '📤', kind: 'post', prefix: 'Đăng: ' },
  { value: 'quay', label: 'Lịch quay', icon: '🎬', kind: 'shoot', prefix: 'Quay: ' },
  { value: 'kich-ban', label: 'Kịch bản', icon: '✍️', kind: 'script', prefix: 'Kịch bản: ' },
  { value: 'web', label: 'Up website', icon: '🌐', kind: 'web', prefix: 'Up website: ' },
];
export const parseTab = (value) => TABS.find((t) => t.value && t.value === value) ?? TABS[0];
const byKind = (kind) => (kind ? (list) => list.filter((t) => taskKindKey(t) === kind) : (list) => list);

/**
 * Xem việc của ai (null = tất cả mọi người).
 * Nhân viên luôn là chính mình; quản lý mặc định xem cả nhóm (khớp với phiếu công việc), chọn được một người.
 */
export function resolveAssignee(user, requested) {
  if (!isManager(user)) return user.id;
  const id = Number(requested);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Việc đang diễn ra / đã trễ so với thời điểm hiện tại (giờ Việt Nam). */
export function timing(task, today, now) {
  const done = task.status === 'done';
  const isToday = task.date === today;
  const started = Boolean(task.start_time) && task.start_time <= now;
  const notEnded = !task.end_time || now < task.end_time;
  return {
    isNow: !done && isToday && started && notEnded,
    isLate: !done && (task.date < today || (isToday && Boolean(task.end_time) && task.end_time <= now)),
  };
}

// Trạng thái chung của việc làm chung: xong khi mọi người xong, chưa làm khi chưa ai bắt đầu.
function groupStatus(copies) {
  if (copies.every((t) => t.status === 'done')) return 'done';
  return copies.every((t) => t.status === 'todo') ? 'todo' : 'doing';
}

/**
 * Gộp các bản của một việc làm chung (cùng group_key) thành một mục — dùng khi xem cả nhóm.
 * Mục gộp giữ id của bản đầu tiên; assignee_name là tên mọi người (ghi "(xong)" cho ai đã xong khi chưa xong hết).
 */
export function mergeGroups(tasks) {
  const groups = new Map();
  const merged = [];
  for (const task of tasks) {
    if (!task.group_key) merged.push(task);
    else if (groups.has(task.group_key)) groups.get(task.group_key).push(task);
    else {
      const copies = [task];
      groups.set(task.group_key, copies);
      merged.push(copies);
    }
  }
  return merged.map((item) => {
    if (!Array.isArray(item)) return item;
    if (item.length === 1) return item[0];
    const status = groupStatus(item);
    const names = item.map((t) => (status !== 'done' && t.status === 'done' ? `${t.assignee_name} (xong)` : t.assignee_name));
    return { ...item[0], status, assignee_name: names.join(', '), coworkers: null, isGroup: true };
  });
}

// perPerson: giữ mỗi người một bản (phiếu công việc); không thì xem cả nhóm sẽ gộp việc làm chung.
export async function getDay({ date, assigneeId, brand = '', kind = '', perPerson = false }) {
  const today = todayISO();
  const now = nowTimeHM();
  const only = byKind(kind);
  const merge = assigneeId || perPerson ? only : (list) => mergeGroups(only(list));
  const [tasks, overdue] = await Promise.all([
    tasksRepo.listForDay({ date, assigneeId, brand }).then(merge),
    date === today ? tasksRepo.listOverdue({ beforeDate: today, assigneeId, brand }).then(merge) : [],
  ]);

  const items = tasks.map((t) => ({ ...t, ...timing(t, today, now) }));
  const count = (fn) => items.filter(fn).length;
  const done = count((t) => t.status === 'done');
  return {
    tasks: items,
    overdue: overdue.map((t) => ({ ...t, isLate: true })),
    summary: {
      total: items.length,
      done,
      doing: count((t) => t.status === 'doing'),
      late: count((t) => t.isLate),
      percent: items.length ? Math.round((done / items.length) * 100) : 0,
    },
    isToday: date === today,
    today,
  };
}

/** Phiếu công việc trong ngày: việc của ngày (và việc tồn nếu là hôm nay) gom theo từng người làm. */
export async function getSheet({ date, assigneeId }) {
  const day = await getDay({ date, assigneeId, perPerson: true });
  const people = new Map();
  const add = (task, key) => {
    const person = people.get(task.assignee_id) ?? { name: task.assignee_name, tasks: [], overdue: [] };
    person[key].push(task);
    people.set(task.assignee_id, person);
  };
  day.tasks.forEach((t) => add(t, 'tasks'));
  day.overdue.forEach((t) => add(t, 'overdue'));

  return {
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    isToday: day.isToday,
  };
}

/**
 * Phiếu công việc theo tuần (T2–CN của tuần chứa `date`): mỗi người một bảng, việc chia theo từng ngày.
 * Mỗi người giữ bản riêng của việc làm chung (như phiếu ngày); ngày không có việc của người đó thì bỏ.
 */
export async function getWeekSheet({ date }) {
  const days = weekDays(date);
  const tasks = await tasksRepo.listForRange({ from: days[0], to: days[6], assigneeId: null });
  const people = new Map();
  for (const task of tasks) {
    const person = people.get(task.assignee_id) ?? { name: task.assignee_name, byDate: new Map(), total: 0, done: 0 };
    person.byDate.set(task.date, [...(person.byDate.get(task.date) ?? []), task]);
    person.total += 1;
    if (task.status === 'done') person.done += 1;
    people.set(task.assignee_id, person);
  }
  return {
    days,
    people: [...people.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map(({ byDate, ...p }) => ({ ...p, days: days.filter((d) => byDate.has(d)).map((d) => ({ date: d, tasks: byDate.get(d) })) })),
    prev: addDays(date, -7),
    next: addDays(date, 7),
  };
}

/** 7 ngày (T2–CN) của tuần chứa `date`, mỗi ngày kèm danh sách việc — dải lịch tuần trên trang "Hôm nay". */
export async function getWeek({ date, assigneeId, brand = '', kind = '' }) {
  const days = weekDays(date);
  const today = todayISO();
  const tasks = byKind(kind)(await tasksRepo.listForRange({ from: days[0], to: days[6], assigneeId, brand }));
  const list = assigneeId ? tasks : mergeGroups(tasks);

  return {
    days: days.map((day) => {
      const dayTasks = list.filter((t) => t.date === day);
      const unfinished = dayTasks.filter((t) => t.status !== 'done').length;
      return {
        date: day,
        // Ngày 1 kèm tháng để biết tuần đã sang tháng mới
        dayLabel: day.endsWith('-01') ? `1/${Number(day.slice(5, 7))}` : Number(day.slice(8)),
        isToday: day === today,
        isPast: day < today,
        unfinished,
        hasLate: day < today && unfinished > 0,
        tasks: dayTasks,
      };
    }),
    // Sang tuần trước/sau, giữ nguyên thứ đang chọn
    prev: addDays(date, -7),
    next: addDays(date, 7),
  };
}
