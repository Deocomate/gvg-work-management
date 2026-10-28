// Cần đăng nhập (gắn requireAuth trong modules/index.js). Quyền chi tiết kiểm tra trong service.
import { Router } from 'express';
import { numericId } from '#middleware/params.js';
import * as controller from './tasks.controller.js';

const router = Router();
router.param('id', numericId);

router.get('/new', controller.newForm);
router.post('/', controller.create);
router.get('/:id/edit', controller.editForm);
router.post('/:id', controller.update);
router.post('/:id/delete', controller.destroy);
router.post('/:id/status', controller.setStatus);

export default router;
