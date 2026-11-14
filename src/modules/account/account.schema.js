// Luật dữ liệu cho trang Tài khoản (mỗi người tự sửa thông tin của mình).
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

const PHONE = z.preprocess(
  (v) => emptyToUndefined(typeof v === 'string' ? v.trim() : v),
  z
    .string()
    .regex(/^\+?[\d\s.()-]+$/, 'Số điện thoại chỉ gồm chữ số')
    .refine((v) => /^\d{9,15}$/.test(v.replace(/\D/g, '')), 'Số điện thoại cần 9–15 chữ số')
    .optional(),
);

// Email và vai trò do quản lý đổi ở trang Nhân viên; ở đây chỉ sửa tên + số điện thoại.
export const profileSchema = z.object({
  name: z.string({ error: 'Vui lòng nhập họ tên' }).trim().min(1, 'Vui lòng nhập họ tên').max(100, 'Tối đa 100 ký tự'),
  phone: PHONE,
});

export const passwordSchema = z
  .object({
    current_password: z.string({ error: 'Vui lòng nhập mật khẩu hiện tại' }).min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    new_password: z
      .string({ error: 'Vui lòng nhập mật khẩu mới' })
      .min(8, 'Mật khẩu tối thiểu 8 ký tự')
      .max(200, 'Mật khẩu quá dài'),
    confirm_password: z.string({ error: 'Vui lòng nhập lại mật khẩu mới' }),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    path: ['confirm_password'],
    message: 'Mật khẩu nhập lại không khớp',
  });
