// Luật dữ liệu cho form link tài liệu và form thư mục.
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
  // Trống = "Chưa phân loại". Thư mục có thật hay không do service kiểm tra.
  folder_id: z.preprocess(emptyToUndefined, z.coerce.number({ error: 'Thư mục không hợp lệ' }).int().positive('Thư mục không hợp lệ').optional()),
});

export const folderSchema = z.object({
  name: z.string({ error: 'Vui lòng nhập tên thư mục' }).trim().min(1, 'Vui lòng nhập tên thư mục').max(80, 'Tối đa 80 ký tự'),
});
