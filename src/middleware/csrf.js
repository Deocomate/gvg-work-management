// Chống CSRF: mỗi phiên có một token; mọi form POST phải gửi kèm `_csrf`.
// Trong view chỉ cần: {{> form/csrf}}
// Với fetch/AJAX: gửi header `x-csrf-token` (lấy từ <meta name="csrf-token">).
import crypto from 'node:crypto';
import { AppError } from '#lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const sameToken = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

export function csrf(req, res, next) {
  req.session.csrf ??= crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;

  if (SAFE_METHODS.has(req.method)) return next();

  const sent = req.body?._csrf ?? req.get('x-csrf-token');
  if (!sameToken(sent, req.session.csrf)) {
    return next(new AppError(403, 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang và thử lại.'));
  }
  next();
}
