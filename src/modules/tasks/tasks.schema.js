// Luật dữ liệu cho form giao việc. Lựa chọn cố định dùng chung cho view và validate.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

export const TASK_STATUSES = [
  { value: 'todo', label: 'Chưa làm', badge: 'badge-gray', bar: 'border-slate-300', chip: 'bg-slate-100 text-slate-700' },
  { value: 'doing', label: 'Đang làm', badge: 'badge-yellow', bar: 'border-amber-400', chip: 'bg-amber-50 text-amber-800' },
  { value: 'done', label: 'Đã xong', badge: 'badge-green', bar: 'border-emerald-400', chip: 'bg-emerald-50 text-emerald-700 line-through' },
];

export const TASK_PRIORITIES = [
  { value: 'normal', label: 'Bình thường' },
  { value: 'high', label: 'Quan trọng' },
];

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Không lặp lại' },
  { value: 'daily', label: 'Hằng ngày' },
  { value: 'weekdays', label: 'Thứ 2 – Thứ 6' },
  { value: 'weekly', label: 'Hằng tuần (cùng thứ)' },
];

/** Lặp lại tối đa bao nhiêu ngày kể từ ngày bắt đầu. */
export const MAX_REPEAT_DAYS = 92;

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
  repeat_until: z.preprocess(emptyToUndefined, z.iso.date({ error: 'Ngày không hợp lệ' }).optional()),
});
