// Kiểm tra tham số URL dùng chung.
//   router.param('id', numericId);  -> req.params.id luôn là số nguyên dương, sai thì 404.
import { notFound } from '#lib/errors.js';

export function numericId(req, res, next, value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return next(notFound());
  req.params.id = id;
  next();
}
