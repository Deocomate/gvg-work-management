// Câu SQL cho bảng customers và customer_invoices.
import { all, get, run, transaction } from '#db';

const COLUMNS = `c.id, c.name, c.phone, c.email, c.zalo, c.facebook, c.tiktok, c.social, c.customer_type, c.company, c.tax_code, c.address,
  c.birthday, c.source, c.status, c.interest, c.note, c.owner_id, c.created_by, c.created_at, c.updated_at,
  o.name AS owner_name, cb.name AS creator_name,
  (SELECT COUNT(*) FROM customer_invoices i WHERE i.customer_id = c.id) AS invoice_count,
  (SELECT COALESCE(SUM(i.amount), 0) FROM customer_invoices i WHERE i.customer_id = c.id) AS invoice_total`;

const FROM = `FROM customers c
  LEFT JOIN users o ON o.id = c.owner_id
  LEFT JOIN users cb ON cb.id = c.created_by`;

// Các cột ô "Tìm kiếm" dò theo (ngoài số điện thoại).
const SEARCH_COLUMNS = ['c.name', 'c.company', 'c.email', 'c.zalo', 'c.facebook', 'c.tiktok', 'c.social', 'c.interest'];

// Cột cho bộ lọc "Thông tin" đã có (whitelist, không ghép chuỗi người dùng vào SQL).
const INFO_COLUMNS = { phone: 'c.phone_digits', facebook: 'c.facebook', tiktok: 'c.tiktok', address: 'c.address', interest: 'c.interest' };

/** Điều kiện lọc dùng chung cho danh sách và đếm. */
function where({ q, status, source, owner, info }) {
  const parts = [];
  const args = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const digits = q.replace(/\D/g, '');
    const conds = SEARCH_COLUMNS.map((colSql) => `${colSql} LIKE ? ESCAPE '\\'`);
    args.push(...SEARCH_COLUMNS.map(() => like));
    if (digits.length >= 3) {
      conds.push('c.phone_digits LIKE ?');
      args.push(`%${digits}%`);
    }
    const anySql = conds.join(' OR ');
    parts.push(`(${anySql})`);
  }
  if (status) {
    parts.push('c.status = ?');
    args.push(status);
  }
  if (source) {
    parts.push('c.source = ?');
    args.push(source);
  }
  if (owner) {
    parts.push('c.owner_id = ?');
    args.push(owner);
  }
  const infoCol = Object.hasOwn(INFO_COLUMNS, info) ? INFO_COLUMNS[info] : null;
  if (infoCol) parts.push(`TRIM(COALESCE(${infoCol}, '')) <> ''`);
  const conditionsSql = parts.join(' AND ');
  return { whereSql: parts.length ? `WHERE ${conditionsSql}` : '', args };
}

export function list(filters, { limit, offset }) {
  const w = where(filters);
  return all(`SELECT ${COLUMNS} ${FROM} ${w.whereSql} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`, [...w.args, limit, offset]);
}

export async function count(filters) {
  const w = where(filters);
  const row = await get(`SELECT COUNT(*) AS total ${FROM} ${w.whereSql}`, w.args);
  return Number(row.total);
}

/** Số khách theo trạng thái (cho dải thống kê trên đầu trang). */
export const countByStatus = () => all('SELECT status, COUNT(*) AS total FROM customers GROUP BY status');

export const findById = (id) => get(`SELECT ${COLUMNS} ${FROM} WHERE c.id = ?`, [id]);

export const findByPhoneDigits = (digits, exceptId = 0) =>
  get('SELECT id, name FROM customers WHERE phone_digits = ? AND id <> ?', [digits, exceptId]);

const FIELDS = ['name', 'phone', 'phone_digits', 'email', 'zalo', 'facebook', 'tiktok', 'social', 'customer_type', 'company', 'tax_code', 'address', 'birthday', 'source', 'status', 'interest', 'note', 'owner_id'];
const valuesOf = (data) => FIELDS.map((f) => data[f] ?? null);
// Đoạn SQL cố định tạo từ danh sách cột FIELDS (không chứa dữ liệu người dùng).
const COLUMN_LIST = FIELDS.join(', ');
const PLACEHOLDERS = FIELDS.map(() => '?').join(', ');
const SET_LIST = FIELDS.map((f) => `${f} = ?`).join(', ');

// Thêm hoá đơn cho khách `customerIdSql` (một số id, hoặc last_insert_rowid() khi vừa tạo khách trong cùng transaction).
const insertInvoice = (customerIdSql, args, inv, createdBy) => ({
  sql: `INSERT INTO customer_invoices (customer_id, invoice_date, amount, note, file_name, file_type, file_size, file_data, created_by)
        VALUES (${customerIdSql}, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: [
    ...args,
    inv.invoice_date,
    inv.amount ?? null,
    inv.note ?? null,
    inv.file?.name ?? null,
    inv.file?.type ?? null,
    inv.file?.size ?? null,
    inv.file?.data ?? null,
    createdBy,
  ],
});

/** Tạo khách (kèm hoá đơn đầu tiên nếu có) — cả hai cùng lưu hoặc cùng không. */
export async function create(data, createdBy, invoice = null) {
  const statements = [
    { sql: `INSERT INTO customers (${COLUMN_LIST}, created_by) VALUES (${PLACEHOLDERS}, ?)`, args: [...valuesOf(data), createdBy] },
  ];
  if (invoice) statements.push(insertInvoice('last_insert_rowid()', [], invoice, createdBy));
  const [result] = await transaction(statements);
  return findById(Number(result.lastInsertRowid));
}

/** Sửa khách (kèm thêm một hoá đơn mới nếu có). */
export async function update(id, data, invoice = null, createdBy = null) {
  const statements = [
    { sql: `UPDATE customers SET ${SET_LIST}, updated_at = datetime('now') WHERE id = ?`, args: [...valuesOf(data), id] },
  ];
  if (invoice) statements.push(insertInvoice('?', [id], invoice, createdBy));
  const [result] = await transaction(statements);
  return result.rowsAffected > 0 ? findById(id) : null;
}

export const listInvoices = (customerId) =>
  all(
    `SELECT id, invoice_date, amount, note, file_name, file_type, file_size, created_at
     FROM customer_invoices WHERE customer_id = ? ORDER BY invoice_date DESC, id DESC`,
    [customerId],
  );

/** Hoá đơn có file của nhiều khách (không lấy nội dung file) — cho nút tải ở trang danh sách. */
export function listInvoiceFilesFor(customerIds) {
  if (!customerIds.length) return Promise.resolve([]);
  const idListSql = customerIds.map(() => '?').join(', ');
  return all(
    `SELECT id, customer_id, invoice_date, amount, file_name FROM customer_invoices
     WHERE customer_id IN (${idListSql}) AND file_data IS NOT NULL
     ORDER BY invoice_date DESC, id DESC`,
    customerIds,
  );
}

/** Có kèm nội dung file — chỉ dùng khi tải/xem file. */
export const findInvoiceFile = (customerId, invoiceId) =>
  get('SELECT file_name, file_type, file_data FROM customer_invoices WHERE id = ? AND customer_id = ? AND file_data IS NOT NULL', [
    invoiceId,
    customerId,
  ]);

export async function removeInvoice(customerId, invoiceId) {
  const { changes } = await run('DELETE FROM customer_invoices WHERE id = ? AND customer_id = ?', [invoiceId, customerId]);
  return changes > 0;
}

export async function remove(id) {
  const { changes } = await run('DELETE FROM customers WHERE id = ?', [id]);
  return changes > 0;
}
