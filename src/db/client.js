// Kết nối SQLite qua libsql: chạy được với file local (dev/VPS)
// lẫn Turso (host free) mà không đổi code.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { config } from '#config';

const { url, authToken } = config.db;
const isLocalFile = url.startsWith('file:');

if (isLocalFile) {
  fs.mkdirSync(path.dirname(path.resolve(url.slice('file:'.length))), { recursive: true });
}

export const db = createClient({ url, authToken });

/** Áp dụng các thiết lập SQLite nên có. Gọi một lần lúc khởi động. */
export async function initDb() {
  if (isLocalFile) {
    // WAL cho phép nhiều người đọc trong lúc có người ghi.
    await db.execute('PRAGMA journal_mode = WAL');
    await db.execute('PRAGMA busy_timeout = 5000');
  }
  await db.execute('PRAGMA foreign_keys = ON');
}

const toPlain = (row) => Object.fromEntries(Object.entries(row));

/** Lấy nhiều dòng. Luôn dùng tham số `?`, không nối chuỗi SQL. */
export async function all(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows.map(toPlain);
}

/** Lấy một dòng hoặc null. */
export async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] ?? null;
}

/** Chạy INSERT/UPDATE/DELETE. Trả về id vừa thêm và số dòng bị ảnh hưởng. */
export async function run(sql, args = []) {
  const result = await db.execute({ sql, args });
  return {
    id: result.lastInsertRowid == null ? null : Number(result.lastInsertRowid),
    changes: result.rowsAffected,
  };
}

/** Chạy nhiều câu lệnh trong một transaction (tất cả thành công hoặc không câu nào). */
export async function transaction(statements) {
  return db.batch(statements, 'write');
}

/** True khi chạy trên host free có ổ đĩa tạm (Render) mà vẫn dùng file SQLite → dữ liệu sẽ mất. */
export const usingEphemeralDb = () => config.onRender && isLocalFile;
