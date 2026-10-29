// Mọi người đã đăng nhập xem được danh sách; chỉ quản lý (admin) được thêm/sửa/xoá.
import { Router } from 'express';
import { requireRole } from '#middleware/auth.js';
import { numericId } from '#middleware/params.js';
import * as controller from './links.controller.js';

const router = Router();
router.param('id', numericId);

const admin = requireRole('admin');

router.get('/', controller.index);
router.get('/new', admin, controller.newForm);
router.post('/', admin, controller.create);
router.get('/:id/edit', admin, controller.editForm);
router.post('/:id', admin, controller.update);
router.post('/:id/delete', admin, controller.destroy);

export default router;
