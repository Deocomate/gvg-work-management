// Luật dữ liệu cho form Plan nội dung. Lựa chọn cố định dùng chung cho view, bộ lọc và validate.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

export const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok', badge: 'badge-gray' },
  { value: 'facebook', label: 'Facebook', badge: 'badge-gray' },
  { value: 'instagram', label: 'Instagram', badge: 'badge-gray' },
  { value: 'youtube', label: 'YouTube', badge: 'badge-gray' },
  { value: 'other', label: 'Khác', badge: 'badge-gray' },
];

// chip = màu ô trên lịch tháng
export const PLAN_STATUSES = [
  { value: 'idea', label: 'Ý tưởng', badge: 'badge-gray', chip: 'bg-raised text-ink-soft' },
  { value: 'scheduled', label: 'Đã lên lịch', badge: 'badge-blue', chip: 'bg-sky-400/15 text-sky-300 light:text-sky-700' },
  { value: 'filmed', label: 'Đã quay', badge: 'badge-yellow', chip: 'bg-sun-400/15 text-sun-300' },
  { value: 'posted', label: 'Đã đăng', badge: 'badge-green', chip: 'bg-pine-500/40 text-pine-200' },
  { value: 'dropped', label: 'Bỏ', badge: 'badge-red', chip: 'bg-brand-500/15 text-brand-300 line-through' },
];

const values = (list) => list.map((o) => o.value);
const optionalText = (max, message) => z.preprocess(emptyToUndefined, z.string().trim().max(max, message).optional());
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(2000, 'Link quá dài')
    // Chỉ http/https: chặn link "javascript:" chạy mã độc khi người khác bấm vào.
    .pipe(z.url({ protocol: /^https?$/, error: 'Link phải bắt đầu bằng http:// hoặc https://' }))
    .optional(),
);
const optionalDate = z.preprocess(emptyToUndefined, z.iso.date({ error: 'Ngày không hợp lệ' }).optional());

export const planSchema = z
  .object({
    title: z.string({ error: 'Vui lòng nhập tên ý tưởng' }).trim().min(1, 'Vui lòng nhập tên ý tưởng').max(200, 'Tối đa 200 ký tự'),
    description: optionalText(3000, 'Tối đa 3000 ký tự'),
    reference_url: optionalUrl,
    platform: z.preprocess((v) => emptyToUndefined(v) ?? 'tiktok', z.enum(values(PLATFORMS), { error: 'Kênh không hợp lệ' })),
    topic: optionalText(80, 'Tối đa 80 ký tự'),
    status: z.preprocess((v) => emptyToUndefined(v) ?? 'idea', z.enum(values(PLAN_STATUSES), { error: 'Trạng thái không hợp lệ' })),
    shoot_date: optionalDate,
    post_date: optionalDate,
    post_time: z.preprocess(emptyToUndefined, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ').optional()),
    post_url: optionalUrl,
    owner_id: z.preprocess(emptyToUndefined, z.coerce.number({ error: 'Người phụ trách không hợp lệ' }).int().positive().optional()),
  })
  .refine((d) => !d.shoot_date || !d.post_date || d.shoot_date <= d.post_date, {
    path: ['post_date'],
    message: 'Ngày đăng phải sau hoặc cùng ngày quay',
  });
