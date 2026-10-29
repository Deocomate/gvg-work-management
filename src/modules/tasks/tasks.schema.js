// Luật dữ liệu cho form giao việc. Lựa chọn cố định dùng chung cho view và validate.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

export const TASK_STATUSES = [
  { value: 'todo', label: 'Chưa làm', badge: 'badge-gray', bar: 'border-line-strong', chip: 'bg-raised text-ink-soft' },
  { value: 'doing', label: 'Đang làm', badge: 'badge-yellow', bar: 'border-sun-400', chip: 'bg-sun-400/15 text-sun-300' },
  { value: 'done', label: 'Đã xong', badge: 'badge-green', bar: 'border-pine-400', chip: 'bg-pine-500/40 text-pine-200 line-through' },
];

export const TASK_PRIORITIES = [
  { value: 'normal', label: 'Bình thường' },
  { value: 'high', label: 'Quan trọng' },
];

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Không lặp lại' },
  { value: 'weekly', label: 'Lặp lại' },
];

// Nút chọn thứ khi lặp lại, xếp T2 → CN. value = getUTCDay() (0 = Chủ Nhật).
export const REPEAT_WEEKDAYS = [
  { value: 1, label: 'T2', name: 'Thứ Hai' },
  { value: 2, label: 'T3', name: 'Thứ Ba' },
  { value: 3, label: 'T4', name: 'Thứ Tư' },
  { value: 4, label: 'T5', name: 'Thứ Năm' },
  { value: 5, label: 'T6', name: 'Thứ Sáu' },
  { value: 6, label: 'T7', name: 'Thứ Bảy' },
  { value: 0, label: 'CN', name: 'Chủ Nhật' },
];

/** Các thứ đã chọn (chuỗi/mảng từ form) -> mảng số 0–6, bỏ giá trị lạ. */
export const parseWeekdays = (value) =>
  [value ?? []].flat().map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

/** Mô tả ngắn cho các thứ đã chọn: "Mỗi Thứ Hai", "Hằng ngày"… (public/js/app.js có bản giống hệt). */
export function repeatSummary(days) {
  const picked = REPEAT_WEEKDAYS.filter((d) => days.includes(d.value));
  if (picked.length === 0) return 'Chưa chọn thứ';
  if (picked.length === 7) return 'Hằng ngày';
  if (picked.length === 5 && !days.includes(6) && !days.includes(0)) return 'Thứ Hai – Thứ Sáu';
  return `Mỗi ${picked.map((d) => d.name).join(', ')}`;
}

/** Người làm đã chọn (chuỗi/mảng từ form, có thể nhiều người) -> mảng id không trùng, bỏ giá trị lạ. */
export const parseAssigneeIds = (value) => [
  ...new Set([value ?? []].flat().map(Number).filter((id) => Number.isInteger(id) && id > 0)),
];

/** Lặp lại tối đa bao nhiêu ngày kể từ ngày bắt đầu. */
export const MAX_REPEAT_DAYS = 92;

/** Mỗi việc kèm tối đa bao nhiêu link liên quan. */
export const MAX_TASK_LINKS = 10;

/** Ô "Link liên quan": mỗi dòng một link -> mảng link, bỏ dòng trống. */
export const splitLinks = (text) =>
  (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

// Chỉ nhận http/https: chặn link kiểu "javascript:" chạy mã độc khi người khác bấm vào.
const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);

const values = (options) => options.map((o) => o.value);
const optionalEnum = (options, fallback, error) =>
  z.preprocess(emptyToUndefined, z.enum(values(options), { error }).default(fallback));
const time = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ (HH:MM)').optional(),
);

export const statusSchema = z.enum(values(TASK_STATUSES), { error: 'Trạng thái không hợp lệ' });

export const taskSchema = z
  .object({
    title: z
      .string({ error: 'Vui lòng nhập tên công việc' })
      .trim()
      .min(1, 'Vui lòng nhập tên công việc')
      .max(200, 'Tối đa 200 ký tự'),
    note: z.preprocess(emptyToUndefined, z.string().trim().max(2000, 'Ghi chú tối đa 2000 ký tự').optional()),
    facilities: z.preprocess(emptyToUndefined, z.string().trim().max(2000, 'Tối đa 2000 ký tự').optional()),
    // Lưu dạng chuỗi, mỗi dòng một link (đã bỏ dòng trống); không có link -> undefined.
    links: z
      .preprocess(emptyToUndefined, z.string().optional())
      .superRefine((text, ctx) => {
        const lines = splitLinks(text);
        if (lines.length > MAX_TASK_LINKS) {
          ctx.addIssue({ code: 'custom', message: `Tối đa ${MAX_TASK_LINKS} link` });
          return;
        }
        const bad = lines.findIndex((line) => !httpUrl.safeParse(line).success);
        if (bad >= 0) {
          ctx.addIssue({ code: 'custom', message: `Dòng ${bad + 1}: link phải bắt đầu bằng http:// hoặc https://` });
        }
      })
      .transform((text) => splitLinks(text).join('\n') || undefined),
    assignee_id: z.coerce
      .number({ error: 'Vui lòng chọn người thực hiện' })
      .int()
      .positive('Vui lòng chọn người thực hiện'),
    date: z.iso.date({ error: 'Vui lòng chọn ngày' }),
    start_time: time,
    end_time: time,
    priority: optionalEnum(TASK_PRIORITIES, 'normal', 'Mức ưu tiên không hợp lệ'),
    status: optionalEnum(TASK_STATUSES, 'todo', 'Trạng thái không hợp lệ'),
  })
  .superRefine((data, ctx) => {
    if (data.end_time && !data.start_time) {
      ctx.addIssue({ code: 'custom', path: ['start_time'], message: 'Nhập giờ bắt đầu trước' });
    }
    if (data.start_time && data.end_time && data.end_time <= data.start_time) {
      ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'Giờ kết thúc phải sau giờ bắt đầu' });
    }
  });

export const repeatSchema = z.object({
  repeat: optionalEnum(REPEAT_OPTIONS, 'none', 'Kiểu lặp không hợp lệ'),
  repeat_days: z.preprocess(parseWeekdays, z.array(z.number())),
  repeat_until: z.preprocess(emptyToUndefined, z.iso.date({ error: 'Ngày không hợp lệ' }).optional()),
});
