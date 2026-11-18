// Thao tác trên checklist "Up website" (xem ở /today?tab=web). Xong thì quay lại đúng trang đang xem.
import { safeBack } from '#lib/redirect.js';
import * as service from './website.service.js';

const backOf = (req, anchor = '') => {
  const back = safeBack(req.body.back, '/today?tab=web').split('#')[0];
  return anchor ? `${back}#${anchor}` : back;
};
const firstError = (errors) => Object.values(errors)[0] ?? 'Dữ liệu chưa hợp lệ.';

export async function createPage(req, res) {
  const result = await service.createPage(req.body, req.user);
  if (!result.ok) {
    req.flash('error', firstError(result.errors));
    return res.redirect(backOf(req, 'web-add'));
  }
  req.flash('success', `Đã thêm trang "${result.data.title}".`);
  res.redirect(backOf(req, `page-${result.data.id}`));
}

export async function updatePage(req, res) {
  const result = await service.updatePage(req.params.id, req.body);
  if (!result.ok) req.flash('error', firstError(result.errors));
  res.redirect(backOf(req, `page-${req.params.id}`));
}

export async function deletePage(req, res) {
  const page = await service.deletePage(req.params.id, req.user);
  req.flash('success', `Đã xoá trang "${page.title}".`);
  res.redirect(backOf(req));
}

export async function addItem(req, res) {
  const result = await service.addItem(req.params.id, req.body);
  if (!result.ok) req.flash('error', firstError(result.errors));
  // Thêm sản phẩm thì mở sẵn danh sách để thêm tiếp
  res.redirect(backOf(req, req.body.kind === 'item' ? `items-${req.params.id}` : `page-${req.params.id}`));
}

export async function doneAll(req, res) {
  await service.doneAll(req.params.id);
  res.redirect(backOf(req, `page-${req.params.id}`));
}

export async function toggleItem(req, res) {
  const item = await service.toggleItem(req.params.id, req.body.done === '1');
  res.redirect(backOf(req, item.kind === 'item' ? `items-${item.page_id}` : `page-${item.page_id}`));
}

export async function deleteItem(req, res) {
  const item = await service.deleteItem(req.params.id);
  res.redirect(backOf(req, item.kind === 'item' ? `items-${item.page_id}` : `page-${item.page_id}`));
}
