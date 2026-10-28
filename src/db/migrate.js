// Chạy các file .sql trong src/db/migrations theo thứ tự tên file.
// Mỗi file chỉ chạy một lần (ghi lại trong bảng _migrations).
// Quy tắc: KHÔNG sửa file migration đã chạy; muốn đổi bảng thì tạo file mới.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDb } from '#db';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function runMigrations({ log = console.info } = {}) {
  await initDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set((await db.execute('SELECT name FROM _migrations')).rows.map((r) => r.name));
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.executeMultiple(sql);
    await db.execute({ sql: 'INSERT INTO _migrations (name) VALUES (?)', args: [file] });
    log(`[migrate] đã chạy ${file}`);
  }
}

// Cho phép chạy trực tiếp: `npm run migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.info('[migrate] xong');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
