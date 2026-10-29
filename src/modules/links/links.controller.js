// Trang link tài liệu: mọi người xem danh sách; quản lý thêm, sửa, xoá.
import { isManager } from '#modules/tasks/tasks.service.js';
import * as service from './links.service.js';

const renderForm = (res, { link = null, values = {}, errors = {}, status = 200 }) =>
  res.status(status).render('links/form', {
    title: link ? 'Sửa link tài liệu' : 'Thêm link tài liệu',
    link,
    values,
    errors,
  });

export async function index(req, res) {
  res.render('links/index', { title: 'Tài liệu', links: await service.listLinks(), manager: isManager(req.user) });
}

export function newForm(req, res) {
  renderForm(res, {});
}

export async function create(req, res) {
  const result = await service.createLink(req.body);
  if (!result.ok) return renderForm(res, { values: req.body, errors: result.errors, status: 422 });
  req.flash('success', `Đã thêm "${result.data.title}".`);
  res.redirect('/links');
}

export async function editForm(req, res) {
  const link = await service.getLink(req.params.id);
  renderForm(res, { link, values: link });
}

export async function update(req, res) {
  const id = req.params.id;
  const result = await service.updateLink(id, req.body);
  if (!result.ok) return renderForm(res, { link: { id }, values: req.body, errors: result.errors, status: 422 });
  req.flash('success', 'Đã lưu thay đổi.');
  res.redirect('/links');
}

export async function destroy(req, res) {
  await service.deleteLink(req.params.id);
  req.flash('success', 'Đã xoá link.');
  res.redirect('/links');
}
