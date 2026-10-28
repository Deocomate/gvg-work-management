// Chỉ cho phép quay về đường dẫn nội bộ (chống open redirect qua tham số "back").
export const safeBack = (value, fallback = '/') =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
