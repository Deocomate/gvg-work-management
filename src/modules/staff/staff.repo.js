// Quản lý tài khoản (bảng users). Tạo tài khoản dùng chung auth.repo.create.
import { all, get, run } from '#db';

const PUBLIC_COLUMNS = 'id, email, name, role, created_at';

export const listAll = () =>
  all(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY role = 'admin' DESC, name COLLATE NOCASE`);

export const findById = (id) => get(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);

export async function emailTaken(email, exceptId = 0) {
  return Boolean(await get('SELECT 1 FROM users WHERE email = ? AND id <> ?', [email, exceptId]));
}

export async function countAdmins() {
  const row = await get(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin'`);
  return Number(row.total);
}

export async function update(id, { name, email, role }) {
  await run(`UPDATE users SET name = ?, email = ?, role = ?, updated_at = datetime('now') WHERE id = ?`, [
    name,
    email,
    role,
    id,
  ]);
  return findById(id);
}

export const updatePassword = (id, passwordHash) =>
  run(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`, [passwordHash, id]);

export async function remove(id) {
  const { changes } = await run('DELETE FROM users WHERE id = ?', [id]);
  return changes > 0;
}
