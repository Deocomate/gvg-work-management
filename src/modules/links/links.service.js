// Nghiệp vụ link tài liệu: ai cũng xem/tìm được, chỉ quản lý thêm/sửa/xoá link và thư mục (chặn ở links.routes.js).
import { notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { foldText } from '#lib/text.js';
import { previewUrl } from '#lib/link-preview.js';
import { linkSchema, folderSchema } from './links.schema.js';
import * as repo from './links.repo.js';

/** Giá trị ?folder= cho mục "Chưa phân loại" (link không thuộc thư mục nào). */
export const UNSORTED = 'none';

const withPreview = (link) => ({ ...link, preview: previewUrl(link.url) });

/**
 * Trang Tài liệu: danh sách thư mục (kèm số link) + các link đang chọn.
 * - folder: id thư mục | 'none' (chưa phân loại) | trống (tất cả)
 * - q: tìm theo tên, ghi chú, đường link, tên thư mục; gõ không dấu vẫn ra. Đang tìm thì tìm trong MỌI thư mục.
 * Danh sách link nhỏ (vài chục–vài trăm) nên lọc ngay trong JS để bỏ dấu tiếng Việt cho chuẩn (SQLite LIKE không làm được).
 */
export async function browse({ folder, q } = {}) {
  const [links, folders] = await Promise.all([repo.listAll(), repo.listFolders()]);
  const query = foldText(q);
  const unsortedTotal = links.filter((l) => !l.folder_id).length;

  let current = null; // thư mục đang mở
  let shown = links;
  if (query) {
    const words = query.split(/\s+/);
    shown = links.filter((l) => {
      const haystack = foldText([l.title, l.note, l.url, l.folder_name].join(' '));
      return words.every((w) => haystack.includes(w));
    });
  } else if (folder === UNSORTED) {
    current = { id: UNSORTED, name: 'Chưa phân loại', unsorted: true };
    shown = links.filter((l) => !l.folder_id);
  } else if (folder) {
    current = folders.find((f) => String(f.id) === String(folder));
    if (!current) throw notFound('Không tìm thấy thư mục này.');
    shown = links.filter((l) => l.folder_id === current.id);
  }

  return {
    links: shown.map(withPreview),
    folders,
    current,
    query: q?.trim() ?? '',
    total: links.length,
    unsortedTotal,
  };
}

export const listFolders = () => repo.listFolders();

export async function getLink(id) {
  const link = await repo.findById(id);
  if (!link) throw notFound('Không tìm thấy link này.');
  return link;
}

/** Giá trị folder_id khi người dùng chọn "+ Tạo thư mục mới…" trong form link. */
export const NEW_FOLDER = 'new';

/**
 * Kiểm tra form link; thư mục đã chọn phải còn tồn tại (có thể vừa bị người khác xoá).
 * Chọn "Tạo thư mục mới": kiểm tra tên, và chỉ tạo thư mục khi mọi ô của link đều hợp lệ (tránh thư mục rỗng thừa).
 */
async function prepareLink(input = {}) {
  const wantsNew = input.folder_id === NEW_FOLDER;
  const result = validate(linkSchema, { ...input, folder_id: wantsNew ? '' : input.folder_id });
  const folder = wantsNew ? validate(folderSchema, { name: input.new_folder }) : { ok: true };
  if (!result.ok || !folder.ok) return { ok: false, errors: { ...result.errors, ...(folder.ok ? {} : { new_folder: folder.errors.name }) } };

  if (wantsNew) {
    result.data.folder_id = (await findOrCreateFolder(folder.data.name)).id;
  } else if (result.data.folder_id && !(await repo.findFolder(result.data.folder_id))) {
    return { ok: false, errors: { folder_id: 'Thư mục này không còn, vui lòng chọn lại' } };
  }
  return result;
}

/** Tên trùng thư mục đã có (không phân biệt hoa thường) thì dùng luôn thư mục đó. */
async function findOrCreateFolder(name) {
  const data = folderData(name);
  return (await repo.createFolder(data)) ?? repo.findFolderByKey(data.name_key);
}

export async function createLink(input) {
  const result = await prepareLink(input);
  if (!result.ok) return result;
  return { ok: true, data: await repo.create(result.data) };
}

export async function updateLink(id, input) {
  const result = await prepareLink(input);
  if (!result.ok) return result;
  const link = await repo.update(id, result.data);
  if (!link) throw notFound('Không tìm thấy link này.');
  return { ok: true, data: link };
}

export async function deleteLink(id) {
  if (!(await repo.remove(id))) throw notFound('Không tìm thấy link này.');
}

// ---------- Thư mục ----------

const DUPLICATE = { ok: false, errors: { name: 'Đã có thư mục tên này' } };

/** Tên gọn khoảng trắng + khoá so trùng (chữ thường, giữ dấu): "  Biểu   MẪU " -> "biểu mẫu". */
function folderData(name) {
  const clean = name.normalize('NFC').replace(/\s+/g, ' ');
  return { name: clean, name_key: clean.toLocaleLowerCase('vi') };
}

export async function getFolder(id) {
  const folder = await repo.findFolder(id);
  if (!folder) throw notFound('Không tìm thấy thư mục này.');
  return folder;
}

export async function createFolder(input) {
  const result = validate(folderSchema, input);
  if (!result.ok) return result;
  const folder = await repo.createFolder(folderData(result.data.name));
  return folder ? { ok: true, data: folder } : DUPLICATE;
}

export async function renameFolder(id, input) {
  const result = validate(folderSchema, input);
  if (!result.ok) return result;
  const data = folderData(result.data.name);
  const status = await repo.renameFolder(id, data);
  if (status === 'missing') throw notFound('Không tìm thấy thư mục này.');
  return status === 'duplicate' ? DUPLICATE : { ok: true, data: { id, name: data.name } };
}

export async function deleteFolder(id) {
  if (!(await repo.removeFolder(id))) throw notFound('Không tìm thấy thư mục này.');
}
