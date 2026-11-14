// Trang Tài khoản (trong mục Cài đặt): ai đăng nhập cũng xem/sửa được tài khoản của mình.
import { ROLES } from '#modules/staff/staff.schema.js';
import * as service from './account.service.js';

const roleInfo = Object.fromEntries(ROLES.map((r) => [r.value, r]));

async function render(req, res, { values, errors = {}, status = 200 } = {}) {
  const account = await service.getAccount(req.user.id);
  res.status(status).render('account/index', {
    title: 'Tài khoản',
    account: { ...account, roleInfo: roleInfo[account.role] },
    values: values ?? account,
    errors,
  });
}

export const show = (req, res) => render(req, res);

export async function updateProfile(req, res) {
  const result = await service.updateProfile(req.user.id, req.body);
  if (!result.ok) return render(req, res, { values: req.body, errors: result.errors, status: 422 });
  req.flash('success', 'Đã lưu thông tin tài khoản.');
  res.redirect('/account');
}

export async function changePassword(req, res) {
  const result = await service.changePassword(req.user.id, req.body);
  if (!result.ok) return render(req, res, { errors: result.errors, status: 422 });
  req.flash('success', 'Đã đổi mật khẩu.');
  res.redirect('/account');
}
