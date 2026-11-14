// Nghiệp vụ tài khoản nhân viên (chỉ quản lý dùng).
import { forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { hashPassword } from '#modules/auth/auth.service.js';
import * as authRepo from '#modules/auth/auth.repo.js';
import { createStaffSchema, updateStaffSchema } from './staff.schema.js';
import * as repo from './staff.repo.js';
import { payrollAccountOptions } from '#modules/payroll/payroll.mount.js';

/** Kiểm tra ô "Tài khoản lương": phải có trong app lương và chưa ai khác dùng. Trả về lỗi (chuỗi) hoặc null. */
async function payrollWhoError(who, exceptId = 0) {
  if (!who) return null;
  const options = await payrollAccountOptions();
  if (!options.some((o) => o.value === who)) return 'Tài khoản lương này không có trong phần Lương.';
  if (await repo.payrollWhoTaken(who, exceptId)) return 'Tài khoản lương này đã liên kết với người khác.';
  return null;
}

export const listStaff = () => repo.listAll();

/** Danh sách cho ô chọn người thực hiện: [{ value, label }]. */
export async function staffOptions() {
  const users = await repo.listAll();
  return users.map((u) => ({ value: u.id, label: u.name }));
}

export async function getStaff(id) {
  const user = await repo.findById(id);
  if (!user) throw notFound('Không tìm thấy nhân viên này.');
  return user;
}

export async function createStaff(input) {
  const result = validate(createStaffSchema, input);
  if (!result.ok) return result;
  const { name, email, phone, role, password, payroll_who } = result.data;
  if (await repo.emailTaken(email)) return { ok: false, errors: { email: 'Email này đã được sử dụng.' } };
  const payrollError = await payrollWhoError(payroll_who);
  if (payrollError) return { ok: false, errors: { payroll_who: payrollError } };
  const user = await authRepo.create({ name, email, phone, role, passwordHash: await hashPassword(password) });
  if (payroll_who) await repo.setPayrollWho(user.id, payroll_who);
  return { ok: true, data: user };
}

export async function updateStaff(id, input, currentUser) {
  const existing = await getStaff(id);
  const result = validate(updateStaffSchema, input);
  if (!result.ok) return result;
  const { password, payroll_who, ...data } = result.data;

  if (await repo.emailTaken(data.email, id)) return { ok: false, errors: { email: 'Email này đã được sử dụng.' } };
  const payrollError = await payrollWhoError(payroll_who, id);
  if (payrollError) return { ok: false, errors: { payroll_who: payrollError } };
  // Không để app mất người quản lý cuối cùng / tự khoá mình.
  if (existing.role === 'admin' && data.role !== 'admin') {
    if (id === currentUser.id) return { ok: false, errors: { role: 'Bạn không thể tự bỏ quyền quản lý của mình.' } };
    if ((await repo.countAdmins()) <= 1) return { ok: false, errors: { role: 'Cần ít nhất một quản lý.' } };
  }

  const user = await repo.update(id, data);
  await repo.setPayrollWho(id, payroll_who);
  if (password) await repo.updatePassword(id, await hashPassword(password));
  return { ok: true, data: user };
}

export async function deleteStaff(id, currentUser) {
  if (id === currentUser.id) throw forbidden('Bạn không thể xoá tài khoản của chính mình.');
  const deleted = await repo.remove(id);
  if (!deleted) throw notFound('Không tìm thấy nhân viên này.');
}
