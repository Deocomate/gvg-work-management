import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import express from 'express';
import request from 'supertest';
import { setup } from './helpers.js';
import { loginAsAdmin } from './auth-helpers.js';
import { PAYROLL_PATH, payrollRouter } from '../src/modules/payroll/payroll.mount.js';

const require = createRequire(import.meta.url);
const { passwordProof } = require('../src/payroll/server/app.js');

const OPTIONS = { adminUsername: 'admin', adminPassword: 'payroll-test-pass', sessionSecret: 'x'.repeat(40), dbFile: ':memory:' };
const mounted = () => {
  const app = express();
  app.use(PAYROLL_PATH, payrollRouter(OPTIONS));
  return request.agent(app);
};

test('trang Lương: mỗi tab một trang trong khung app chính, nhúng đúng một tab của app lương', async () => {
  const { agent } = await setup();
  assert.equal((await agent.get('/luong')).status, 302); // chưa đăng nhập app chính
  await loginAsAdmin(agent);

  const root = await agent.get('/luong');
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, '/luong/ky-luong'); // quản lý vào Bảng lương

  const page = await agent.get('/luong/ky-luong');
  assert.equal(page.status, 200);
  assert.match(page.text, /href="\/luong" class="nav-link nav-link-active"/);
  assert.match(page.text, /href="\/luong\/thiet-lap" class="nav-link "/);
  assert.match(page.text, /<iframe src="\/luong\/app\/\?embed(=|&#x3D;)1&amp;tabs(=|&#x3D;)tong"/);

  const setting = await agent.get('/luong/thiet-lap');
  assert.match(setting.text, /tabs(=|&#x3D;)cd"/);
  assert.match(setting.text, /href="\/luong\/thiet-lap" class="nav-link nav-link-active"/);

  // Báo cáo 12 tháng là tab riêng; không còn tab nhập chấm công trong Lương
  assert.match((await agent.get('/luong/bao-cao')).text, /tabs(=|&#x3D;)bao"/);
  assert.doesNotMatch(page.text, /href="\/luong\/cham-cong"/);
  // link chấm công cũ → bảng công trên trang Lịch làm việc
  assert.equal((await agent.get('/luong/cham-cong')).headers.location, '/today#att-week');
  // tab của nhân viên → về tab đầu; link cũ Cài đặt lương → Thiết lập
  assert.equal((await agent.get('/luong/cua-toi')).headers.location, '/luong');
  assert.equal((await agent.get('/account/luong')).headers.location, '/luong/thiet-lap');
  assert.doesNotMatch((await agent.get('/account')).text, /Cài đặt lương/);
});

test('chưa cấu hình: /luong/app báo chưa bật, app chính vẫn chạy', async () => {
  const { agent } = await setup();
  const res = await agent.get('/luong/app/');
  assert.equal(res.status, 503);
  assert.match(res.text, /Tính lương chưa bật/);
});

test('không đặt mật khẩu lương: vẫn bật, chủ vào bằng tài khoản lịch, không đăng nhập "admin" bằng mật khẩu được', async () => {
  const { payrollConfigProblem } = await import('../src/modules/payroll/payroll.mount.js');
  const noPass = { ...OPTIONS, adminPassword: undefined };
  assert.equal(payrollConfigProblem(noPass), null);

  const app = express();
  app.use(PAYROLL_PATH, payrollRouter(noPass, { ssoUser: async () => ({ who: 'admin', name: 'Chủ' }) }));
  const owner = request.agent(app);
  assert.deepEqual((await owner.get('/luong/app/api/me')).body, { who: 'admin', sso: true, name: 'Chủ' });
  assert.equal((await owner.get('/luong/app/api/recovery-key')).status, 200);

  const plain = express();
  plain.use(PAYROLL_PATH, payrollRouter(noPass));
  const guest = request.agent(plain);
  const { salt } = (await guest.post('/luong/app/api/salt').send({ username: 'admin' })).body;
  const proof = passwordProof('', salt);
  assert.equal((await guest.post('/luong/app/api/login').send({ username: 'admin', proof })).status, 403);
});

test('/luong/app chuyển sang /luong/app/, nạp runtime dưới /luong/app, cho nhúng cùng nguồn', async () => {
  const agent = mounted();
  const redirect = await agent.get('/luong/app');
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.location, '/luong/app/');
  const page = await agent.get('/luong/app/');
  assert.equal(page.status, 200);
  assert.equal(page.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(page.text, /<script src="\/luong\/app\/runtime\.js"><\/script>/);
  const runtime = await agent.get('/luong/app/runtime.js');
  assert.match(runtime.text, /'\/luong\/app\/api\/login'/);
  assert.doesNotMatch(runtime.text, /'\/api\//);
});

test('super admin đăng nhập được, cookie chỉ gửi trong /luong/app', async () => {
  const agent = mounted();
  assert.equal((await agent.get('/luong/app/api/me')).body.who, null);
  const { salt } = (await agent.post('/luong/app/api/salt').send({ username: 'admin' })).body;
  const login = await agent.post('/luong/app/api/login').send({ username: 'admin', proof: passwordProof(OPTIONS.adminPassword, salt) });
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'][0], /Path=\/luong\/app/);
  assert.equal((await agent.get('/luong/app/api/me')).body.who, 'admin');
});

test('sai mật khẩu bị từ chối', async () => {
  const agent = mounted();
  const { salt } = (await agent.post('/luong/app/api/salt').send({ username: 'admin' })).body;
  const res = await agent.post('/luong/app/api/login').send({ username: 'admin', proof: passwordProof('sai-mat-khau-123', salt) });
  assert.equal(res.status, 403);
});

test('lịch tuần và lịch tháng có chỗ chấm công khi phần Lương đã bật', async () => {
  const { app, agent } = await setup();
  await loginAsAdmin(agent);
  assert.doesNotMatch((await agent.get('/today')).text, /data-att-root/); // chưa bật thì không có gì
  app.locals.payrollEnabled = true;
  const today = await agent.get('/today');
  assert.match(today.text, /data-att-root data-mode="week" data-selected="\d{4}-\d{2}-\d{2}"/);
  // bảng công tuần: đủ 7 ngày T2–CN, chấm công / nhập giờ ngay trên trang này
  assert.match(today.text, /data-days="(\d{4}-\d{2}-\d{2},){6}\d{4}-\d{2}-\d{2}"/);
  assert.match(today.text, /Bảng công tuần/);
  assert.match(today.text, /\/js\/attendance\.js/);
  // Trang Tháng: tab Lịch việc (mặc định) và tab Bảng công (lưới tháng, mỗi nhân viên một tab)
  const cal = await agent.get('/calendar');
  assert.doesNotMatch(cal.text, /data-att-root/);
  assert.match(cal.text, /href="\/calendar\?month(=|&#x3D;)\d{4}-\d{2}&amp;view(=|&#x3D;)cong/);
  const cong = await agent.get('/calendar?view=cong&month=2026-11');
  assert.match(cong.text, /data-att-root data-mode="month"/);
  assert.match(cong.text, /data-month="2026-11"/);
  assert.match(cong.text, /Bảng công tháng/);
});

test('đăng nhập chung: tài khoản lịch đã liên kết vào Lương không cần mật khẩu lương', async () => {
  const crypto = await import('node:crypto');
  // chủ (super admin) lưu cấu hình có khoá dữ liệu của nv1, bọc bằng khoá khôi phục như app lương làm trên trình duyệt
  const owner = mounted();
  const { salt } = (await owner.post('/luong/app/api/salt').send({ username: 'admin' })).body;
  await owner.post('/luong/app/api/login').send({ username: 'admin', proof: passwordProof(OPTIONS.adminPassword, salt) });
  const recovery = Buffer.from((await owner.get('/luong/app/api/recovery-key')).body.key, 'hex');
  const raw = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', recovery, iv);
  c.setAAD(Buffer.from('wrap:nv1'));
  const ct = Buffer.concat([c.update(raw), c.final(), c.getAuthTag()]);
  const cfg = { company: 'Test', staff: [{ id: 'nv1', name: 'An', title: 'Sale', wA: { iv: iv.toString('base64'), ct: ct.toString('base64') } }] };
  assert.equal((await owner.put('/luong/app/api/doc?path=cfg%2Fmain').send(cfg)).status, 204);

  // người dùng lịch liên kết nv1: không cookie lương, vẫn là nv1 và lấy được đúng khoá của mình
  const app = express();
  app.use(PAYROLL_PATH, payrollRouter(OPTIONS, { ssoUser: async () => ({ who: 'nv1', name: 'An' }) }));
  const staff = request.agent(app);
  assert.deepEqual((await staff.get('/luong/app/api/me')).body, { who: 'nv1', sso: true, name: 'An' });
  assert.equal((await staff.get('/luong/app/api/my-key')).body.key, raw.toString('hex'));
  assert.equal((await staff.get('/luong/app/api/recovery-key')).status, 403); // nhân viên không mở được dữ liệu người khác
  assert.equal((await staff.get('/luong/app/api/doc?path=cfg%2Fmain')).status, 200);

  // người chưa liên kết: như cũ, phải đăng nhập lương
  const none = express();
  none.use(PAYROLL_PATH, payrollRouter(OPTIONS, { ssoUser: async () => null }));
  assert.deepEqual((await request(none).get('/luong/app/api/me')).body, { who: null, sso: false, name: null });
  assert.equal((await request(none).get('/luong/app/api/my-key')).status, 401);
});
