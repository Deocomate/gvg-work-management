// Thư viện ảnh: mọi người đã đăng nhập xem/tải được; chỉ quản lý (admin) tạo/sửa/xoá album, thêm/xoá ảnh.
import { Router } from 'express';
import { requireRole } from '#middleware/auth.js';
import { numericId } from '#middleware/params.js';
import * as controller from './library.controller.js';

const router = Router();
router.param('id', numericId);
router.param('photoId', numericId);

const admin = requireRole('admin');

router.get('/', controller.index);

// Ảnh (khai báo trước /:id để "/photos" không bị hiểu là id album)
router.get('/photos/:id/file', controller.photoFile);
router.get('/photos/:id/thumb', controller.photoThumb);
router.post('/photos/:id/thumb', admin, controller.addSmallThumb);
router.post('/photos/:id/rename', admin, controller.renamePhoto);
router.post('/photos/:id/delete', admin, controller.destroyPhoto);

router.get('/new', admin, controller.newForm);
router.post('/', admin, controller.create);
router.get('/:id', controller.show);
router.get('/:id/download', controller.downloadAlbum);
router.get('/:id/edit', admin, controller.editForm);
router.post('/:id', admin, controller.update);
router.post('/:id/delete', admin, controller.destroy);
router.post('/:id/photos', admin, controller.addPhoto);
router.post('/:id/cover/:photoId', admin, controller.setCover);

export default router;
