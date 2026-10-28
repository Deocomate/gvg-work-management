// Dữ liệu cho 2 màn hình xem việc: "Hôm nay" (dòng thời gian) và "Lịch" (theo tháng).
import { addDays, addMonths, isISODate, isISOMonth, monthGrid, nowTimeHM, todayISO } from '#lib/dates.js';
import * as tasksRepo from '#modules/tasks/tasks.repo.js';
import { isManager } from '#modules/tasks/tasks.service.js';

const CHIPS_PER_DAY = 3;

export const parseDate = (value) => (isISODate(value) ? value : todayISO());
export const parseMonth = (value) => (isISOMonth(value) ? value : todayISO().slice(0, 7));

/** Xem việc của ai: nhân viên luôn là chính mình; quản lý chọn được (null = tất cả mọi người). */
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
    prev: addDays(date, -1),
    next: addDays(date, 1),
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
