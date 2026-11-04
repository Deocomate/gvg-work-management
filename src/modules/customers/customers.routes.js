// Data khách hàng: quản lý + nhân viên được cấp quyền (requireCustomerAccess gắn trong modules/index.js).
// Ai có quyền thì xem, thêm, sửa, xoá được hết.
import { Router } from 'express';
import { numericId } from '#middleware/params.js';
import * as controller from './customers.controller.js';

const router = Router();
router.param('id', numericId);
router.param('invoiceId', numericId);

router.get('/', controller.index);
router.get('/new', controller.newForm);
router.post('/', controller.create);
router.get('/:id/edit', controller.editForm);
router.post('/:id', controller.update);
router.post('/:id/delete', controller.destroy);
router.get('/:id/invoices/:invoiceId/file', controller.invoiceFile);
router.post('/:id/invoices/:invoiceId/delete', controller.destroyInvoice);

export default router;
