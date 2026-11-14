// Tài khoản của người đang đăng nhập — gắn requireAuth trong modules/index.js.
import { Router } from 'express';
import * as controller from './account.controller.js';
import { legacySettings as payrollSettings } from '#modules/payroll/payroll.controller.js';

const router = Router();
router.get('/', controller.show);
router.post('/', controller.updateProfile);
router.post('/password', controller.changePassword);
router.get('/luong', payrollSettings); // link cũ Cài đặt lương → /luong/thiet-lap (quản lý) hoặc /luong/tai-khoan

export default router;
