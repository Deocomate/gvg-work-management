// Mọi người đã đăng nhập xem/tìm được; chỉ quản lý (admin) được thêm/sửa/xoá link và thư mục.
import { Router } from 'express';
import { requireRole } from '#middleware/auth.js';
import { numericId } from '#middleware/params.js';
import * as controller from './links.controller.js';

const router = Router();
router.param('id', numericId);

const admin = requireRole('admin');

router.get('/', controller.index);

// Thư mục (khai báo trước /:id để "/folders" không bị hiểu là id)
router.get('/folders/new', admin, controller.newFolderForm);
router.post('/folders', admin, controller.createFolder);
router.get('/folders/:id/edit', admin, controller.editFolderForm);
router.post('/folders/:id', admin, controller.updateFolder);
router.post('/folders/:id/delete', admin, controller.destroyFolder);

router.get('/new', admin, controller.newForm);
router.post('/', admin, controller.create);
router.get('/:id/edit', admin, controller.editForm);
router.post('/:id', admin, controller.update);
router.post('/:id/delete', admin, controller.destroy);

export default router;
