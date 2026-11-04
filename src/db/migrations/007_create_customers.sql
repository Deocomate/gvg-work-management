-- Data khách hàng: chỉ quản lý và người được cấp quyền (users.can_customers = 1) xem/nhập.
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  phone         TEXT,
  -- Chỉ chữ số của phone (VD "0912 345 678" -> "0912345678"): để tìm kiếm và chặn nhập trùng số.
  phone_digits  TEXT,
  email         TEXT,
  social        TEXT,                                -- Zalo / Facebook / TikTok (tên hoặc link)
  customer_type TEXT    NOT NULL DEFAULT 'personal', -- personal | business
  company       TEXT,
  tax_code      TEXT,
  address       TEXT,
  birthday      TEXT,                                -- YYYY-MM-DD
  source        TEXT,                                -- facebook | tiktok | zalo | website | referral | walk_in | other
  status        TEXT    NOT NULL DEFAULT 'new',      -- new | consulting | deposited | bought | loyal | stopped
  interest      TEXT,                                -- nhu cầu / sản phẩm quan tâm
  note          TEXT,
  owner_id      INTEGER REFERENCES users (id) ON DELETE SET NULL, -- người phụ trách chăm sóc
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- Hai người nhập cùng một số điện thoại cùng lúc: DB chặn, không phụ thuộc kiểm tra trong code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_digits ON customers (phone_digits) WHERE phone_digits IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers (status);

-- Quyền xem & nhập Data khách hàng cho nhân viên (quản lý luôn có quyền).
ALTER TABLE users ADD COLUMN can_customers INTEGER NOT NULL DEFAULT 0;
