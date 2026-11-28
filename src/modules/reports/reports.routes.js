// Báo cáo tuần marketing. Chỉ quản lý (requireReportAccess gắn trong modules/index.js).
import { Router } from 'express';
import * as controller from './reports.controller.js';

const router = Router();

router.get('/', controller.index);
router.get('/edit', controller.edit);
router.post('/', controller.save);
router.get('/export.xlsx', controller.exportXlsx);

export default router;
