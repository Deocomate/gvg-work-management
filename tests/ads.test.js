// Trang Quảng cáo: quyền theo email + lấy số liệu Facebook/TikTok (giả lập fetch, không gọi API thật).
process.env.ADS_VIEWER_EMAILS = 'admin@test.local, Mai@Test.Local';
process.env.META_ACCESS_TOKEN = 'meta-test-token';
process.env.META_AD_ACCOUNT_IDS = 'act_111';
process.env.TIKTOK_ACCESS_TOKEN = 'tiktok-test-token';
process.env.TIKTOK_ADVERTISER_IDS = '222';

// import thường được chạy TRƯỚC các dòng trên -> nạp app bằng import động để config đọc được env.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { setup, postForm } = await import('./helpers.js');
const { loginAs, loginAsAdmin } = await import('./auth-helpers.js');
const { resolveRange } = await import('../src/modules/ads/ads.service.js');
const { normalizeMetaRow } = await import('../src/modules/ads/ads.providers.js');

// ---- Giả lập API
let calls = [];
let failMeta = false;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  calls.push({ url, headers: init.headers ?? {} });
  if (url.hostname === 'graph.facebook.com') {
    if (failMeta) return json({ error: { message: 'Token hết hạn' } }, 400);
    if (url.pathname.endsWith('/act_111')) return json({ name: 'Gốm Vũ Gia', currency: 'VND' });
    if (url.searchParams.get('level') === 'campaign') {
      return json({
        data: [
          {
            campaign_id: 'c1',
            campaign_name: 'Tin nhắn bình hoa',
            spend: '1000000',
            impressions: '50000',
            reach: '30000',
            clicks: '1000',
            actions: [
              { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '40' },
              { action_type: 'purchase', value: '3' },
              { action_type: 'omni_purchase', value: '5' },
            ],
            action_values: [{ action_type: 'omni_purchase', value: '4000000' }],
          },
          { campaign_id: 'c2', campaign_name: 'Chiến dịch tắt', spend: '0', impressions: '0', clicks: '0' },
        ],
      });
    }
    return json({ data: [{ date_start: '2026-11-10', spend: '600000', impressions: '1', clicks: '1', actions: [] }, { date_start: '2026-11-11', spend: '400000', impressions: '1', clicks: '1' }] });
  }
  if (url.hostname === 'business-api.tiktok.com') {
    if (url.pathname.includes('advertiser/info')) return json({ code: 0, data: { list: [{ name: 'Klayy TikTok', currency: 'VND' }] } });
    if (url.searchParams.get('data_level') === 'AUCTION_CAMPAIGN') {
      return json({
        code: 0,
        data: {
          list: [{ dimensions: { campaign_id: 't1' }, metrics: { campaign_name: 'Video cốc gốm', spend: '500000', impressions: '80000', clicks: '400', conversion: '10', video_play_actions: '60000' } }],
          page_info: { total_page: 1 },
        },
      });
    }
    return json({ code: 0, data: { list: [{ dimensions: { stat_time_day: '2026-11-11 00:00:00' }, metrics: { spend: '500000', conversion: '10' } }], page_info: { total_page: 1 } } });
  }
  throw new Error(`fetch không mong đợi: ${url}`);
};

beforeEach(() => {
  calls = [];
  failMeta = false;
});

const { agent: admin } = await setup();
await loginAsAdmin(admin);
for (const [name, email] of [['Chị Mai', 'mai@test.local'], ['Quản lý khác', 'boss@test.local']]) {
  await postForm(admin, '/staff', { name, email, role: 'admin', password: 'mat-khau-123' }, { from: '/staff/new' });
}
const { agent: mai } = await setup();
await loginAs(mai, { email: 'mai@test.local', password: 'mat-khau-123' });
const { agent: boss } = await setup();
await loginAs(boss, { email: 'boss@test.local', password: 'mat-khau-123' });

