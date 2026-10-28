// Trang quản lý nhân viên: danh sách, thêm, sửa, xoá tài khoản.
import { ROLES } from './staff.schema.js';
import * as service from './staff.service.js';

const roleInfo = Object.fromEntries(ROLES.map((r) => [r.value, r]));

const renderForm = (res, { staff = null, values = {}, errors = {}, status = 200 }) =>
  res.status(status).render('staff/form', {
    title: staff ? 'Sửa nhân viên' : 'Thêm nhân viên',
    staff,
    values,
    errors,
    roleOptions: ROLES,
  });

export async function index(req, res) {
  const users = await service.listStaff();
  res.render('staff/index', {
    title: 'Nhân viên',
    users: users.map((u) => ({ ...u, roleInfo: roleInfo[u.role], isMe: u.id === req.user.id })),
  });
}

export function newForm(req, res) {
  renderForm(res, { values: { role: 'member' } });
}

export async function create(req, res) {
  const result = await service.createStaff(req.body);
  if (!result.ok) return renderForm(res, { values: req.body, errors: result.errors, status: 422 });
  req.flash('success', `Đã thêm ${result.data.name}. Hãy gửi email và mật khẩu cho họ để đăng nhập.`);
  res.redirect('/staff');
}

export async function editForm(req, res) {
  const staff = await service.getStaff(req.params.id);
  renderForm(res, { staff, values: staff });
}

export async function update(req, res) {
  const id = req.params.id;
  const result = await service.updateStaff(id, req.body, req.user);
  if (!result.ok) {
    return renderForm(res, { staff: { id }, values: req.body, errors: result.errors, status: 422 });
  }
  req.flash('success', 'Đã lưu thay đổi.');
  res.redirect('/staff');
}

export async function destroy(req, res) {
  await service.deleteStaff(req.params.id, req.user);
  req.flash('success', 'Đã xoá nhân viên và các việc của họ.');
  res.redirect('/staff');
}
