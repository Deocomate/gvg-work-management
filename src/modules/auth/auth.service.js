// Nghiệp vụ đăng nhập. Mật khẩu băm bằng scrypt có sẵn trong Node (không cần bcrypt).
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '#config';
import { validate } from '#lib/validate.js';
import { loginSchema, signupSchema } from './auth.schema.js';
import * as repo from './auth.repo.js';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

// Chặn đoán mật khẩu: tối đa 5 lần sai / 15 phút cho mỗi email+IP (bộ nhớ trong tiến trình).
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const isLocked = (key) => {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) return false;
  return entry.count >= MAX_FAILURES;
};
const recordFailure = (key) => {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else entry.count += 1;
};

export const findUserById = (id) => repo.findById(id);

/** Trả về { ok, user } hoặc { ok: false, errors } */
export async function login(input, ip = '') {
  const result = validate(loginSchema, input);
  if (!result.ok) return result;

  const { email, password } = result.data;
  const key = `${email}|${ip}`;
  if (isLocked(key)) {
    return { ok: false, errors: { _form: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' } };
  }

  const user = await repo.findByEmailWithHash(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordFailure(key);
    return { ok: false, errors: { _form: 'Email hoặc mật khẩu không đúng.' } };
  }

  failures.delete(key);
  return { ok: true, user: await repo.findById(user.id) };
}

export async function signup(input) {
  const result = validate(signupSchema, input);
  if (!result.ok) return result;
  const { name, email, password } = result.data;
  if (await repo.existsByEmail(email)) return { ok: false, errors: { email: 'Email này đã được sử dụng.' } };
  const user = await repo.create({ name, email, passwordHash: await hashPassword(password) });
  return { ok: true, user };
}

/** Tạo tài khoản admin từ ADMIN_EMAIL/ADMIN_PASSWORD nếu chưa có. Gọi lúc khởi động. */
export async function ensureAdminUser() {
  const { adminEmail, adminPassword } = config.auth;
  if (!adminEmail || !adminPassword) return;
  const email = adminEmail.trim().toLowerCase();
  if (await repo.existsByEmail(email)) return;
  await repo.create({ email, name: 'Quản trị viên', passwordHash: await hashPassword(adminPassword), role: 'admin' });
  console.info(`[auth] đã tạo tài khoản admin ${email}`);
}
