// Ai được xem lương & chấm công của MỌI người (= chủ cửa hàng trong app lương).
// Chỉ người được bật users.can_payroll (sếp Mai, Nhài — bật ở trang Nhân viên). Người khác, kể cả Quản lý,
// chỉ thấy lương và chấm công của chính mình — vẫn bằng tài khoản lịch công việc (ghép hồ sơ lương theo tên, xem dưới).
// Chưa ai được bật (DB mới, chưa tạo tài khoản Mai/Nhài) thì mọi Quản lý tạm có quyền để không ai bị khoá ngoài.
import { anyCanPayroll } from '#modules/staff/staff.repo.js';

export async function canViewAllPayroll(user) {
  if (!user) return false;
  if (Number(user.can_payroll) === 1) return true;
  if (user.role !== 'admin') return false;
  return !(await anyCanPayroll());
}

// Giữ dấu tiếng Việt (Tâm ≠ Tám), chỉ bỏ hoa/thường và khoảng trắng thừa.
const words = (name) => String(name || '').normalize('NFC').toLowerCase().trim().split(/\s+/).filter(Boolean);
const contains = (big, small) => small.length > 0 && small.every((w) => big.includes(w));

// Hồ sơ lương (nv1, nv2…) của một tài khoản lịch, ghép theo tên để mỗi người chỉ cần MỘT tài khoản:
// trùng tên hẳn được ưu tiên; không có thì tên này nằm trọn trong tên kia ("Trang" ↔ "Trang Vũ").
// Chỉ ghép khi chắc chắn một-một: tên khớp nhiều hồ sơ, hoặc hồ sơ khớp nhiều tài khoản thì bỏ qua (không lộ lương người khác).
const rank = (a, b) => {
  const aw = words(a), bw = words(b);
  if (aw.length && aw.join(' ') === bw.join(' ')) return 2;
  return contains(aw, bw) || contains(bw, aw) ? 1 : 0;
};
const best = (items, score) => {
  const top = Math.max(0, ...items.map(score));
  return top ? items.filter((x) => score(x) === top) : [];
};

export function payrollStaffIdFor(user, users, staff) {
  const mine = best(staff, (s) => rank(user.name, s.name));
  if (mine.length !== 1) return null;
  const owners = best(users, (u) => rank(u.name, mine[0].name));
  return owners.length === 1 && owners[0].id === user.id ? mine[0].id : null;
}