test('chỉ email được chỉ định xem được; quản lý khác bị chặn và không thấy menu', async () => {
  const { agent: guest } = await setup();
  assert.equal((await guest.get('/ads')).status, 302);
  assert.equal((await boss.get('/ads')).status, 403);
  assert.doesNotMatch((await boss.get('/today')).text, /href="\/ads"/);
  assert.equal((await postForm(boss, '/ads/refresh', { range: '7d' }, { from: '/today' })).status, 403);

  // Email so không phân biệt hoa thường (Mai@Test.Local trong cấu hình)
  assert.match((await mai.get('/today')).text, /href="\/ads"/);
  assert.equal((await mai.get('/ads')).status, 200);
});

test('hiện số liệu Facebook và TikTok, gộp tổng chi tiêu', async () => {
  const page = (await admin.get('/ads?range=30d')).text;
  assert.match(page, /Gốm Vũ Gia/);
  assert.match(page, /Tin nhắn bình hoa/);
  assert.doesNotMatch(page, /Chiến dịch tắt/); // không chi tiêu, không hiển thị -> ẩn
  assert.match(page, /Video cốc gốm/);
  // FB 1.000.000 + TikTok 500.000
  assert.match(page, /1\.500\.000 ₫/);
  // FB: 40 tin nhắn + 5 mua (omni_purchase không cộng trùng purchase) = 45 kết quả; ROAS 4
  assert.match(page, /40 tin nhắn mới · 0 khách tiềm năng · 5 lượt mua/);
  assert.match(page, /ROAS 4x/);
  assert.match(page, /<th class="text-right">ROAS<\/th>/); // cột ROAS chỉ có ở Facebook
  // Token gửi qua header, không nằm trên URL
  assert.ok(calls.length > 0);
  for (const { url, headers } of calls) {
    assert.doesNotMatch(url.toString(), /test-token/);
    assert.ok(headers.Authorization === 'Bearer meta-test-token' || headers['Access-Token'] === 'tiktok-test-token');
  }
});

test('lưu tạm: mở lại không gọi API; bấm Cập nhật ngay thì gọi lại', async () => {
  await admin.get('/ads?range=month');
  calls = [];
  await mai.get('/ads?range=month');
  assert.equal(calls.length, 0);

  const res = await postForm(mai, '/ads/refresh', { range: 'month' }, { from: '/ads' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/ads?range=month');
  assert.ok(calls.length > 0);
});

test('API lỗi: báo lỗi, vẫn hiện bản lưu cũ', async () => {
  await admin.get('/ads?range=yesterday');
  failMeta = true;
  await postForm(admin, '/ads/refresh', { range: 'yesterday' }, { from: '/ads' });
  const page = (await admin.get('/ads?range=yesterday')).text;
  assert.match(page, /Facebook &amp; Instagram: không lấy được số liệu mới — Token hết hạn/);
  assert.doesNotMatch(page, /Đã cập nhật số liệu mới nhất/);
  assert.match(page, /Tin nhắn bình hoa/);
});

test('khoảng ngày theo lựa chọn, giá trị lạ về 7 ngày', () => {
  assert.deepEqual(resolveRange('today', '2026-11-11'), { key: 'today', from: '2026-11-11', to: '2026-11-11' });
  assert.deepEqual(resolveRange('yesterday', '2026-11-01'), { key: 'yesterday', from: '2026-10-31', to: '2026-10-31' });
  assert.deepEqual(resolveRange('month', '2026-11-11'), { key: 'month', from: '2026-11-01', to: '2026-11-11' });
  assert.deepEqual(resolveRange('<script>', '2026-11-11'), { key: '7d', from: '2026-11-05', to: '2026-11-11' });
});

test('Facebook: kết quả = tin nhắn + khách tiềm năng + mua', () => {
  const row = normalizeMetaRow({ spend: '100', actions: [{ action_type: 'lead', value: '2' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' }] });
  assert.equal(row.results, 5);
  assert.equal(row.spend, 100);
});
