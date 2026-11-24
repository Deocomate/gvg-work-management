// Kết quả quảng cáo Facebook / TikTok. Chỉ quản lý (requireAdsAccess gắn trong modules/index.js).
import { Router } from 'express';
import * as controller from './ads.controller.js';

const router = Router();

router.get('/', controller.index);
router.get('/export.xlsx', controller.exportXlsx);
router.post('/refresh', controller.refresh);

export default router;
