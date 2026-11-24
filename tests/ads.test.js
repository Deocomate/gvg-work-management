// Trang Quảng cáo: chỉ quản lý xem + lấy số liệu Facebook/TikTok (giả lập fetch, không gọi API thật).
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
const { metaCampaignStatus, splitRange } = await import('../src/modules/ads/ads.providers.js');
const { inflateRawSync } = await import('node:zlib');
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
    if (url.pathname.endsWith('/act_111/campaigns')) {
      return json({ data: [{ id: 'c1', effective_status: 'ACTIVE', start_time: '2026-10-12T10:00:00+0700' }, { id: 'c2', effective_status: 'PAUSED' }] });
    }
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
for (const [name, email, role] of [['Chị Mai', 'mai@test.local', 'admin'], ['Nhân viên', 'staff@test.local', 'member'], ['Bán hàng', 'sale@test.local', 'sale']]) {
  await postForm(admin, '/staff', { name, email, role, password: 'mat-khau-123' }, { from: '/staff/new' });
}
const login = async (email) => {
  const { agent } = await setup();
  await loginAs(agent, { email, password: 'mat-khau-123' });
  return agent;
};
const mai = await login('mai@test.local');
const member = await login('staff@test.local');
const sale = await login('sale@test.local');

test('mọi quản lý xem được; nhân viên, Sale bị chặn và không thấy menu', async () => {
  const { agent: guest } = await setup();
  assert.equal((await guest.get('/ads')).status, 302);
  for (const agent of [member, sale]) {
    assert.equal((await agent.get('/ads')).status, 403);
    assert.doesNotMatch((await agent.get('/today')).text, /href="\/ads"/);
    assert.equal((await postForm(agent, '/ads/refresh', { range: '7d' }, { from: '/today' })).status, 403);
  }

  // Quản lý nào cũng vào được (không chỉ tài khoản admin gốc)
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

// ---- Từ đầu chiến dịch, ngày tự chọn, xuất báo cáo

const metaInsightCalls = () => calls.filter((c) => c.url.hostname === 'graph.facebook.com' && c.url.pathname.endsWith('/insights'));
const tiktokReportCalls = () => calls.filter((c) => c.url.pathname.includes('report/integrated'));

test('Từ đầu chiến dịch: lấy toàn bộ thời gian, hiện ngày bắt đầu và trạng thái chiến dịch', async () => {
  const page = (await admin.get('/ads?range=lifetime')).text;
  assert.ok(metaInsightCalls().length > 0);
  for (const { url } of metaInsightCalls()) {
    assert.equal(url.searchParams.get('date_preset'), 'maximum');
    assert.equal(url.searchParams.get('time_range'), null);
  }
  const ttCampaign = tiktokReportCalls().find((c) => c.url.searchParams.get('data_level') === 'AUCTION_CAMPAIGN');
  assert.equal(ttCampaign.url.searchParams.get('query_lifetime'), 'true');
  assert.equal(ttCampaign.url.searchParams.get('start_date'), null);

  // Ngày đầu có chi tiêu trong dữ liệu giả = 10/11/2026
  assert.match(page, /Từ đầu chiến dịch \(10\/11\/2026\)/);
  assert.match(page, /aria-current="page">Từ đầu chiến dịch/);
  assert.match(page, /class="badge-green[^"]*">Đang chạy/);
  assert.match(page, /Bắt đầu 12\/10\/2026/);
  assert.match(page, /href="\/ads\/export\.xlsx\?range(=|&#x3D;)lifetime"/); // Handlebars mã hoá dấu =
});

test('ngày tự chọn: gửi đúng khoảng lên Facebook, Cập nhật ngay giữ nguyên khoảng', async () => {
  const page = (await admin.get('/ads?range=custom&from=2026-11-01&to=2026-11-10')).text;
  const timeRange = JSON.parse(metaInsightCalls()[0].url.searchParams.get('time_range'));
  assert.deepEqual(timeRange, { since: '2026-11-01', until: '2026-11-10' });
  assert.match(page, /01\/11\/2026 – 10\/11\/2026/);
  assert.match(page, /name="from" value="2026-11-01"/);

  const res = await postForm(admin, '/ads/refresh', { range: 'custom', from: '2026-11-01', to: '2026-11-10' }, { from: '/ads' });
  assert.equal(res.headers.location, '/ads?range=custom&from=2026-11-01&to=2026-11-10');
});

test('khoảng ngày tự chọn: đảo ngược thì đổi chỗ, ngày tương lai cắt về hôm nay, sai thì về 7 ngày', () => {
  const today = '2026-11-24';
  assert.deepEqual(resolveRange('custom', today, { from: '2026-11-10', to: '2026-11-01' }), { key: 'custom', from: '2026-11-01', to: '2026-11-10' });
  assert.deepEqual(resolveRange('custom', today, { from: '2026-11-20', to: '2027-01-01' }), { key: 'custom', from: '2026-11-20', to: today });
  assert.equal(resolveRange('custom', today, { from: '2026-02-30', to: '2026-11-01' }).key, '7d');
  assert.equal(resolveRange('custom', today, {}).key, '7d');
  // Không lùi quá 37 tháng (giới hạn của Facebook)
  assert.ok(resolveRange('custom', today, { from: '2015-01-01', to: '2026-11-01' }).from > '2023-10-01');
  assert.deepEqual(resolveRange('lifetime', today), { key: 'lifetime', from: null, to: today, lifetime: true });
});

test('TikTok: khoảng dài hơn 365 ngày chia nhỏ; trạng thái Facebook đổi đúng', () => {
  assert.deepEqual(splitRange('2025-01-01', '2026-03-01'), [
    { from: '2025-01-01', to: '2025-12-31' },
    { from: '2026-01-01', to: '2026-03-01' },
  ]);
  assert.deepEqual(splitRange('2026-11-01', '2026-11-01'), [{ from: '2026-11-01', to: '2026-11-01' }]);
  assert.equal(metaCampaignStatus('ACTIVE', null), 'active');
  assert.equal(metaCampaignStatus('ACTIVE', '2020-01-01T00:00:00+0700'), 'ended');
  assert.equal(metaCampaignStatus('CAMPAIGN_PAUSED'), 'paused');
  assert.equal(metaCampaignStatus('WITH_ISSUES'), 'issue');
});

/** Đọc các file trong .xlsx (zip) -> { tên: nội dung chữ }. */
function unzip(buf) {
  const files = {};
  for (let at = 0; buf.readUInt32LE(at) === 0x04034b50; ) {
    const size = buf.readUInt32LE(at + 18);
    const nameLen = buf.readUInt16LE(at + 26);
    const extraLen = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 30, at + 30 + nameLen);
    const start = at + 30 + nameLen + extraLen;
    files[name] = inflateRawSync(buf.subarray(start, start + size)).toString('utf8');
    at = start + size;
  }
  return files;
}

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

test('xuất Excel: 3 trang Tổng quan / Theo chiến dịch / Theo ngày, đúng số liệu', async () => {
  const res = await admin.get('/ads/export.xlsx?range=lifetime').buffer(true).parse(binary);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /spreadsheetml\.sheet/);
  assert.match(res.headers['content-disposition'], /attachment; filename="?bao-cao-quang-cao-tu-dau\.xlsx/);

  const files = unzip(res.body);
  assert.match(files['xl/workbook.xml'], /name="Tổng quan".*name="Theo chiến dịch".*name="Theo ngày"/);
  const [summary, campaigns, daily] = [1, 2, 3].map((i) => files[`xl/worksheets/sheet${i}.xml`]);
  assert.match(summary, /Báo cáo kết quả quảng cáo/);
  assert.match(summary, /Từ đầu chiến dịch \(10\/11\/2026\)/);
  assert.match(summary, /Facebook &amp; Instagram/);
  assert.match(campaigns, /Tin nhắn bình hoa/);
  assert.match(campaigns, /Đang chạy/);
  assert.match(campaigns, /12\/10\/2026/);
  assert.match(campaigns, /<v>1000000<\/v>/); // chi tiêu là số thật, Excel cộng trừ được
  assert.match(campaigns, /<v>0\.02<\/v>/); // CTR 2% lưu dạng tỉ lệ, hiển thị %
  assert.match(campaigns, /Video cốc gốm/);
  assert.match(daily, /10\/11\/2026/);
});

test('xuất Excel: nhân viên, Sale không tải được', async () => {
  for (const agent of [member, sale]) assert.equal((await agent.get('/ads/export.xlsx?range=30d')).status, 403);
});
