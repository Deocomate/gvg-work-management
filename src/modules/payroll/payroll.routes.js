// /luong: trang Lương trong khung app chính (requireAuth gắn trong modules/index.js).
// Lõi app lương ở /luong/app được gắn riêng trong app.js, trước helmet/session.
import { Router } from 'express';
import * as controller from './payroll.controller.js';

const router = Router();
router.get('/', controller.page);

export default router;
