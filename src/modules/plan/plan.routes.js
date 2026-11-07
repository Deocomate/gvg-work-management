// Tab Plan — ai đăng nhập cũng vào được (requireAuth gắn trong modules/index.js).
// Quyền sửa/xoá từng nội dung do plan.service.js kiểm tra.
import { Router } from 'express';
import { numericId } from '#middleware/params.js';
import * as controller from './plan.controller.js';

const router = Router();
router.param('id', numericId);

router.get('/', controller.index);
router.get('/archive', controller.archive);
router.get('/weeks', controller.weeks);
router.get('/calendar', controller.calendar);
router.post('/import-sheet', controller.importSheet);
router.get('/new', controller.newForm);
router.post('/', controller.create);
router.get('/:id/edit', controller.editForm);
router.post('/:id', controller.update);
router.post('/:id/status', controller.setStatus);
router.post('/:id/delete', controller.destroy);

export default router;
