// Tab Lịch đăng / Lịch quay / Kịch bản / Up website trên Lịch làm việc: mỗi tab một cấu trúc riêng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { addDays, todayISO, weekDays } from '../src/lib/dates.js';
import { autoScriptDeadline } from '../src/modules/plan/plan.board.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);
await postForm(admin, '/staff', { name: 'Lê Mai', email: 'mai@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
await postForm(admin, '/staff', { name: 'Trần Nam', email: 'nam@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
const { agent: mai } = await setup();
await loginAs(mai, { email: 'mai@test.local', password: 'mat-khau-123' });
const { agent: nam } = await setup();
await loginAs(nam, { email: 'nam@test.local', password: 'mat-khau-123' });

// Thứ 2 của tuần ~30 ngày tới: ngày quay (Thứ 2) và ngày đăng (Thứ 3) luôn cùng một tuần, không phụ thuộc hôm nay là thứ mấy.
const date = weekDays(addDays(todayISO(), 30))[0];
const page = async (agent, query) => (await agent.get(`/today?date=${date}&${query}`)).text;
/** Thẻ nội dung trên tab (từ id="plan-…" tới hết thẻ). */
const cardOf = (html, title) => {
  const card = html.split('<li id="plan-').slice(1).find((c) => c.includes(title));
  return card && { id: card.match(/^\d+/)[0], html: card.split('</li>')[0] };
};
const checked = (html, label) => new RegExp(`<input type="checkbox" checked[^>]*aria-label="${label}"`).test(html);
const tick = (agent, id, field, on) => postForm(agent, `/plan/${id}/tick`, { field, on: on ? '1' : '0', back: '/today?tab=dang' }, { from: '/today' });

await postForm(mai, '/plan', {
  title: 'Mở lò men lam', brand: 'Vũ Gia', platform: 'tiktok', status: 'selected', owner_id: '',
  post_date: addDays(date, 1), shoot_date: date, shoot_time: '9h - 11h', location: 'Xưởng', reference_url: 'https://www.tiktok.com/@x/video/1',
}, { from: '/plan/new' });

test('Lịch đăng: tick riêng Facebook và TikTok, đủ 2 kênh thì bài xong', async () => {
  let card = cardOf(await page(mai, 'tab=dang'), 'Mở lò men lam');
  assert.ok(card, 'thẻ có trên Lịch đăng');
  assert.match(card.html, /aria-label="Facebook"/);
  assert.match(card.html, /aria-label="TikTok"/);
  assert.equal((await tick(mai, card.id, 'fb', true)).status, 302);
  card = cardOf(await page(mai, 'tab=dang'), 'Mở lò men lam');
  assert.ok(checked(card.html, 'Facebook') && !checked(card.html, 'TikTok'));
  assert.doesNotMatch(card.html, /is-done/);
  await tick(mai, card.id, 'tt', true);
  card = cardOf(await page(mai, 'tab=dang'), 'Mở lò men lam');
  assert.match(card.html, /is-done/);
  // Bỏ tick một kênh -> mở lại
  await tick(mai, card.id, 'tt', false);
  card = cardOf(await page(mai, 'tab=dang'), 'Mở lò men lam');
  assert.ok(checked(card.html, 'Facebook') && !checked(card.html, 'TikTok'));
  assert.doesNotMatch(card.html, /is-done/);
});

test('Lịch quay: giờ, địa điểm, ngày đăng, link REF, tick Đã quay; Kịch bản: hạn tự động + chọn riêng', async () => {
  let card = cardOf(await page(mai, 'tab=quay'), 'Mở lò men lam');
  assert.match(card.html, /09:00–11:00<\/span> · Xưởng · Đăng/);
  assert.match(card.html, /href="https:\/\/www\.tiktok\.com\/@x\/video\/1"/);
  await tick(mai, card.id, 'filmed', true);
  assert.match(cardOf(await page(mai, 'tab=quay'), 'Mở lò men lam').html, /is-done/);

  // Hạn kịch bản: trước ngày đăng 3 ngày, nhưng không muộn hơn ngày trước buổi quay
  assert.equal(autoScriptDeadline({ post_date: '2026-11-20', shoot_date: null }), '2026-11-17');
  assert.equal(autoScriptDeadline({ post_date: '2026-11-20', shoot_date: '2026-11-16' }), '2026-11-15');
  await postForm(mai, `/plan/${card.id}/script-deadline`, { deadline: date, back: '/today' }, { from: '/today' });
  card = cardOf(await page(mai, 'tab=kich-ban'), 'Mở lò men lam');
  assert.match(card.html, new RegExp(`name="deadline" value="${date}"`));
  assert.match(card.html, /Kịch bản xong/);
  assert.match(card.html, />Tự động</); // có nút về hạn tự động
});

test('người không liên quan không tick được nội dung người khác', async () => {
  const card = cardOf(await page(nam, 'tab=dang'), 'Mở lò men lam');
  assert.match(card.html, /disabled/);
  assert.equal((await tick(nam, card.id, 'fb', true)).status, 403);
});

test('Up website: checklist theo trang, tick mục, thêm trang + việc, lọc danh mục', async () => {
  const html = await page(nam, 'tab=web');
  assert.match(html, /GSXD · THCeramics/);
  assert.match(html, /GVG · Gốm Vũ Gia/);
  assert.match(html, /Trang chủ/);
  assert.doesNotMatch(html, /Chọn tuần và lọc/); // không có thanh chọn tuần

  const add = await postForm(nam, '/website/pages', { site: 'GVG', title: 'Gạch thử nghiệm QA', path: '/gach-thu', category: 'Sản phẩm', back: '/today?tab=web&site=GVG' }, { from: '/today' });
  assert.equal(add.status, 302);
  const pageId = add.headers.location.match(/#page-(\d+)/)[1];
  await postForm(nam, `/website/pages/${pageId}/items`, { kind: 'todo', text: 'Chụp ảnh sản phẩm', back: '/today?tab=web&site=GVG' }, { from: '/today' });
  let gvg = await page(nam, 'tab=web&site=GVG&cat=S%E1%BA%A3n%20ph%E1%BA%A9m');
  assert.match(gvg, /Gạch thử nghiệm QA/);
  assert.match(gvg, /Chụp ảnh sản phẩm/);
  assert.doesNotMatch(gvg, />Trang chủ</);
  const itemId = [...gvg.split('Chụp ảnh sản phẩm')[0].matchAll(/action="\/website\/items\/(\d+)"/g)].at(-1)[1];
  await postForm(nam, `/website/items/${itemId}`, { done: '1', back: '/today?tab=web&site=GVG' }, { from: '/today' });
  gvg = await page(nam, 'tab=web&site=GVG&cat=S%E1%BA%A3n%20ph%E1%BA%A9m');
  assert.match(gvg.split(`id="page-${pageId}"`)[1], /<b class="text-ink">100%<\/b>/);

  // Nhân viên khác không xoá được trang người khác thêm; quản lý thì được
  assert.equal((await postForm(mai, `/website/pages/${pageId}/delete`, { back: '/today?tab=web' }, { from: '/today' })).status, 403);
  assert.equal((await postForm(admin, `/website/pages/${pageId}/delete`, { back: '/today?tab=web' }, { from: '/today' })).status, 302);
  assert.doesNotMatch(await page(nam, 'tab=web&site=GVG'), /Gạch thử nghiệm QA/);
});
