// Chỉ quản lý (admin) vào được — gắn requireRole('admin') trong modules/index.js.
// Mọi người xem danh sách link ở trang Hôm nay.
import { Router } from 'express';
import { numericId } from '#middleware/params.js';
import * as controller from './links.controller.js';

const router = Router();
router.param('id', numericId);

router.get('/', controller.index);
router.get('/new', controller.newForm);
router.post('/', controller.create);
router.get('/:id/edit', controller.editForm);
router.post('/:id', controller.update);
router.post('/:id/delete', controller.destroy);

export default router;
