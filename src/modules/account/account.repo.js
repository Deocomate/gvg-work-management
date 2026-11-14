// Tài khoản của chính người đang đăng nhập (bảng users).
import { get, run } from '#db';

export const findById = (id) =>
  get('SELECT id, email, name, phone, role, created_at FROM users WHERE id = ?', [id]);

/** Có kèm password_hash — chỉ dùng khi kiểm tra mật khẩu hiện tại. */
export const findHashById = async (id) => (await get('SELECT password_hash FROM users WHERE id = ?', [id]))?.password_hash;

export const updateProfile = (id, { name, phone = null }) =>
  run(`UPDATE users SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`, [name, phone, id]);

export const updatePassword = (id, passwordHash) =>
  run(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`, [passwordHash, id]);
