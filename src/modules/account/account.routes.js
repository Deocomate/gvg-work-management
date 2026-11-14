// Tài khoản của người đang đăng nhập — gắn requireAuth trong modules/index.js.
import { Router } from 'express';
import * as controller from './account.controller.js';
import { settings as payrollSettings } from '#modules/payroll/payroll.controller.js';

const router = Router();
router.get('/', controller.show);
router.post('/', controller.updateProfile);
router.post('/password', controller.changePassword);
router.get('/luong', payrollSettings); // Cài đặt > Cài đặt lương (nhúng app lương)

export default router;
