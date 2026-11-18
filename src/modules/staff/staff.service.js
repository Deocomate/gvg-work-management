// Nghiệp vụ tài khoản nhân viên (chỉ quản lý dùng).
import { forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { hashPassword } from '#modules/auth/auth.service.js';
import * as authRepo from '#modules/auth/auth.repo.js';
import { createStaffSchema, updateStaffSchema } from './staff.schema.js';
import { canViewAllPayroll } from '#modules/payroll/payroll.access.js';
import * as repo from './staff.repo.js';

/** Ô "Xem lương & chấm công mọi người" trong form: '1' bật, '0' tắt, khác = không đổi. */
const payrollFlag = (input) => (input?.can_payroll === '1' ? true : input?.can_payroll === '0' ? false : null);

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

export async function createStaff(input, currentUser) {
  const result = validate(createStaffSchema, input);
  if (!result.ok) return result;
  const { name, email, phone, role, password } = result.data;
  if (await repo.emailTaken(email)) return { ok: false, errors: { email: 'Email này đã được sử dụng.' } };
  const user = await authRepo.create({ name, email, phone, role, passwordHash: await hashPassword(password) });
  // Chỉ người đang có quyền này (Mai, Nhài) mới cấp được cho người khác.
  if (payrollFlag(input) && (await canViewAllPayroll(currentUser))) await repo.setCanPayroll(user.id, true);
  return { ok: true, data: user };
}

export async function updateStaff(id, input, currentUser) {
  const existing = await getStaff(id);
  const result = validate(updateStaffSchema, input);
  if (!result.ok) return result;
  const { password, ...data } = result.data;

  if (await repo.emailTaken(data.email, id)) return { ok: false, errors: { email: 'Email này đã được sử dụng.' } };
  // Không để app mất người quản lý cuối cùng / tự khoá mình.
  if (existing.role === 'admin' && data.role !== 'admin') {
    if (id === currentUser.id) return { ok: false, errors: { role: 'Bạn không thể tự bỏ quyền quản lý của mình.' } };
    if ((await repo.countAdmins()) <= 1) return { ok: false, errors: { role: 'Cần ít nhất một quản lý.' } };
  }

  const flag = payrollFlag(input);
  const changeFlag = flag !== null && flag !== (Number(existing.can_payroll) === 1) && (await canViewAllPayroll(currentUser));
  if (changeFlag && !flag && id === currentUser.id) {
    return { ok: false, errors: { can_payroll: 'Bạn không thể tự bỏ quyền xem lương của mình.' } };
  }

  const user = await repo.update(id, data);
  if (changeFlag) await repo.setCanPayroll(id, flag);
  if (password) await repo.updatePassword(id, await hashPassword(password));
  return { ok: true, data: user };
}

export async function deleteStaff(id, currentUser) {
  if (id === currentUser.id) throw forbidden('Bạn không thể xoá tài khoản của chính mình.');
  const deleted = await repo.remove(id);
  if (!deleted) throw notFound('Không tìm thấy nhân viên này.');
}
