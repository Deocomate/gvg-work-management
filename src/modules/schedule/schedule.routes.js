// Gắn ở "/" nên kiểm tra đăng nhập theo từng route (không chặn cả app).
import { Router } from 'express';
import { requireAuth } from '#middleware/auth.js';
import * as controller from './schedule.controller.js';

const router = Router();

router.get('/today', requireAuth, controller.today);
router.get('/calendar', requireAuth, controller.calendar);

export default router;
