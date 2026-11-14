// Trang Lương trong khung app chính. Mỗi tab là một trang riêng (/luong/<tab>) nhúng đúng một tab của app lương
// (lõi ở /luong/app, xem payroll.mount.js) bằng iframe ?embed=1&tabs=<khoá tab>. Thanh tab nằm ở app chính.
//   Quản lý (chủ cửa hàng): Bảng lương · Khoản cộng-trừ · Báo cáo  (+ thao tác phụ: Hoa hồng, Cài đặt)
//   Nhân viên             : Lương của tôi · Cách tính hoa hồng · Tài khoản nhận lương
// Chấm công / nhập giờ KHÔNG có ở đây: chỉ nhập ở Tháng › Bảng công (/calendar?view=cong), cùng bản ghi với bảng lương.
// Đổi tên đường dẫn thì sửa cả HOST_PATH trong src/payroll/src/app.html (nút trong app lương nhảy sang tab khác).
import { PAYROLL_PATH } from './payroll.mount.js';

// [đường dẫn, khoá tab trong app lương, tên tab, thao tác phụ?]
const OWNER_TABS = [
  ['ky-luong', 'tong', 'Bảng lương'],
  ['thuong', 'thuong', 'Khoản cộng-trừ'],
  ['bao-cao', 'bao', 'Báo cáo'],
  ['hoa-hong', 'hh', 'Hoa hồng', true],
  ['thiet-lap', 'cd', 'Cài đặt', true],
];
const STAFF_TABS = [
  ['cua-toi', 'luong', 'Lương của tôi'],
  ['hoa-hong', 'hh', 'Cách tính hoa hồng'],
  ['tai-khoan', 'tk', 'Tài khoản nhận lương'],
];

const tabsFor = (user) => (user?.role === 'admin' ? OWNER_TABS : STAFF_TABS);

/** /luong → tab đầu tiên của người đang đăng nhập. */
export const index = (req, res) => res.redirect(`/luong/${tabsFor(req.user)[0][0]}`);

/** /luong/:tab — tab không thuộc vai trò này thì về tab đầu. */
export const tab = (req, res) => {
  // Link chấm công cũ: chấm công giờ nằm ở Tháng › Bảng công
  if (req.params.tab === 'cham-cong') return res.redirect('/calendar?view=cong');
  const tabs = tabsFor(req.user);
  const cur = tabs.find(([slug]) => slug === req.params.tab);
  if (!cur) return res.redirect('/luong');
  const toLink = ([slug, , label]) => ({ href: `/luong/${slug}`, label });
  res.render('payroll/index', {
    title: cur[2] === 'Bảng lương' ? 'Lương' : `${cur[2]} · Lương`,
    heading: 'Lương',
    current: cur[2],
    tabs: tabs.filter((t) => !t[3]).map(toLink),
    extraTabs: tabs.filter((t) => t[3]).map(toLink),
    frameSrc: `${PAYROLL_PATH}/?embed=1&tabs=${cur[1]}`,
  });
};

/** Link cũ Cài đặt > Cài đặt lương (/account/luong) → tab tương ứng trong Lương. */
export const legacySettings = (req, res) =>
  res.redirect(req.user?.role === 'admin' ? '/luong/thiet-lap' : '/luong/tai-khoan');
