// Dữ liệu cho 2 màn hình xem việc: "Hôm nay" (dòng thời gian) và "Lịch" (theo tháng).
import { addDays, addMonths, isISODate, isISOMonth, monthGrid, nowTimeHM, todayISO, weekDays } from '#lib/dates.js';
import * as tasksRepo from '#modules/tasks/tasks.repo.js';
import { isManager } from '#modules/tasks/tasks.service.js';

const CHIPS_PER_DAY = 3;

export const parseDate = (value) => (isISODate(value) ? value : todayISO());
export const parseMonth = (value) => (isISOMonth(value) ? value : todayISO().slice(0, 7));

/** Giá trị ?user= để quản lý xem việc của tất cả mọi người. */
export const ALL_USERS = 'all';

/**
 * Xem việc của ai: mặc định ai đăng nhập thì thấy việc của người đó.
 * Nhân viên luôn là chính mình; quản lý chọn được người khác hoặc "all" (null = tất cả mọi người).
 */
export function resolveAssignee(user, requested) {
  if (!isManager(user)) return user.id;
  if (requested === ALL_USERS) return null;
  const id = Number(requested);
  return Number.isInteger(id) && id > 0 ? id : user.id;
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

export async function getDay({ date, assigneeId }) {
  const today = todayISO();
  const now = nowTimeHM();
  const [tasks, overdue] = await Promise.all([
    tasksRepo.listForDay({ date, assigneeId }),
    date === today ? tasksRepo.listOverdue({ beforeDate: today, assigneeId }) : [],
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
  const day = await getDay({ date, assigneeId });
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

/** 7 ngày (T2–CN) của tuần chứa `date`, mỗi ngày kèm danh sách việc — dải lịch tuần trên trang "Hôm nay". */
export async function getWeek({ date, assigneeId }) {
  const days = weekDays(date);
  const today = todayISO();
  const tasks = await tasksRepo.listForRange({ from: days[0], to: days[6], assigneeId });

  return {
    days: days.map((day) => {
      const list = tasks.filter((t) => t.date === day);
      const unfinished = list.filter((t) => t.status !== 'done').length;
      return {
        date: day,
        // Ngày 1 kèm tháng để biết tuần đã sang tháng mới
        dayLabel: day.endsWith('-01') ? `1/${Number(day.slice(5, 7))}` : Number(day.slice(8)),
        isToday: day === today,
        isPast: day < today,
        unfinished,
        hasLate: day < today && unfinished > 0,
        tasks: list,
      };
    }),
    // Sang tuần trước/sau, giữ nguyên thứ đang chọn
    prev: addDays(date, -7),
    next: addDays(date, 7),
  };
}

export async function getMonth({ month, assigneeId }) {
  const weeks = monthGrid(month);
  const today = todayISO();
  const tasks = await tasksRepo.listForRange({ from: weeks[0][0], to: weeks.at(-1)[6], assigneeId });

  const byDate = new Map();
  for (const task of tasks) byDate.set(task.date, [...(byDate.get(task.date) ?? []), task]);

  const toCell = (date) => {
    const list = byDate.get(date) ?? [];
    const unfinished = list.filter((t) => t.status !== 'done').length;
    return {
      date,
      day: Number(date.slice(8)),
      inMonth: date.startsWith(month),
      isToday: date === today,
      total: list.length,
      unfinished,
      hasLate: date < today && unfinished > 0,
      tasks: list.slice(0, CHIPS_PER_DAY),
      more: Math.max(0, list.length - CHIPS_PER_DAY),
    };
  };

  return {
    weeks: weeks.map((week) => week.map(toCell)),
    prev: addMonths(month, -1),
    next: addMonths(month, 1),
    thisMonth: today.slice(0, 7),
  };
}
