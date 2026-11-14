// Tài khoản của người đang đăng nhập — gắn requireAuth trong modules/index.js.
import { Router } from 'express';
import * as controller from './account.controller.js';

const router = Router();
router.get('/', controller.show);
router.post('/', controller.updateProfile);
router.post('/password', controller.changePassword);

export default router;
