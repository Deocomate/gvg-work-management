// Dùng trong test của module cần đăng nhập:
//   import { setup } from './helpers.js';
//   import { loginAsAdmin } from './auth-helpers.js';
//   const { agent } = await setup();
//   await loginAsAdmin(agent);
import { TEST_ADMIN, postForm } from './helpers.js';

export async function loginAsAdmin(agent) {
  const { ensureAdminUser } = await import('../src/modules/auth/auth.service.js');
  await ensureAdminUser();
  const res = await postForm(agent, '/login', TEST_ADMIN, { from: '/login' });
  if (res.status !== 302) throw new Error(`Đăng nhập test thất bại (status ${res.status})`);
  return res;
}
