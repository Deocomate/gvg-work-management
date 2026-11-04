-- Hoá đơn của khách hàng: mỗi lần mua một dòng (giá trị, ngày, file hoá đơn, ghi chú).
-- File lưu ngay trong DB (BLOB, tối đa 10MB): sao lưu/chuyển máy chủ chỉ cần mang theo DB, chạy được cả với Turso.
CREATE TABLE IF NOT EXISTS customer_invoices (
  id            INTEGER PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  invoice_date  TEXT    NOT NULL,              -- YYYY-MM-DD
  amount        INTEGER,                       -- giá trị hoá đơn (đồng)
  note          TEXT,
  file_name     TEXT,
  file_type     TEXT,                          -- application/pdf | image/jpeg | image/png | image/webp
  file_size     INTEGER,
  file_data     BLOB,
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer ON customer_invoices (customer_id, invoice_date);
