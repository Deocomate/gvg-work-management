// Brand của công ty — dùng chung cho Plan nội dung và nhãn brand của công việc.
// short = chữ viết tắt trên lịch tháng; badge = màu nhãn brand (src/styles/app.css) — mỗi brand một màu riêng.
export const BRANDS = [
  { value: 'Vũ Gia', label: 'Vũ Gia', short: 'VG', badge: 'badge-brand-vg' },
  { value: 'Klayy', label: 'Klayy', short: 'KL', badge: 'badge-brand-kl' },
  { value: 'GSXD', label: 'GSXD', short: 'GS', badge: 'badge-brand-gs' },
];

export const brandInfo = (value) => BRANDS.find((b) => b.value === value) ?? null;

/** Bộ lọc brand: tên brand, NO_BRAND (việc chưa gắn brand) hoặc '' (tất cả). */
export const NO_BRAND = 'none';
export const parseBrandFilter = (value) => (value === NO_BRAND || brandInfo(value) ? value : '');
