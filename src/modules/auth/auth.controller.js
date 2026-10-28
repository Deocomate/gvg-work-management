import { config } from '#config';
import * as service from './auth.service.js';

// Chỉ cho phép quay lại đường dẫn nội bộ (chống open redirect).
const safeNext = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/');

const startSession = (req, user) => {
  req.session.userId = user.id;
  req.session.csrf = null; // đổi token sau khi đăng nhập
};

export function loginForm(req, res) {
  if (req.user) return res.redirect('/');
  res.render('auth/login', {
    title: 'Đăng nhập',
    values: {},
    errors: {},
    next: safeNext(req.query.next),
    allowSignup: config.auth.allowSignup,
  });
}

export async function login(req, res) {
  const result = await service.login(req.body, req.ip);
  const next = safeNext(req.body.next);
  if (!result.ok) {
    return res.status(422).render('auth/login', {
      title: 'Đăng nhập',
      values: { email: req.body.email },
      errors: result.errors,
      next,
      allowSignup: config.auth.allowSignup,
    });
  }
  startSession(req, result.user);
  req.flash('success', `Xin chào, ${result.user.name}!`);
  res.redirect(next);
}

export function signupForm(req, res) {
  res.render('auth/signup', { title: 'Đăng ký', values: {}, errors: {} });
}

export async function signup(req, res) {
  const result = await service.signup(req.body);
  if (!result.ok) {
    return res.status(422).render('auth/signup', {
      title: 'Đăng ký',
      values: { name: req.body.name, email: req.body.email },
      errors: result.errors,
    });
  }
  startSession(req, result.user);
  req.flash('success', 'Tạo tài khoản thành công.');
  res.redirect('/');
}

export function logout(req, res) {
  req.session = null;
  res.redirect('/login');
}
