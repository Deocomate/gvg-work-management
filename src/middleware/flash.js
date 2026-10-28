// Thông báo một lần (hiện ở trang kế tiếp sau redirect).
//   req.flash('success', 'Đã lưu');   req.flash('error', 'Có lỗi')
export function flash(req, res, next) {
  res.locals.flash = req.session.flash ?? [];
  delete req.session.flash;

  req.flash = (type, message) => {
    req.session.flash = [...(req.session.flash ?? []), { type, message }];
  };
  next();
}
