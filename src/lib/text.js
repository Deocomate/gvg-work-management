// Xử lý chữ tiếng Việt dùng chung.

/** Bỏ dấu + chữ thường: "Quy trình Nghỉ phép" -> "quy trinh nghi phep". Dùng để tìm kiếm gõ không dấu vẫn ra. */
export const foldText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
