// Luật dữ liệu cho form tài khoản nhân viên.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

export const ROLES = [
  { value: 'member', label: 'Nhân viên', badge: 'badge-gray' },
  { value: 'admin', label: 'Quản lý', badge: 'badge-pink' },
];

const base = {
  name: z.string({ error: 'Vui lòng nhập họ tên' }).trim().min(1, 'Vui lòng nhập họ tên').max(100, 'Tối đa 100 ký tự'),
  email: z
    .string({ error: 'Vui lòng nhập email' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Email không hợp lệ' })),
  // Không bắt buộc. Cho phép dấu cách, chấm, gạch, ngoặc và + đầu số quốc tế.
  phone: z.preprocess(
    (v) => emptyToUndefined(typeof v === 'string' ? v.trim() : v),
    z
      .string()
      .regex(/^\+?[\d\s.()-]+$/, 'Số điện thoại chỉ gồm chữ số')
      .refine((v) => /^\d{9,15}$/.test(v.replace(/\D/g, '')), 'Số điện thoại cần 9–15 chữ số')
      .optional(),
  ),
  role: z.enum(
    ROLES.map((r) => r.value),
    { error: 'Vai trò không hợp lệ' },
  ),
};

const password = z
  .string({ error: 'Vui lòng nhập mật khẩu' })
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(200, 'Mật khẩu quá dài');

export const createStaffSchema = z.object({ ...base, password });

// Khi sửa: để trống mật khẩu = giữ nguyên.
export const updateStaffSchema = z.object({ ...base, password: z.preprocess(emptyToUndefined, password.optional()) });
