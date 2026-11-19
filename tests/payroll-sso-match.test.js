// Một tài khoản cho mọi việc: tài khoản lịch tự ghép với hồ sơ lương trùng tên, không cần tài khoản lương riêng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payrollStaffIdFor } from '../src/modules/payroll/payroll.access.js';

const staff = [
  { id: 'nv1', name: 'Nhài Phạm' },
  { id: 'nv2', name: 'Minh Long' },
  { id: 'nv3', name: 'Trang Vũ' },
];
const users = [
  { id: 1, name: 'Mai' },
  { id: 2, name: 'Nhài' },
  { id: 3, name: 'Minh Long' },
  { id: 4, name: 'Trang' },
];
const match = (id, u = users, s = staff) => payrollStaffIdFor(u.find((x) => x.id === id), u, s);

test('trùng tên hẳn hoặc tên ngắn nằm trong tên đầy đủ thì ghép được', () => {
  assert.equal(match(3), 'nv2');
  assert.equal(match(4), 'nv3');
  assert.equal(match(2), 'nv1');
});

test('không hoa/thường, khoảng trắng thừa vẫn khớp; khác dấu thì không', () => {
  assert.equal(payrollStaffIdFor({ id: 9, name: '  minh   LONG ' }, [{ id: 9, name: '  minh   LONG ' }], staff), 'nv2');
  assert.equal(payrollStaffIdFor({ id: 9, name: 'Nhai' }, [{ id: 9, name: 'Nhai' }], staff), null);
});

test('không có hồ sơ trùng tên thì không ghép', () => {
  assert.equal(match(1), null);
});

test('tên khớp nhiều hồ sơ thì không ghép (không đoán)', () => {
  const two = [...staff, { id: 'nv4', name: 'Trang Lê' }];
  assert.equal(match(4, users, two), null);
});

test('hai tài khoản cùng khớp một hồ sơ: ưu tiên trùng tên hẳn, còn lại không ai được ghép', () => {
  const withFull = [...users, { id: 5, name: 'Trang Vũ' }];
  assert.equal(match(5, withFull), 'nv3');
  assert.equal(match(4, withFull), null); // "Trang" không được xem lương của "Trang Vũ"
  const twins = [...users, { id: 6, name: 'Trang' }];
  assert.equal(match(4, twins), null);
  assert.equal(match(6, twins), null);
});
