import { get, run } from '#db';

const PUBLIC_COLUMNS = 'id, email, name, role, can_customers, created_at';

export const findById = (id) => get(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);

/** Có kèm password_hash — chỉ dùng khi kiểm tra đăng nhập. */
export const findByEmailWithHash = (email) => get('SELECT * FROM users WHERE email = ?', [email]);

export const existsByEmail = async (email) => Boolean(await get('SELECT 1 FROM users WHERE email = ?', [email]));

export async function create({ email, name, phone = null, passwordHash, role = 'member', can_customers = 0 }) {
  const { id } = await run(
    'INSERT INTO users (email, name, phone, password_hash, role, can_customers) VALUES (?, ?, ?, ?, ?, ?)',
    [email, name, phone, passwordHash, role, can_customers],
  );
  return findById(id);
}
