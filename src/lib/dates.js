// Ngày giờ theo múi giờ của app (config.timezone), KHÔNG theo giờ máy chủ —
// server free thường chạy giờ UTC, lệch 7 tiếng so với Việt Nam.
import { config } from '#config';

const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Ngày hôm nay dạng YYYY-MM-DD theo múi giờ app. */
export const todayISO = () => isoDateFormatter.format(new Date());

/** Thời điểm SQLite datetime('now') (UTC "YYYY-MM-DD HH:MM:SS") -> ngày YYYY-MM-DD theo múi giờ app. */
export const appDateOf = (utcDateTime) =>
  utcDateTime ? isoDateFormatter.format(new Date(`${utcDateTime.replace(' ', 'T')}Z`)) : null;

/** Cộng/trừ ngày cho chuỗi YYYY-MM-DD. */
export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM-DD -> DD/MM/YYYY (dùng trong thông báo, không phải trong view). */
export const formatDayVN = (isoDate) => (isoDate ? isoDate.split('-').reverse().join('/') : '');

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: config.timezone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Giờ hiện tại dạng HH:MM theo múi giờ app. */
export const nowTimeHM = () => timeFormatter.format(new Date());

/** Chuỗi có đúng dạng YYYY-MM-DD và là ngày có thật không. */
export const isISODate = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;

/** Thứ trong tuần của YYYY-MM-DD: 0 = Chủ nhật … 6 = Thứ bảy. */
export const weekdayOf = (isoDate) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();

/** Số ngày từ a tới b (b - a). */
export const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000);

/** Chuỗi có đúng dạng tháng YYYY-MM không. */
export const isISOMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** Cộng/trừ tháng cho chuỗi YYYY-MM. */
export function addMonths(month, n) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + n, 1));
  return date.toISOString().slice(0, 7);
}

/** 7 ngày (Thứ 2 → Chủ nhật) của tuần chứa YYYY-MM-DD. */
export function weekDays(isoDate) {
  const start = addDays(isoDate, -((weekdayOf(isoDate) + 6) % 7)); // lùi về Thứ 2
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Lưới lịch tháng YYYY-MM: các tuần (Thứ 2 → Chủ nhật), mỗi tuần 7 ngày YYYY-MM-DD. */
export function monthGrid(month) {
  const first = `${month}-01`;
  const start = addDays(first, -((weekdayOf(first) + 6) % 7)); // lùi về Thứ 2
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  const weeks = [];
  for (let day = start; day <= last || weeks.at(-1)?.length < 7; ) {
    if (!weeks.length || weeks.at(-1).length === 7) weeks.push([]);
    weeks.at(-1).push(day);
    day = addDays(day, 1);
  }
  return weeks;
}
