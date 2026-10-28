import { z } from 'zod';

const email = z
  .string({ error: 'Vui lòng nhập email' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Email không hợp lệ' }));

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'Vui lòng nhập mật khẩu' }).min(1, 'Vui lòng nhập mật khẩu'),
});

export const signupSchema = z.object({
  name: z.string({ error: 'Vui lòng nhập họ tên' }).trim().min(1, 'Vui lòng nhập họ tên').max(100),
  email,
  password: z.string({ error: 'Vui lòng nhập mật khẩu' }).min(8, 'Mật khẩu tối thiểu 8 ký tự').max(200),
});
