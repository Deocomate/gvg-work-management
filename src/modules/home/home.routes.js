import { Router } from 'express';

const router = Router();

// Mở app là thấy ngay lịch tuần này + việc hôm nay (chưa đăng nhập sẽ được chuyển tới trang đăng nhập).
router.get('/', (req, res) => res.redirect('/today'));

export default router;
