// Nghiệp vụ trang Tài khoản: xem thông tin chung, sửa tên/số điện thoại, đổi mật khẩu.
import { notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { hashPassword, verifyPassword } from '#modules/auth/auth.service.js';
import { profileSchema, passwordSchema } from './account.schema.js';
import * as repo from './account.repo.js';

export async function getAccount(id) {
  const user = await repo.findById(id);
  if (!user) throw notFound('Không tìm thấy tài khoản.');
  return user;
}

export async function updateProfile(id, input) {
  const result = validate(profileSchema, input);
  if (!result.ok) return result;
  await repo.updateProfile(id, result.data);
  return { ok: true };
}

export async function changePassword(id, input) {
  const result = validate(passwordSchema, input);
  if (!result.ok) return result;
  const { current_password, new_password } = result.data;
  if (!(await verifyPassword(current_password, await repo.findHashById(id)))) {
    return { ok: false, errors: { current_password: 'Mật khẩu hiện tại không đúng' } };
  }
  await repo.updatePassword(id, await hashPassword(new_password));
  return { ok: true };
}
