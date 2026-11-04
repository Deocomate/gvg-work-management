// Trang Data khách hàng: danh sách có tìm kiếm/lọc, thêm, sửa, xoá.
import { buildPagination, parsePage } from '#lib/pagination.js';
import { todayISO } from '#lib/dates.js';
import { MAX_UPLOAD_MB } from '#middleware/upload.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES, CUSTOMER_TYPES } from './customers.schema.js';
import * as service from './customers.service.js';

const byValue = (list) => Object.fromEntries(list.map((o) => [o.value, o]));
const statusInfo = byValue(CUSTOMER_STATUSES);
const sourceInfo = byValue(CUSTOMER_SOURCES);

async function renderForm(res, { customer = null, values = {}, errors = {}, status = 200 }) {
  res.status(status).render('customers/form', {
    invoices: customer ? await service.listInvoices(customer.id) : [],
    maxUploadMb: MAX_UPLOAD_MB,
    // Lỗi khi lưu: trình duyệt không giữ file đã chọn -> nhắc chọn lại.
    reselectFile: status === 422,
    title: customer ? 'Sửa khách hàng' : 'Thêm khách hàng',
    customer,
    values,
    errors,
    typeOptions: CUSTOMER_TYPES,
    sourceOptions: CUSTOMER_SOURCES,
    statusOptions: CUSTOMER_STATUSES,
    ownerOptions: await staffOptions(),
  });
}

export async function index(req, res) {
  const filters = service.parseFilters(req.query);
  const page = parsePage(req.query);
  const [{ customers, total }, summary, owners] = await Promise.all([
    service.listCustomers(filters, page),
    service.statusSummary(),
    staffOptions(),
  ]);
  const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
  res.render('customers/index', {
    title: 'Data khách hàng',
    customers: customers.map((c) => ({ ...c, statusInfo: statusInfo[c.status], sourceLabel: sourceInfo[c.source]?.label })),
    summary,
    filters,
    filtered: Object.keys(query).length > 0,
    sourceOptions: CUSTOMER_SOURCES,
    statusOptions: CUSTOMER_STATUSES,
    ownerOptions: owners,
    pagination: buildPagination({ ...page, total, query }),
  });
}

export function newForm(req, res) {
  return renderForm(res, { values: { customer_type: 'personal', status: 'new', owner_id: req.user.id, invoice_date: todayISO() } });
}

export async function create(req, res) {
  const result = await service.createCustomer(req.body, req.user, req.files);
  if (!result.ok) return renderForm(res, { values: req.body, errors: result.errors, status: 422 });
  req.flash('success', `Đã thêm khách hàng "${result.data.name}".`);
  res.redirect('/customers');
}

/**
 * Thẻ chi tiết khách: tên, SĐT, địa chỉ, trạng thái, từng hoá đơn và tổng tiền.
 * ?modal=1 -> chỉ trả khung thẻ (không layout) để chèn vào popup ở trang danh sách.
 */
export async function show(req, res) {
  const customer = await service.getCustomer(req.params.id);
  const invoices = await service.listInvoices(customer.id);
  res.render('customers/show', {
    ...(req.query.modal && { layout: false }),
    modal: Boolean(req.query.modal),
    title: customer.name,
    customer,
    statusInfo: statusInfo[customer.status],
    invoices,
    exportName: service.exportFileName(customer.name),
    printedAt: new Date().toISOString(),
  });
}

export async function editForm(req, res) {
  const customer = await service.getCustomer(req.params.id);
  return renderForm(res, { customer, values: { ...customer, invoice_date: todayISO() } });
}

export async function update(req, res) {
  const id = req.params.id;
  const result = await service.updateCustomer(id, req.body, req.user, req.files);
  if (!result.ok) {
    const customer = await service.getCustomer(id);
    return renderForm(res, { customer, values: req.body, errors: result.errors, status: 422 });
  }
  // Vừa thêm hoá đơn -> ở lại trang khách để thấy hoá đơn trong danh sách; còn lại về danh sách khách.
  if (result.addedInvoice) {
    req.flash('success', 'Đã lưu thay đổi và thêm hoá đơn.');
    return res.redirect(`/customers/${id}/edit`);
  }
  req.flash('success', 'Đã lưu thay đổi.');
  res.redirect('/customers');
}

export async function destroy(req, res) {
  await service.deleteCustomer(req.params.id);
  req.flash('success', 'Đã xoá khách hàng.');
  res.redirect('/customers');
}

/** Xem/tải file hoá đơn. Chỉ trả PDF/ảnh đã kiểm tra lúc tải lên. */
export async function invoiceFile(req, res) {
  const file = await service.getInvoiceFile(req.params.id, req.params.invoiceId);
  const name = encodeURIComponent(file.file_name);
  res.set({
    'Content-Type': file.file_type,
    'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
    'Cache-Control': 'private, no-store',
  });
  res.send(Buffer.from(file.file_data));
}

export async function destroyInvoice(req, res) {
  await service.deleteInvoice(req.params.id, req.params.invoiceId);
  req.flash('success', 'Đã xoá hoá đơn.');
  res.redirect(`/customers/${req.params.id}/edit`);
}
