// Quyền xem lương & chấm công của mọi người: chỉ người được bật (sếp Mai, Nhài); người khác, kể cả Quản lý, chỉ thấy của mình.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { run, get } from '../src/db/client.js';
import { canViewAllPayroll } from '../src/modules/payroll/payroll.access.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);

const PASS = 'mat-khau-123';
const idOf = async (agent, name) => {
  const html = (await agent.get('/staff')).text;
  const row = html.split('<tr>').slice(1).find((r) => r.includes(name));
  return row.match(/\/staff\/(\d+)\/edit/)[1];
};
const userByEmail = (email) => get('SELECT id, role, can_payroll FROM users WHERE email = ?', [email]);

test('chưa ai được bật: mọi Quản lý tạm xem được lương mọi người và thấy ô cấp quyền', async () => {
  assert.equal((await admin.get('/luong')).headers.location, '/luong/ky-luong');
  assert.match((await admin.get('/staff/new')).text, /name="can_payroll"/);
  assert.match((await admin.get('/staff')).text, /Lương &amp; chấm công|Lương & chấm công/);
});

test('cấp quyền cho Mai, Nhài; Quản lý khác và nhân viên chỉ còn thấy lương của mình', async () => {
  const add = (data) =>
    postForm(admin, '/staff', { password: PASS, can_payroll: '0', ...data }, { from: '/staff/new' });
  assert.equal((await add({ name: 'Mai', email: 'mai@test.local', role: 'admin', can_payroll: '1' })).status, 302);
  // Đã có Mai thì Quản lý gốc hết quyền cấp: Mai cấp tiếp cho Nhài
  const { agent: mai } = await setup();
  await loginAs(mai, { email: 'mai@test.local', password: PASS });
  const nhai = await postForm(mai, '/staff', { password: PASS, name: 'Nhài', email: 'nhai@test.local', role: 'member', can_payroll: '1' }, { from: '/staff/new' });
  assert.equal(nhai.status, 302);
  assert.equal((await add({ name: 'Long', email: 'long@test.local', role: 'admin' })).status, 302);
  assert.equal((await add({ name: 'An', email: 'an2@test.local', role: 'member' })).status, 302);

  assert.equal((await userByEmail('mai@test.local')).can_payroll, 1);
  assert.equal((await userByEmail('nhai@test.local')).can_payroll, 1);
  assert.equal((await userByEmail('long@test.local')).can_payroll, 0);

  // Quản lý gốc (không phải Mai/Nhài) mất quyền ngay khi đã có người được bật
  assert.equal((await admin.get('/luong')).headers.location, '/luong/cua-toi');
  assert.equal((await admin.get('/luong/ky-luong')).headers.location, '/luong');
  assert.equal((await admin.get('/account/luong')).headers.location, '/luong/tai-khoan');
  assert.doesNotMatch((await admin.get('/staff/new')).text, /name="can_payroll"/);

  for (const [email, all] of [['mai@test.local', true], ['nhai@test.local', true], ['long@test.local', false], ['an2@test.local', false]]) {
    const { agent } = await setup();
    await loginAs(agent, { email, password: PASS });
    assert.equal((await agent.get('/luong')).headers.location, all ? '/luong/ky-luong' : '/luong/cua-toi', email);
    assert.equal(await canViewAllPayroll(await userByEmail(email)), all, email);
  }
});

test('Quản lý không có quyền không tự cấp được (gửi tay can_payroll cũng bỏ qua)', async () => {
  const longId = await idOf(admin, 'Long');
  await postForm(admin, `/staff/${longId}`, { name: 'Long', email: 'long@test.local', role: 'admin', can_payroll: '1' }, { from: `/staff/${longId}/edit` });
  assert.equal((await userByEmail('long@test.local')).can_payroll, 0);
});

test('Mai cấp / bỏ quyền cho người khác, không tự bỏ quyền của mình', async () => {
  const { agent: mai } = await setup();
  await loginAs(mai, { email: 'mai@test.local', password: PASS });
  assert.match((await mai.get('/staff')).text, /Của mọi người/);

  const longId = await idOf(mai, 'Long');
  const form = (id) => mai.get(`/staff/${id}/edit`).then((r) => r.text);
  assert.match(await form(longId), /name="can_payroll"/);
  await postForm(mai, `/staff/${longId}`, { name: 'Long', email: 'long@test.local', role: 'admin', can_payroll: '1' }, { from: `/staff/${longId}/edit` });
  assert.equal((await userByEmail('long@test.local')).can_payroll, 1);
  await postForm(mai, `/staff/${longId}`, { name: 'Long', email: 'long@test.local', role: 'admin', can_payroll: '0' }, { from: `/staff/${longId}/edit` });
  assert.equal((await userByEmail('long@test.local')).can_payroll, 0);

  const maiId = await idOf(mai, 'Mai');
  const self = await postForm(mai, `/staff/${maiId}`, { name: 'Mai', email: 'mai@test.local', role: 'admin', can_payroll: '0' }, { from: `/staff/${maiId}/edit` });
  assert.equal(self.status, 422);
  assert.match(self.text, /không thể tự bỏ quyền xem lương/);
  assert.equal((await userByEmail('mai@test.local')).can_payroll, 1);
});

test('migration bật sẵn theo tên riêng Mai / Nhài, không bật nhầm tên chứa "mai"', async () => {
  const sql = (await import('node:fs')).readFileSync(new URL('../src/db/migrations/021_add_user_can_payroll.sql', import.meta.url), 'utf8');
  const update = sql.slice(sql.indexOf('UPDATE'));
  const names = ['Chị Mai', 'Vũ Thị Mai', 'MAI', 'Nhài', 'Nguyễn Thị Nhài', 'nhai', 'Maika', 'Hải Mail', 'Thái'];
  await run('UPDATE users SET can_payroll = 0');
  for (const [i, name] of names.entries()) {
    await run("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, 'x', 'member')", [`m${i}@test.local`, name]);
  }
  await run(update);
  for (const [i, name] of names.entries()) {
    const want = !['Maika', 'Hải Mail', 'Thái'].includes(name);
    assert.equal((await userByEmail(`m${i}@test.local`)).can_payroll, want ? 1 : 0, name);
  }
});
