// Helper Handlebars dùng chung. Thêm helper mới ở đây, không viết logic phức tạp trong .hbs.
import { config } from '#config';

const { locale, timezone } = config;
const DAY = { day: '2-digit', month: '2-digit', year: 'numeric' };
const WEEKDAY = { weekday: 'long', ...DAY };
const dateTimeFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: timezone });
// Thời điểm (datetime) hiển thị theo múi giờ app; ngày thuần "YYYY-MM-DD" giữ nguyên ngày (đọc như UTC).
const dayFormatters = {
  instant: new Intl.DateTimeFormat(locale, { ...DAY, timeZone: timezone }),
  plain: new Intl.DateTimeFormat(locale, { ...DAY, timeZone: 'UTC' }),
};
const weekdayFormatters = {
  instant: new Intl.DateTimeFormat(locale, { ...WEEKDAY, timeZone: timezone }),
  plain: new Intl.DateTimeFormat(locale, { ...WEEKDAY, timeZone: 'UTC' }),
};
const numberFormatter = new Intl.NumberFormat(locale);

const isPlainDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const formatWith = (formatters, value) => {
  const date = toDate(value);
  return date ? formatters[isPlainDate(value) ? 'plain' : 'instant'].format(date) : '';
};

// SQLite lưu datetime('now') dạng UTC "YYYY-MM-DD HH:MM:SS" -> chuyển sang Date chuẩn.
const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const helpers = {
  eq: (a, b) => a == b, // so sánh lỏng vì dữ liệu form là chuỗi
  ne: (a, b) => a != b,
  and: (...args) => args.slice(0, -1).every(Boolean),
  or: (...args) => args.slice(0, -1).some(Boolean),
  not: (value) => !value,
  gt: (a, b) => Number(a) > Number(b),
  lt: (a, b) => Number(a) < Number(b),
  abs: (value) => Math.abs(Number(value)),
  // Số thứ tự từ @index: {{inc @index}} -> 1, 2…; {{inc @index 3}} -> 4, 5…
  inc: (value, ...args) => Number(value) + 1 + (args.length > 1 ? Number(args[0]) || 0 : 0),
  // Ngày giờ: "28/10/2026, 14:30"
  formatDate: (value) => {
    const date = toDate(value);
    return date ? dateTimeFormatter.format(date) : '';
  },
  // Chỉ ngày: "28/10/2026"
  formatDay: (value) => formatWith(dayFormatters, value),
  // Thứ + ngày: "Thứ Tư, 28/10/2026"
  formatWeekday: (value) => formatWith(weekdayFormatters, value),
  formatNumber: (value) => (value == null || value === '' ? '' : numberFormatter.format(Number(value))),
  json: (value) => JSON.stringify(value),
  // Ghép chuỗi trong view: (concat "/tasks/" id "/edit")
  concat: (...args) => args.slice(0, -1).join(''),
  // Đặt giá trị vào tham số URL an toàn: href="/x?back={{urlEncode back}}"
  urlEncode: (value) => encodeURIComponent(value ?? ''),
  // Dùng trong <option>/<input type=checkbox>: {{selected status 'done'}}
  selected: (a, b) => (a == b ? 'selected' : ''),
  checked: (value) => (value ? 'checked' : ''),
  // Giữ giá trị cũ khi form lỗi: {{default values.title ''}}
  default: (value, fallback) => value ?? fallback,
  // Link menu đang active: "/" chỉ khớp chính xác, link khác khớp theo tiền tố.
  isActive: (currentPath, href) =>
    href === '/' ? currentPath === '/' : currentPath === href || currentPath?.startsWith(`${href}/`),
};
