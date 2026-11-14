// Trang trong khung app chính nhúng app lương (lõi ở /luong/app, xem payroll.mount.js).
// Mỗi trang chỉ cho hiện một số tab của app lương:
//   Lương (/luong)                  : Báo cáo lương, Chấm công, Thưởng & khấu trừ (chủ) · Chấm công, Lương của tôi (nhân viên)
//   Cài đặt > Cài đặt lương         : Hoa hồng, Cài đặt (chủ) · Cách tính hoa hồng, Tài khoản lương (nhân viên)
import { PAYROLL_PATH } from './payroll.mount.js';

const frameSrc = (tabs) => `${PAYROLL_PATH}/?embed=1&tabs=${tabs.join(',')}`;

export const page = (req, res) =>
  res.render('payroll/index', { title: 'Lương', frameSrc: frameSrc(['tong', 'cc', 'thuong', 'luong']) });

export const settings = (req, res) =>
  res.render('payroll/settings', { title: 'Cài đặt lương', frameSrc: frameSrc(['hh', 'cd', 'tk']) });
