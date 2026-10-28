// Phân quyền dùng chung.
//   loadUser    -> gắn req.user + res.locals.currentUser (đã đăng ký trong app.js)
//   requireAuth -> chưa đăng nhập thì chuyển tới /login
//   requireRole('admin') -> sai vai trò thì 403
import { forbidden } from '#lib/errors.js';
import { findUserById } from '#modules/auth/auth.service.js';

export async function loadUser(req, res, next) {
  const userId = req.session.userId;
  req.user = userId ? await findUserById(userId) : null;
  if (userId && !req.user) req.session.userId = null; // user đã bị xoá
  res.locals.currentUser = req.user;
  next();
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') {
    req.flash('info', 'Vui lòng đăng nhập để tiếp tục.');
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  next(forbidden('Vui lòng đăng nhập.'));
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return requireAuth(req, res, next);
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};
