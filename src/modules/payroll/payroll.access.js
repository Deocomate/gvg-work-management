// Ai được xem lương & chấm công của MỌI người (= chủ cửa hàng trong app lương).
// Chỉ người được bật users.can_payroll (sếp Mai, Nhài — bật ở trang Nhân viên). Người khác, kể cả Quản lý,
// chỉ thấy lương và chấm công của chính mình (đăng nhập tài khoản lương của họ trong khung Lương).
// Chưa ai được bật (DB mới, chưa tạo tài khoản Mai/Nhài) thì mọi Quản lý tạm có quyền để không ai bị khoá ngoài.
import { anyCanPayroll } from '#modules/staff/staff.repo.js';

export async function canViewAllPayroll(user) {
  if (!user) return false;
  if (Number(user.can_payroll) === 1) return true;
  if (user.role !== 'admin') return false;
  return !(await anyCanPayroll());
}
