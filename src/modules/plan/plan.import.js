// Nhập dữ liệu một lần từ Google Sheet "Idea bank - Gốm Vũ Gia, Klayy & GSXD" (tab Plan + Idea bank).
// Dữ liệu đã chép sẵn trong sheet-import.json. Chỉ quản lý; bấm lại không bị trùng (cùng tên + ngày đăng thì bỏ qua).
import { readFile } from 'node:fs/promises';
import { forbidden } from '#lib/errors.js';
import { foldText } from '#lib/text.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import * as repo from './plan.repo.js';
import { syncPlans } from './plan.sync.js';

const SHEET_STATUS = {
  'mới': 'idea',
  'đã chọn': 'selected',
  'đã viết kịch bản': 'scripted',
  'đã lên lịch': 'scheduled',
  'đã quay': 'filmed',
  'đã đăng': 'posted',
  'bỏ': 'dropped',
};
const SHEET_FIELDS = [
  'title', 'description', 'reference_url', 'topic', 'brand', 'video_type', 'script',
  'shoot_date', 'post_date', 'shoot_time', 'location', 'props', 'note',
];
const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Tên trong Sheet (VD "Nhài") -> tài khoản trong app: khớp cả họ tên hoặc tên gọi (chữ cuối), không phân biệt dấu. */
function nameMatcher(staff) {
  const people = staff.map((s) => {
    const full = foldText(s.label);
    return { id: s.value, full, last: full.split(/\s+/).at(-1) };
  });
  return (name) => {
    const n = foldText(name);
    if (!n) return null;
    return (people.find((p) => p.full === n) ?? people.find((p) => p.last === n))?.id ?? null;
  };
}

export async function importFromSheet(user) {
  if (!isManager(user)) throw forbidden('Chỉ quản lý mới nhập được dữ liệu từ Sheet.');
  const sheet = JSON.parse(await readFile(new URL('./sheet-import.json', import.meta.url), 'utf8'));
  const userOf = nameMatcher(await staffOptions());
  const rows = [
    ...sheet.plan.map((r) => ({ ...r, defaultStatus: 'scheduled' })),
    ...sheet.ideas.map((r) => ({ ...r, defaultStatus: 'idea' })),
  ];

  const unknown = new Set();
  const addedIds = [];
  for (const r of rows) {
    const data = Object.fromEntries(SHEET_FIELDS.map((f) => [f, clean(r[f])]));
    if (!data.title || (await repo.exists(data))) continue;
    data.platform = 'tiktok';
    data.status = SHEET_STATUS[clean(r.status)?.toLowerCase()] ?? r.defaultStatus;
    data.owner_id = userOf(r.owner);
    data.proposer_id = userOf(r.proposer);
    data.writer_id = userOf(r.writer);
    // Người chưa có tài khoản trong app: ghi tên vào ghi chú để không mất thông tin.
    const missing = [['Phụ trách', r.owner], ['Người góp', r.proposer], ['Viết kịch bản', r.writer]]
      .filter(([, name]) => clean(name) && !userOf(name))
      .map(([label, name]) => (unknown.add(name.trim()), `${label}: ${name.trim()}`));
    if (missing.length) data.note = [data.note, `(Từ Sheet — ${missing.join(', ')})`].filter(Boolean).join('\n');
    const plan = await repo.create(data, user.id, r.date ? `${r.date} 00:00:00` : null);
    addedIds.push(plan.id);
  }
  await syncPlans(addedIds); // đưa việc quay/đăng lên lịch làm việc của người phụ trách
  return { added: addedIds.length, skipped: rows.length - addedIds.length, unknown: [...unknown] };
}
