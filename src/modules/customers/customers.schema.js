// Luật dữ liệu cho form khách hàng. Lựa chọn cố định dùng chung cho view, bộ lọc và validate.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

export const CUSTOMER_TYPES = [
  { value: 'personal', label: 'Cá nhân' },
  { value: 'business', label: 'Doanh nghiệp' },
];

// Nguồn khách: biết kênh nào mang về nhiều khách để đầu tư đúng chỗ.
export const CUSTOMER_SOURCES = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'zalo', label: 'Zalo' },
  { value: 'website', label: 'Website' },
  { value: 'shopee', label: 'Sàn TMĐT (Shopee, Lazada…)' },
  { value: 'referral', label: 'Người quen giới thiệu' },
  { value: 'walk_in', label: 'Đến cửa hàng / showroom' },
  { value: 'event', label: 'Hội chợ / sự kiện' },
  { value: 'other', label: 'Khác' },
];

// Trạng thái chăm sóc: từ lúc mới có số tới khi thành khách quen.
export const CUSTOMER_STATUSES = [
  { value: 'new', label: 'Mới', badge: 'badge-blue' },
  { value: 'consulting', label: 'Đang tư vấn', badge: 'badge-yellow' },
  { value: 'deposited', label: 'Đã cọc', badge: 'badge-orange' },
  { value: 'bought', label: 'Đã mua', badge: 'badge-green' },
  { value: 'loyal', label: 'Khách quen', badge: 'badge-pink' },
  { value: 'stopped', label: 'Ngừng chăm sóc', badge: 'badge-gray' },
];

const values = (list) => list.map((o) => o.value);
const clean = (v) => emptyToUndefined(typeof v === 'string' ? v.trim() : v);
const optionalText = (max, message = `Tối đa ${max} ký tự`) => z.preprocess(clean, z.string().max(max, message).optional());

export const customerSchema = z
  .object({
    name: z.string({ error: 'Vui lòng nhập tên khách hàng' }).trim().min(1, 'Vui lòng nhập tên khách hàng').max(150, 'Tối đa 150 ký tự'),
    phone: z.preprocess(
      clean,
      z
        .string()
        .regex(/^\+?[\d\s.()-]+$/, 'Số điện thoại chỉ gồm chữ số')
        .refine((v) => /^\d{9,15}$/.test(v.replace(/\D/g, '')), 'Số điện thoại cần 9–15 chữ số')
        .optional(),
    ),
    email: z.preprocess(clean, z.string().toLowerCase().pipe(z.email({ error: 'Email không hợp lệ' })).optional()),
    zalo: optionalText(300),
    facebook: optionalText(300),
    tiktok: optionalText(300),
    social: optionalText(300), // kênh khác: Instagram, Shopee…
    customer_type: z.preprocess((v) => clean(v) ?? 'personal', z.enum(values(CUSTOMER_TYPES), { error: 'Loại khách không hợp lệ' })),
    company: optionalText(200),
    tax_code: z.preprocess(clean, z.string().regex(/^[\d-]{10,14}$/, 'Mã số thuế gồm 10 hoặc 13 chữ số').optional()),
    address: optionalText(300),
    birthday: z.preprocess(clean, z.iso.date({ error: 'Ngày sinh không hợp lệ' }).optional()),
    source: z.preprocess(clean, z.enum(values(CUSTOMER_SOURCES), { error: 'Nguồn khách không hợp lệ' }).optional()),
    status: z.preprocess((v) => clean(v) ?? 'new', z.enum(values(CUSTOMER_STATUSES), { error: 'Trạng thái không hợp lệ' })),
    interest: optionalText(500),
    note: optionalText(2000),
    owner_id: z.preprocess(clean, z.coerce.number().int().positive().optional()),
  })
  // Không có cách nào liên lạc thì data khách hàng gần như vô dụng.
  .refine((d) => d.phone || d.email || d.zalo || d.facebook || d.tiktok || d.social, {
    path: ['phone'],
    message: 'Cần ít nhất một cách liên lạc: số điện thoại, email, Zalo, Facebook hoặc TikTok',
  });

// Hoá đơn (khối "Thêm hoá đơn" trong form khách hàng). Để trống cả khối = không thêm hoá đơn.
// Giá trị nhận cả "1.500.000", "1,500,000đ" -> 1500000.
const toAmount = (v) => {
  const s = clean(v);
  if (s === undefined) return undefined;
  const digits = String(s).replace(/[.,\s]|đ|vnđ|vnd/gi, '');
  return /^\d+$/.test(digits) ? Number(digits) : s;
};

export const invoiceSchema = z.object({
  invoice_date: z.preprocess(clean, z.iso.date({ error: 'Ngày hoá đơn không hợp lệ' }).optional()),
  invoice_amount: z.preprocess(
    toAmount,
    z.number({ error: 'Giá trị hoá đơn chỉ gồm chữ số' }).int().min(0).max(100_000_000_000, 'Giá trị quá lớn').optional(),
  ),
  invoice_note: optionalText(500),
});

// File hoá đơn nhận: PDF và ảnh chụp. Kiểm tra bằng nội dung file (không tin đuôi/tên file).
export const INVOICE_FILE_TYPES = [
  { type: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/** Loại file thật của nội dung, hoặc null nếu không phải PDF/ảnh được nhận. */
export const detectInvoiceType = (buffer) => INVOICE_FILE_TYPES.find((t) => buffer?.length > 12 && t.test(buffer)) ?? null;

/** Chỉ giữ chữ số của số điện thoại, để so trùng và tìm kiếm ("0912.345.678" = "0912 345 678" = "+84 912 345 678"). */
export function phoneDigits(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return /^84\d{9}$/.test(digits) ? `0${digits.slice(2)}` : digits;
}
