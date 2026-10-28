// Tìm SQL có ghép giá trị bằng ${...} — nguy cơ SQL injection.
// Được phép ghép: hằng số VIET_HOA (VD: ${PUBLIC_COLUMNS}) hoặc biến tên kết thúc bằng Sql
// (VD: ${whereSql}) — quy ước cho đoạn SQL cố định do code tự tạo. Giá trị người dùng luôn đi qua `?`.
import fs from 'node:fs';
import path from 'node:path';

const SQL_KEYWORD = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WHERE|ORDER\s+BY|VALUES)\b/;
const ALLOWED = /^([A-Z][A-Z0-9_]*|[a-zA-Z0-9_.]*Sql)$/;

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : [],
  );

let problems = 0;
for (const file of walk('src')) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/`[^`]*`/g)) {
    const literal = match[0];
    if (!SQL_KEYWORD.test(literal)) continue;
    for (const [, expr] of literal.matchAll(/\$\{([^}]*)\}/g)) {
      if (ALLOWED.test(expr.trim())) continue;
      const line = source.slice(0, match.index).split('\n').length;
      console.log(`${file}:${line}: \${${expr}} trong câu SQL`);
      problems += 1;
    }
  }
}
process.exit(problems ? 1 : 0);
