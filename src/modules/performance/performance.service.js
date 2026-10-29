// Hiệu suất làm việc theo tuần (chỉ quản lý xem). Chỉ đọc dữ liệu, không có bảng riêng.
// Cách tính cho mỗi người, trên các việc có ngày nằm trong tuần:
//   - Đã xong: trạng thái "Đã xong".
//   - Đúng hạn: xong trong hoặc trước ngày của việc (theo giờ Việt Nam); Xong trễ: xong sau ngày đó.
//   - Quá hạn: ngày của việc đã qua mà vẫn chưa xong.
//   - Hoàn thành = Đã xong / Tổng việc; Đúng hạn % = Đúng hạn / Đã xong.
import { addDays, appDateOf, todayISO, weekDays } from '#lib/dates.js';
import { listStaff } from '#modules/staff/staff.service.js';
import * as tasksRepo from '#modules/tasks/tasks.repo.js';

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

/** Gom số liệu của một nhóm việc. */
export function stats(tasks, today) {
  const done = tasks.filter((t) => t.status === 'done');
  const onTime = done.filter((t) => (appDateOf(t.done_at) ?? t.date) <= t.date).length;
  return {
    total: tasks.length,
    done: done.length,
    onTime,
    doneLate: done.length - onTime,
    doing: tasks.filter((t) => t.status === 'doing').length,
    overdue: tasks.filter((t) => t.status !== 'done' && t.date < today).length,
    completion: percent(done.length, tasks.length),
    onTimeRate: percent(onTime, done.length),
  };
}

/** Bảng theo từng người: người nhiều việc hoàn thành lên trước, người chưa có việc xuống cuối. */
export function buildRows({ users, tasks, prevTasks, today }) {
  const byUser = (list, id) => list.filter((t) => t.assignee_id === id);
  return users
    .map((user) => {
      const current = stats(byUser(tasks, user.id), today);
      const previous = stats(byUser(prevTasks, user.id), today);
      const change = current.completion !== null && previous.completion !== null ? current.completion - previous.completion : null;
      return { id: user.id, name: user.name, ...current, change };
    })
    .sort((a, b) => (b.completion ?? -1) - (a.completion ?? -1) || b.done - a.done || a.name.localeCompare(b.name, 'vi'));
}

export async function getWeekReport(date) {
  const days = weekDays(date);
  const today = todayISO();
  const prevDays = weekDays(addDays(date, -7));
  const [users, tasks, prevTasks] = await Promise.all([
    listStaff(),
    tasksRepo.listForRange({ from: days[0], to: days[6], assigneeId: null }),
    tasksRepo.listForRange({ from: prevDays[0], to: prevDays[6], assigneeId: null }),
  ]);

  return {
    from: days[0],
    to: days[6],
    rows: buildRows({ users, tasks, prevTasks, today }),
    team: stats(tasks, today),
    prev: addDays(date, -7),
    next: addDays(date, 7),
    isThisWeek: days.includes(today),
    today,
  };
}
