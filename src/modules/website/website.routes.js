// Checklist "Up website" — mọi người đăng nhập (requireAuth gắn trong modules/index.js). Xem ở /today?tab=web.
import { Router } from 'express';
import { numericId } from '#middleware/params.js';
import * as controller from './website.controller.js';

const router = Router();
router.param('id', numericId);

router.post('/pages', controller.createPage);
router.post('/pages/:id', controller.updatePage);
router.post('/pages/:id/delete', controller.deletePage);
router.post('/pages/:id/items', controller.addItem);
router.post('/pages/:id/done-all', controller.doneAll);
router.post('/items/:id', controller.toggleItem);
router.post('/items/:id/delete', controller.deleteItem);

export default router;
