// Chỉ quản lý (admin) vào được — gắn requireRole('admin') trong modules/index.js.
import { Router } from 'express';
import * as controller from './performance.controller.js';

const router = Router();

router.get('/', controller.index);

export default router;
