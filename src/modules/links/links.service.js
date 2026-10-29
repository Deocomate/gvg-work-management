// Nghiệp vụ link tài liệu: ai cũng xem được, chỉ quản lý thêm/sửa/xoá (chặn ở modules/index.js).
import { notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { linkSchema } from './links.schema.js';
import * as repo from './links.repo.js';

export const listLinks = () => repo.listAll();

export async function getLink(id) {
  const link = await repo.findById(id);
  if (!link) throw notFound('Không tìm thấy link này.');
  return link;
}

export async function createLink(input) {
  const result = validate(linkSchema, input);
  if (!result.ok) return result;
  return { ok: true, data: await repo.create(result.data) };
}

export async function updateLink(id, input) {
  const result = validate(linkSchema, input);
  if (!result.ok) return result;
  const link = await repo.update(id, result.data);
  if (!link) throw notFound('Không tìm thấy link này.');
  return { ok: true, data: link };
}

export async function deleteLink(id) {
  if (!(await repo.remove(id))) throw notFound('Không tìm thấy link này.');
}
