// Luật dữ liệu cho form Plan nội dung. Lựa chọn cố định dùng chung cho view, bộ lọc và validate.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';
import { BRANDS } from '#lib/brands.js';

export { BRANDS };

export const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok', badge: 'badge-gray' },
  { value: 'facebook', label: 'Facebook', badge: 'badge-gray' },
  { value: 'instagram', label: 'Instagram', badge: 'badge-gray' },
  { value: 'youtube', label: 'YouTube', badge: 'badge-gray' },
  { value: 'other', label: 'Khác', badge: 'badge-gray' },
];

export const VIDEO_TYPES = [
  { value: 'A – Phức tạp', label: 'A – Phức tạp' },
  { value: 'B – Trung bình', label: 'B – Trung bình' },
  { value: 'C – Đơn giản', label: 'C – Đơn giản' },
  { value: 'Clip live', label: 'Clip live' },
  { value: 'Ghép source có sẵn', label: 'Ghép source có sẵn' },
];

// Gợi ý sẵn cho ô "Tuyến nội dung" (cột topic); vẫn gõ tuyến mới được.
export const CONTENT_LINES = [
  'VG – Xưởng & nghệ nhân',
  'VG – Kiến thức thờ cúng, phong thủy',
  'VG – Sản phẩm & báo giá',
  'VG – Khách thật, giao hàng thật',
  'VG – Xu hướng, cảm xúc',
  'KL – Aesthetic, styling',
  'KL – Quy trình thủ công',
  'KL – Gợi ý quà tặng',
  'KL – Unbox, feedback',
  'KL – Trend & DIY',
  'GSXD – Công trình thực tế',
  'GSXD – Quy trình sản xuất',
  'GSXD – Kiến thức vật liệu, tư vấn',
  'GSXD – Sản phẩm & báo giá',
  'GSXD – Đại lý, giao hàng',
];

// Thẻ trên lịch: nền trung tính + chữ đậm cho dễ đọc ở cả giao diện sáng/tối; bước hiện tại thể hiện bằng
// vạch màu bên trái (bar) và chấm màu (dot). Màu cố định (không theo theme) để 2 giao diện giống nhau.
// Thứ tự = thứ tự các bước. Chỉ 3 bước: Mới → Đã chọn → Đã xong ("Đã xong" giữ giá trị 'posted' trong DB).
export const PLAN_STATUSES = [
  { value: 'idea', label: 'Mới', badge: 'badge-gray', bar: 'border-l-slate-400', dot: 'bg-slate-400' },
  { value: 'selected', label: 'Đã chọn', badge: 'badge-pink', bar: 'border-l-fuchsia-500', dot: 'bg-fuchsia-500' },
  { value: 'posted', label: 'Đã xong', badge: 'badge-green', bar: 'border-l-emerald-500', dot: 'bg-emerald-500' },
  { value: 'dropped', label: 'Bỏ', badge: 'badge-red', bar: 'border-l-rose-500 line-through', dot: 'bg-rose-500' },
];

const values = (list) => list.map((o) => o.value);
const optionalText = (max, message) => z.preprocess(emptyToUndefined, z.string().trim().max(max, message).optional());
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(2000, 'Link quá dài')
    // Chỉ http/https: chặn link "javascript:" chạy mã độc khi người khác bấm vào.
    .pipe(z.url({ protocol: /^https?$/, error: 'Link phải bắt đầu bằng http:// hoặc https://' }))
    .optional(),
);
// Link tham khảo / kịch bản: Sheet cũ hay ghi chữ (tên video, tên file) thay vì link -> cho gõ tự do,
// view chỉ biến thành link khi là http(s) (helper isUrl).
const linkOrText = optionalText(2000, 'Tối đa 2000 ký tự');

export const MAX_EXTRA_REFERENCES = 10;
/**
 * Link tham khảo 2, 3…: form gửi nhiều ô cùng tên (mảng), DB lưu mỗi link một dòng.
 * Hàm này đọc cả hai dạng thành danh sách, bỏ ô trống.
 */
export const extraReferences = (v) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : [])
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
const extraReferenceList = z.preprocess(
  extraReferences,
  z
    .array(z.string().max(2000, 'Mỗi link tối đa 2000 ký tự'))
    .max(MAX_EXTRA_REFERENCES, `Tối đa ${MAX_EXTRA_REFERENCES} link tham khảo thêm`)
    .transform((list) => (list.length ? list.join('\n') : undefined)),
);
const optionalUser = (message) =>
  z.preprocess(emptyToUndefined, z.coerce.number({ error: message }).int().positive().optional());
const oneOf = (list, message) => z.preprocess(emptyToUndefined, z.enum(values(list), { error: message }).optional());
const optionalDate = z.preprocess(emptyToUndefined, z.iso.date({ error: 'Ngày không hợp lệ' }).optional());

export const planSchema = z
  .object({
    title: z.string({ error: 'Vui lòng nhập tên ý tưởng' }).trim().min(1, 'Vui lòng nhập tên ý tưởng').max(1000, 'Tối đa 1000 ký tự'),
    description: optionalText(3000, 'Tối đa 3000 ký tự'),
    reference_url: linkOrText,
    extra_reference_urls: extraReferenceList,
    platform: z.preprocess((v) => emptyToUndefined(v) ?? 'tiktok', z.enum(values(PLATFORMS), { error: 'Kênh không hợp lệ' })),
    topic: optionalText(120, 'Tối đa 120 ký tự'),
    status: z.preprocess((v) => emptyToUndefined(v) ?? 'idea', z.enum(values(PLAN_STATUSES), { error: 'Trạng thái không hợp lệ' })),
    shoot_date: optionalDate,
    post_date: optionalDate,
    post_time: z.preprocess(emptyToUndefined, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ').optional()),
    post_url: optionalUrl,
    owner_id: optionalUser('Người phụ trách không hợp lệ'),
    brand: oneOf(BRANDS, 'Brand không hợp lệ'),
    video_type: oneOf(VIDEO_TYPES, 'Loại video không hợp lệ'),
    proposer_id: optionalUser('Người góp không hợp lệ'),
    writer_id: optionalUser('Người viết kịch bản không hợp lệ'),
    // Kịch bản: link, hoặc viết thẳng cả kịch bản (nhiều dòng) nên cho dài hơn.
    script: optionalText(5000, 'Tối đa 5000 ký tự'),
    shoot_time: optionalText(40, 'Tối đa 40 ký tự'),
    location: optionalText(80, 'Tối đa 80 ký tự'),
    props: optionalText(300, 'Tối đa 300 ký tự'),
    source_url: optionalUrl,
    note: optionalText(3000, 'Tối đa 3000 ký tự'),
  })
  .refine((d) => !d.shoot_date || !d.post_date || d.shoot_date <= d.post_date, {
    path: ['post_date'],
    message: 'Ngày đăng phải sau hoặc cùng ngày quay',
  });
