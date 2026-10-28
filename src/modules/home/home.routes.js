import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.render('home/index', { title: 'Trang chủ' });
});

export default router;
