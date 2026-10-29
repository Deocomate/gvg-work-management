// Luật dữ liệu cho form link tài liệu.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

export const linkSchema = z.object({
  title: z.string({ error: 'Vui lòng nhập tên tài liệu' }).trim().min(1, 'Vui lòng nhập tên tài liệu').max(200, 'Tối đa 200 ký tự'),
  // Chỉ nhận http/https: chặn link kiểu "javascript:" chạy mã độc khi người khác bấm vào.
  url: z
    .string({ error: 'Vui lòng nhập đường link' })
    .trim()
    .min(1, 'Vui lòng nhập đường link')
    .max(2000, 'Link quá dài')
    .pipe(z.url({ protocol: /^https?$/, error: 'Link phải bắt đầu bằng http:// hoặc https://' })),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').optional()),
});
