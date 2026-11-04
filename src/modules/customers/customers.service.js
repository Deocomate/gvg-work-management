// Nghiệp vụ Data khách hàng. Ai vào được: quản lý + nhân viên được tick quyền ở trang Nhân viên.
import { forbidden, notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import * as staffRepo from '#modules/staff/staff.repo.js';
import { todayISO } from '#lib/dates.js';
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES, customerSchema, detectInvoiceType, invoiceSchema, phoneDigits } from './customers.schema.js';
import * as repo from './customers.repo.js';

export const canUseCustomers = (user) => user?.role === 'admin' || Number(user?.can_customers) === 1;

/** Middleware: chặn người không có quyền xem Data khách hàng. */
export function requireCustomerAccess(req, res, next) {
  if (canUseCustomers(req.user)) return next();
  next(forbidden('Bạn chưa được cấp quyền xem Data khách hàng. Hãy nhờ quản lý cấp quyền ở trang Nhân viên.'));
}

const pick = (list, value) => (list.some((o) => o.value === value) ? value : '');

/** Đọc bộ lọc từ query string, bỏ giá trị lạ. */
export function parseFilters(query = {}) {
  const owner = Number.parseInt(query.owner, 10);
  return {
    q: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
    status: pick(CUSTOMER_STATUSES, query.status),
    source: pick(CUSTOMER_SOURCES, query.source),
    owner: owner > 0 ? owner : '',
  };
}

export async function listCustomers(filters, page) {
  const [customers, total] = await Promise.all([
    repo.list(filters, { limit: page.perPage, offset: page.offset }),
    repo.count(filters),
  ]);
  return { customers, total };
}

/** [{ value, label, badge, total }] cho dải đếm theo trạng thái. */
export async function statusSummary() {
  const counts = Object.fromEntries((await repo.countByStatus()).map((r) => [r.status, Number(r.total)]));
  return CUSTOMER_STATUSES.map((s) => ({ ...s, total: counts[s.value] ?? 0 }));
}

export async function getCustomer(id) {
  const customer = await repo.findById(id);
  if (!customer) throw notFound('Không tìm thấy khách hàng này.');
  return customer;
}

/** Kiểm tra + chuẩn hoá dữ liệu form. Trả về { ok, data } hoặc { ok: false, errors }. */
async function prepare(input, exceptId = 0) {
  const result = validate(customerSchema, input);
  if (!result.ok) return result;
  const data = { ...result.data, phone_digits: phoneDigits(result.data.phone) };
  if (data.customer_type === 'personal') data.tax_code = undefined;
  if (data.owner_id && !(await staffRepo.findById(data.owner_id))) {
    return { ok: false, errors: { owner_id: 'Người phụ trách không tồn tại' } };
  }
  if (data.phone_digits) {
    const dup = await repo.findByPhoneDigits(data.phone_digits, exceptId);
    if (dup) return { ok: false, errors: { phone: `Số này đã có trong data: ${dup.name}` } };
  }
  return { ok: true, data };
}

/** Tên file an toàn để lưu/hiện: bỏ đường dẫn và ký tự điều khiển, tối đa 150 ký tự. */
const safeFileName = (name, ext) => {
  const base = String(name ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f"]/g, '').trim().slice(0, 150);
  return base || `hoa-don.${ext}`;
};

/**
 * Khối "Thêm hoá đơn": để trống giá trị và file = không thêm (ô ngày luôn có sẵn hôm nay nên không tính).
 * Trả về { ok, invoice } (invoice = null nếu không thêm) hoặc { ok: false, errors }.
 */
export function prepareInvoice(input, files = []) {
  const result = validate(invoiceSchema, input);
  const errors = { ...result.errors };
  const upload = files.find((f) => f.fieldname === 'invoice_file' && f.size > 0);

  let file = null;
  if (upload) {
    const kind = detectInvoiceType(upload.buffer);
    if (!kind) errors.invoice_file = 'Chỉ nhận file PDF hoặc ảnh (JPG, PNG, WEBP)';
    else file = { name: safeFileName(upload.originalname, kind.ext), type: kind.type, size: upload.size, data: upload.buffer };
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const { invoice_date, invoice_amount, invoice_note } = result.data;
  if (invoice_amount === undefined && !file) {
    if (invoice_note) return { ok: false, errors: { invoice_amount: 'Nhập giá trị hoặc đính kèm file hoá đơn' } };
    return { ok: true, invoice: null };
  }
  return { ok: true, invoice: { invoice_date: invoice_date ?? todayISO(), amount: invoice_amount, note: invoice_note, file } };
}

/** Kiểm tra cả thông tin khách lẫn hoá đơn, gộp lỗi để người dùng sửa một lần. */
async function prepareAll(input, files, exceptId = 0) {
  const [customer, invoice] = [await prepare(input, exceptId), prepareInvoice(input, files)];
  if (!customer.ok || !invoice.ok) return { ok: false, errors: { ...invoice.errors, ...customer.errors } };
  return { ok: true, data: customer.data, invoice: invoice.invoice };
}

// Hai người bấm Lưu cùng một số điện thoại cùng lúc: kiểm tra trên đều qua, DB (unique index) chặn người sau.
const isDuplicatePhone = (err) => /UNIQUE/i.test(err?.message ?? '') && /phone_digits/i.test(err?.message ?? '');
const duplicateError = { ok: false, errors: { phone: 'Số này vừa được người khác nhập vào data.' } };

export async function createCustomer(input, currentUser, files = []) {
  const result = await prepareAll(input, files);
  if (!result.ok) return result;
  try {
    return { ok: true, data: await repo.create(result.data, currentUser.id, result.invoice) };
  } catch (err) {
    if (isDuplicatePhone(err)) return duplicateError;
    throw err;
  }
}

export async function updateCustomer(id, input, currentUser, files = []) {
  await getCustomer(id);
  const result = await prepareAll(input, files, id);
  if (!result.ok) return result;
  try {
    const customer = await repo.update(id, result.data, result.invoice, currentUser.id);
    if (!customer) throw notFound('Không tìm thấy khách hàng này.');
    return { ok: true, data: customer, addedInvoice: Boolean(result.invoice) };
  } catch (err) {
    if (isDuplicatePhone(err)) return duplicateError;
    throw err;
  }
}

export async function deleteCustomer(id) {
  if (!(await repo.remove(id))) throw notFound('Không tìm thấy khách hàng này.');
}

export const listInvoices = (customerId) => repo.listInvoices(customerId);

export async function getInvoiceFile(customerId, invoiceId) {
  const file = await repo.findInvoiceFile(customerId, invoiceId);
  if (!file) throw notFound('Không tìm thấy file hoá đơn này.');
  return file;
}

export async function deleteInvoice(customerId, invoiceId) {
  if (!(await repo.removeInvoice(customerId, invoiceId))) throw notFound('Không tìm thấy hoá đơn này.');
}
