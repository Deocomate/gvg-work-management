// Trang Lương trong khung app chính. Mỗi tab là một trang riêng (/luong/<tab>) nhúng đúng một tab của app lương
// (lõi ở /luong/app, xem payroll.mount.js) bằng iframe ?embed=1&tabs=<khoá tab>. Thanh tab nằm ở app chính.
//   Quản lý (chủ cửa hàng): Kỳ lương · Chấm công · Thưởng & khấu trừ · Hoa hồng · Thiết lập
//   Nhân viên             : Chấm công · Lương của tôi · Cách tính hoa hồng · Tài khoản nhận lương
// Đổi tên đường dẫn thì sửa cả HOST_PATH trong src/payroll/src/app.html (nút trong app lương nhảy sang tab khác).
import { PAYROLL_PATH } from './payroll.mount.js';

// [đường dẫn, khoá tab trong app lương, tên tab] — không có dòng mô tả dưới tiêu đề
const OWNER_TABS = [
  ['ky-luong', 'tong', 'Kỳ lương'],
  ['cham-cong', 'cc', 'Chấm công'],
  ['thuong', 'thuong', 'Thưởng & khấu trừ'],
  ['hoa-hong', 'hh', 'Hoa hồng'],
  ['thiet-lap', 'cd', 'Thiết lập'],
];
const STAFF_TABS = [
  ['cham-cong', 'cc', 'Chấm công'],
  ['cua-toi', 'luong', 'Lương của tôi'],
  ['hoa-hong', 'hh', 'Cách tính hoa hồng'],
  ['tai-khoan', 'tk', 'Tài khoản nhận lương'],
];

const tabsFor = (user) => (user?.role === 'admin' ? OWNER_TABS : STAFF_TABS);

/** /luong → tab đầu tiên của người đang đăng nhập. */
export const index = (req, res) => res.redirect(`/luong/${tabsFor(req.user)[0][0]}`);

/** /luong/:tab — tab không thuộc vai trò này thì về tab đầu. */
export const tab = (req, res) => {
  const tabs = tabsFor(req.user);
  const cur = tabs.find(([slug]) => slug === req.params.tab);
  if (!cur) return res.redirect('/luong');
  res.render('payroll/index', {
    title: cur[2] === 'Kỳ lương' ? 'Lương' : `${cur[2]} · Lương`,
    heading: cur[2],
    tabs: tabs.map(([slug, , label]) => ({ href: `/luong/${slug}`, label })),
    frameSrc: `${PAYROLL_PATH}/?embed=1&tabs=${cur[1]}`,
  });
};

/** Link cũ Cài đặt > Cài đặt lương (/account/luong) → tab tương ứng trong Lương. */
export const legacySettings = (req, res) =>
  res.redirect(req.user?.role === 'admin' ? '/luong/thiet-lap' : '/luong/tai-khoan');
