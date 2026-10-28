// Lỗi có chủ đích (404, 403, 400...). Error handler sẽ hiển thị thông báo thân thiện.
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.expose = status < 500; // chỉ hiện message cho người dùng với lỗi 4xx
  }
}

export const notFound = (message = 'Không tìm thấy trang hoặc dữ liệu bạn yêu cầu.') =>
  new AppError(404, message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này.') =>
  new AppError(403, message);
export const badRequest = (message = 'Yêu cầu không hợp lệ.') => new AppError(400, message);
