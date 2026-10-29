import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { holidayOn, previewHoliday } from '#lib/holidays.js';

test('bật trang trí 7 ngày trước lễ, đúng ngày lễ vẫn còn', () => {
  assert.equal(holidayOn('2026-10-23'), null);
  assert.equal(holidayOn('2026-10-24').key, 'halloween');
  assert.equal(holidayOn('2026-10-29').message, 'Còn 2 ngày nữa là Halloween');
  assert.equal(holidayOn('2026-10-30').message, 'Ngày mai là Halloween');
  assert.equal(holidayOn('2026-10-31').message, 'Happy Halloween!');
});

test('hết lễ thì trở lại bình thường', () => {
  assert.equal(holidayOn('2026-11-01'), null);
  assert.equal(holidayOn('2026-11-12'), null);
});

test('lễ có trang trí thêm sau ngày lễ (Tết tới mùng 4, 30/4 tới 1/5)', () => {
  assert.equal(holidayOn('2027-02-09').key, 'tet'); // Tết 2027: 06/02
  assert.equal(holidayOn('2027-02-10').key, 'valentine');
  assert.equal(holidayOn('2026-05-01').key, 'reunification');
  assert.equal(holidayOn('2026-05-02'), null);
});

test('hai lễ sát nhau: lấy lễ gần nhất, qua năm mới vẫn đúng', () => {
  assert.equal(holidayOn('2026-12-25').key, 'christmas');
  assert.equal(holidayOn('2026-12-26').key, 'new-year');
  assert.equal(holidayOn('2026-12-26').daysLeft, 6);
  assert.equal(holidayOn('2027-01-01').key, 'new-year');
});

test('lễ âm lịch tra theo năm', () => {
  assert.equal(holidayOn('2026-09-25').key, 'mid-autumn');
  assert.equal(holidayOn('2028-10-03').key, 'mid-autumn');
});

test('xem trước lễ bất kỳ, key lạ trả null', () => {
  assert.equal(previewHoliday('christmas', '2026-06-01').key, 'christmas');
  assert.equal(previewHoliday('khong-co', '2026-06-01'), null);
});

test('trang có ?holiday= (khi dev) hiện dải chúc mừng và hiệu ứng', async () => {
  const { agent } = await setup();
  const res = await agent.get('/login?holiday=christmas');
  assert.match(res.text, /data-holiday="christmas"/);
  assert.match(res.text, /Còn 3 ngày nữa là Giáng sinh/);
  assert.match(res.text, /\/js\/holiday\.js/);
});
