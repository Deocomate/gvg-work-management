// Chuẩn bị lần đầu chạy trên máy: tạo .env (secret + mật khẩu admin ngẫu nhiên) nếu chưa có,
// rồi in tài khoản quản lý. Được gọi bởi chay-app.bat.
import crypto from 'node:crypto';
import fs from 'node:fs';

const ENV = '.env';
const random = (bytes, encoding) => crypto.randomBytes(bytes).toString(encoding);

if (!fs.existsSync(ENV)) {
  const env = fs
    .readFileSync('.env.example', 'utf8')
    .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${random(32, 'hex')}`)
    .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${random(9, 'base64url')}`);
  fs.writeFileSync(ENV, env);
  console.info('Da tao file .env');
}

const read = (key) => fs.readFileSync(ENV, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
console.info('');
console.info('==================================================');
console.info('  Tai khoan quan ly (luu lai):');
console.info(`  Email:    ${read('ADMIN_EMAIL')}`);
console.info(`  Mat khau: ${read('ADMIN_PASSWORD')}`);
console.info('  (doi trong file .env truoc lan chay dau neu muon)');
console.info('==================================================');
console.info('');
