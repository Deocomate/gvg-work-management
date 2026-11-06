// Trang link tài liệu: mọi người xem, tìm, xem trước; quản lý thêm/sửa/xoá link và thư mục.
import { isManager } from '#modules/tasks/tasks.service.js';
import * as service from './links.service.js';

/** Quay về đúng thư mục chứa link vừa lưu. */
const folderHref = (folderId) => (folderId ? `/links?folder=${folderId}` : `/links?folder=${service.UNSORTED}`);

async function renderForm(res, { link = null, values = {}, errors = {}, status = 200 }) {
  const folders = await service.listFolders();
  res.status(status).render('links/form', {
    title: link ? 'Sửa link tài liệu' : 'Thêm link tài liệu',
    link,
    values,
    errors,
    folderOptions: [
      ...folders.map((f) => ({ value: String(f.id), label: f.name })),
      { value: service.NEW_FOLDER, label: '+ Tạo thư mục mới…' },
    ],
  });
}

export async function index(req, res) {
  const folder = typeof req.query.folder === 'string' ? req.query.folder : '';
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
  const data = await service.browse({ folder, q });
  res.render('links/index', { title: data.current?.name ?? 'Tài liệu', ...data, manager: isManager(req.user) });
}

export function newForm(req, res) {
  // Đang đứng trong thư mục nào thì link mới mặc định vào thư mục đó.
  const folder = /^\d+$/.test(req.query.folder ?? '') ? req.query.folder : '';
  return renderForm(res, { values: { folder_id: folder } });
}

export async function create(req, res) {
  const result = await service.createLink(req.body);
  if (!result.ok) return renderForm(res, { values: req.body, errors: result.errors, status: 422 });
  req.flash('success', `Đã thêm "${result.data.title}".`);
  res.redirect(folderHref(result.data.folder_id));
}

export async function editForm(req, res) {
  const link = await service.getLink(req.params.id);
  return renderForm(res, { link, values: { ...link, folder_id: link.folder_id ? String(link.folder_id) : '' } });
}

export async function update(req, res) {
  const id = req.params.id;
  const result = await service.updateLink(id, req.body);
  if (!result.ok) return renderForm(res, { link: { id }, values: req.body, errors: result.errors, status: 422 });
  req.flash('success', 'Đã lưu thay đổi.');
  res.redirect(folderHref(result.data.folder_id));
}

export async function destroy(req, res) {
  const link = await service.getLink(req.params.id);
  await service.deleteLink(link.id);
  req.flash('success', 'Đã xoá link.');
  res.redirect(folderHref(link.folder_id));
}

// ---------- Thư mục ----------

const renderFolderForm = (res, { folder = null, values = {}, errors = {}, status = 200 }) =>
  res.status(status).render('links/folder-form', {
    title: folder ? 'Đổi tên thư mục' : 'Thêm thư mục',
    folder,
    values,
    errors,
  });

export function newFolderForm(req, res) {
  renderFolderForm(res, {});
}

export async function createFolder(req, res) {
  const result = await service.createFolder(req.body);
  if (!result.ok) return renderFolderForm(res, { values: req.body, errors: result.errors, status: 422 });
  req.flash('success', `Đã tạo thư mục "${result.data.name}".`);
  res.redirect(folderHref(result.data.id));
}

export async function editFolderForm(req, res) {
  const folder = await service.getFolder(req.params.id);
  renderFolderForm(res, { folder, values: folder });
}

export async function updateFolder(req, res) {
  const id = req.params.id;
  const result = await service.renameFolder(id, req.body);
  if (!result.ok) return renderFolderForm(res, { folder: { id }, values: req.body, errors: result.errors, status: 422 });
  req.flash('success', 'Đã đổi tên thư mục.');
  res.redirect(folderHref(id));
}

export async function destroyFolder(req, res) {
  await service.deleteFolder(req.params.id);
  req.flash('success', 'Đã xoá thư mục. Các link bên trong chuyển về "Chưa phân loại".');
  res.redirect('/links');
}
