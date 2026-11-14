// Chấm công ở trang Tháng › Bảng công (/calendar?view=cong): mỗi nhân viên một tab, lưới cả tháng.
// Dữ liệu lương mã hoá trên trình duyệt nên server không đọc được: trang này mở app lương trong một khung ẩn
// (/luong/app/?embed=1&bridge=1). Khung đó tự đăng nhập (Quản lý = chủ cửa hàng qua tài khoản lịch; nhân viên =
// "Ghi nhớ đăng nhập"), rồi đọc/ghi CÙNG bản ghi chấm công với bảng lương, theo cùng quy tắc (bridgeDaySet trong app.html).
// Không có nơi nhập chấm công thứ hai: trang Lương chỉ hiện tổng công/giờ và nút "Xem công" dẫn về đây.
//
// HTML: <section data-att-root data-selected="YYYY-MM-DD" data-today="YYYY-MM-DD" data-month="YYYY-MM" data-focus="id nhân viên">
//   Tab từng người + lưới cả tháng (hình chấm công như app lương cũ); bấm ô mở popover (máy tính) / bottom sheet
//   (điện thoại) để chấm công hoặc nhập giờ.
(() => {
  const root = document.querySelector('[data-att-root]');
  if (!root) return;
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const localToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const today = root.dataset.today || localToday;
  const selected = root.dataset.selected || today;
  const months = [root.dataset.month];
  const focusId = root.dataset.focus || '';

  const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const WEEKDAY_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  // Tên trạng thái theo công trong ô (ngắn) và trong lựa chọn (đầy đủ). Quy đổi công giữ nguyên như bảng lương.
  const MONTH_OPTS = [
    ['work', 'Đủ công', '1 công'],
    ['half', 'Nửa ngày', '0,5 công'],
    ['paid', 'Nghỉ phép có lương', '1 công'],
    ['off', 'Nghỉ không lương', '0 công'],
  ];
  const CELL_TEXT = { work: 'Đủ công', half: 'Nửa ngày', paid: 'Phép', off: 'Nghỉ KL' };

  const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const dayName = (iso) => `${WEEKDAY_LONG[dow(iso)]}, ${ddmm(iso)}`;
  const toMin = (t) => (/^\d{2}:\d{2}$/.test(t || '') ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);
  const nowHM = () => {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  /** 7,5 → "7 giờ 30 phút"; short: "7g30" */
  const fmtH = (h, short) => {
    const m = Math.round((+h || 0) * 60);
    const H = Math.floor(m / 60);
    const M = m % 60;
    if (short) return M ? `${H}g${pad(M)}` : `${H}g`;
    return `${H} giờ${M ? ` ${M} phút` : ''}`;
  };
  const money = (n) => `${Math.round(+n || 0).toLocaleString('vi-VN')} đ`;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const button = (cls, text, onClick) => {
    const b = el('button', cls, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };

  // ---------- cầu nối tới app lương ----------
  const frame = document.createElement('iframe');
  frame.src = '/luong/app/?embed=1&bridge=1';
  frame.title = 'Chấm công (ẩn)';
  frame.hidden = true;
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  document.body.appendChild(frame);

  let state = null;
  let loadError = '';
  const pending = new Map();
  let seq = 0;
  const post = (msg) => frame.contentWindow?.postMessage({ gvg: 'att', months, ...msg }, location.origin);
  /** Gửi một yêu cầu ghi và chờ đúng câu trả lời của nó (state mới hoặc lỗi). */
  function request(msg) {
    const rid = `r${Date.now().toString(36)}${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(rid);
        reject(new Error('Không nhận được phản hồi. Kiểm tra mạng rồi bấm Lưu lại.'));
      }, 25000);
      pending.set(rid, { resolve, reject, timer });
      post({ ...msg, rid });
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data || {};
    if (m.gvg !== 'att') return;
    const waiter = m.rid ? pending.get(m.rid) : null;
    if (m.op === 'ready') {
      if (m.signedIn) post({ op: 'get' });
      else {
        state = { signedIn: false };
        paint();
      }
    } else if (m.op === 'state') {
      state = m;
      loadError = '';
      if (waiter) {
        clearTimeout(waiter.timer);
        pending.delete(m.rid);
        waiter.resolve(m);
      }
      paint();
    } else if (m.op === 'error') {
      if (waiter) {
        clearTimeout(waiter.timer);
        pending.delete(m.rid);
        waiter.reject(new Error(m.msg || 'Lỗi'));
      } else {
        loadError = m.msg || 'Không tải được chấm công';
        paint();
      }
    }
  });

  // ---------- dữ liệu ----------
  const people = () => (state?.staff || []).filter((p) => p.kind === 'month' || p.kind === 'hour');
  const recOf = (id, date) => state?.detail?.[id]?.[date] || null;
  const lockedOf = (id, date) => !!state?.lockedBy?.[date.slice(0, 7)]?.[id];
  const isOwner = () => state?.role === 'owner';
  /** Chủ sửa được cả kỳ đã chốt (như bảng lương); nhân viên thì không. Ngày tương lai không chấm. */
  const canEdit = (p, date) => date <= today && (isOwner() || !lockedOf(p.id, date));
  const schedOf = (p, date) => {
    const w = dow(date);
    if (w === 0) return null;
    return w === 6 ? p.sched?.sat : p.sched?.wd;
  };
  const expected = (p, date) => (p.kind === 'month' ? dow(date) !== 0 : !!schedOf(p, date));
  const hoursOf = (rec) => (rec ? (+rec.mainH || 0) + (+rec.liveH || 0) : 0);
  const isMarked = (p, rec) => (p.kind === 'month' ? !!rec?.st : hoursOf(rec) > 0 || !!rec?.pg);

  /** Nội dung một ô: lớp màu + chữ (không chỉ dùng màu) + mô tả đầy đủ cho trình đọc màn hình. */
  function cellInfo(p, date) {
    const rec = recOf(p.id, date);
    const future = date > today;
    if (p.kind === 'month') {
      if (rec?.st) return { cls: `c-${rec.st}`, text: CELL_TEXT[rec.st] || rec.st, label: MONTH_OPTS.find((o) => o[0] === rec.st)?.[1] || rec.st };
      if (future) return { cls: 'c-future', text: '—', label: 'Chưa tới ngày' };
      if (dow(date) === 0) return { cls: 'c-rest', text: 'Nghỉ', label: 'Nghỉ theo lịch (Chủ nhật), bấm nếu có đi làm' };
      return { cls: 'c-none', text: 'Chưa chấm', label: 'Chưa chấm công' };
    }
    const H = hoursOf(rec);
    if (rec?.bad) return { cls: 'c-warn', text: 'Giờ sai', label: 'Có ca giờ ra trước giờ vào' };
    if (rec?.open && date === today) {
      const open = (rec.seg || []).find((s) => s.in && !s.out);
      return { cls: 'c-open', text: `Từ ${open?.in || '?'}`, label: `Đang làm từ ${open?.in || '?'}, chưa ghi giờ ra` };
    }
    if (rec?.open) return { cls: 'c-warn', text: 'Thiếu giờ ra', label: 'Có ca chưa ghi giờ ra' };
    if (H > 0 && rec?.auto) return { cls: 'c-open', text: `${fmtH(H, true)}*`, label: `${fmtH(H)} — có giờ ra tự điền theo ca chuẩn, cần xác nhận` };
    if (H > 0) return { cls: 'c-work', text: fmtH(H, true) + (rec.pg ? ' +page' : ''), label: `Đã ghi ${fmtH(H)}${rec.pg ? ', có trực page' : ''}` };
    if (rec?.pg) return { cls: 'c-work', text: 'Trực page', label: 'Trực page ngày nghỉ' };
    if (future) return { cls: 'c-future', text: '—', label: 'Chưa tới ngày' };
    if (!schedOf(p, date)) return { cls: 'c-rest', text: 'Nghỉ', label: 'Nghỉ theo lịch, bấm nếu có làm' };
    return { cls: 'c-none', text: 'Chưa ghi giờ', label: 'Chưa ghi giờ làm' };
  }

  const busyCells = new Set(); // "id|date" đang lưu

  function headBar(card, text, extra = []) {
    const head = el('div', 'att-head');
    const title = el('div', 'min-w-0 flex-1');
    title.append(el('h2', 'text-sm font-semibold text-ink', 'Bảng công tháng'));
    if (text) title.append(el('p', 'text-xs text-ink-soft', text));
    head.append(title, ...extra);
    card.append(head);
    return head;
  }

  // ---------- popover / bottom sheet ----------
  let pop = null; // { box, backdrop, cell, key, onScroll }
  const drafts = new Map(); // "id|date" → dữ liệu đang nhập dở (giữ lại khi đóng hoặc lưu lỗi)

  function closeEditor(keepFocus = true) {
    if (!pop) return;
    const { box, backdrop, key, onScroll } = pop;
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    box.remove();
    backdrop.remove();
    pop = null;
    if (keepFocus) document.querySelector(`[data-cell="${CSS.escape(key)}"]`)?.focus();
  }

  function place(box, cell) {
    if (window.matchMedia('(max-width: 639px)').matches) return; // bottom sheet (CSS)
    const r = cell.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.maxHeight = `${window.innerHeight - 16}px`;
  }

  function openEditor(p, date, cell) {
    closeEditor(false);
    const key = `${p.id}|${date}`;
    const backdrop = el('div', 'att-pop-backdrop');
    const box = el('div', 'att-pop');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'att-pop-title');
    const onScroll = () => pop && place(box, cell);
    pop = { box, backdrop, cell, key, onScroll };
    backdrop.addEventListener('click', () => closeEditor());
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeEditor();
      }
    });

    const locked = lockedOf(p.id, date);
    const editable = canEdit(p, date);
    const head = el('div', 'mb-3 flex items-start gap-2');
    const ht = el('div', 'min-w-0 flex-1');
    const h = el('h3', 'text-base font-semibold text-ink', p.name);
    h.id = 'att-pop-title';
    ht.append(h, el('p', 'text-xs text-ink-soft', `${dayName(date)}${date === today ? ' · hôm nay' : ''} · ${p.kind === 'month' ? 'tính theo công' : 'tính theo giờ'}`));
    head.append(ht);
    if (locked) head.append(el('span', 'badge-yellow shrink-0', isOwner() ? '🔒 Kỳ đã chốt (chủ vẫn sửa được)' : '🔒 Kỳ đã chốt'));
    head.append(button('btn-ghost btn-sm shrink-0', '✕', () => closeEditor()));
    head.lastChild.setAttribute('aria-label', 'Đóng');
    box.append(head);

    const status = el('p', 'mt-3 min-h-5 text-sm', '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    if (p.kind === 'month') monthForm(box, p, date, editable, status);
    else hourForm(box, p, date, editable, status);
    box.append(status);

    document.body.append(backdrop, box);
    place(box, cell);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    (box.querySelector('[aria-pressed="true"]') || box.querySelector('input,button.att-opt,button.btn-primary') || box.querySelector('button'))?.focus();
  }

  /** Lưu một ngày qua cầu nối; trạng thái đang lưu / lỗi hiện ngay trong popover, thành công thì có Hoàn tác. */
  async function saveDay(p, date, rec, { status, buttons = [], describe }) {
    const key = `${p.id}|${date}`;
    const prev = recOf(p.id, date);
    status.className = 'mt-3 min-h-5 text-sm text-ink-soft';
    status.textContent = 'Đang lưu…';
    buttons.forEach((b) => (b.disabled = true));
    busyCells.add(key);
    paintCellsOnly();
    try {
      await request({ op: 'day', date, id: isOwner() ? p.id : undefined, rec });
      drafts.delete(key);
      busyCells.delete(key);
      closeEditor();
      paint();
      const undoRec = p.kind === 'month'
        ? { st: prev?.st || '', lunch: !!prev?.lunch, note: prev?.note || '' }
        : { seg: (prev?.seg || []).map(({ t, in: i, out, src }) => ({ t, in: i, out, src })), pg: !!prev?.pg, note: prev?.note || '' };
      showToast(`Đã lưu · ${p.name} · ${ddmm(date)}: ${describe}`, async () => {
        try {
          await request({ op: 'day', date, id: isOwner() ? p.id : undefined, rec: undoRec });
          showToast(`Đã hoàn tác · ${p.name} · ${ddmm(date)}`);
        } catch (err) {
          showToast(`Không hoàn tác được: ${err.message}`, null, true);
        }
      });
    } catch (err) {
      busyCells.delete(key);
      paintCellsOnly();
      status.className = 'mt-3 min-h-5 text-sm font-medium text-bad-300';
      status.textContent = `Chưa lưu được: ${err.message}. Dữ liệu vừa nhập vẫn giữ nguyên, bấm lại để thử.`;
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  function monthForm(box, p, date, editable, status) {
    const rec = recOf(p.id, date) || {};
    const key = `${p.id}|${date}`;
    const draft = drafts.get(key) || {};
    const w = dow(date);
    box.append(el('p', 'mb-2 text-xs text-ink-faint', 'Đủ công / nghỉ phép có lương = 1 công · nửa ngày = 0,5 công · chọn là lưu ngay'));
    const opts = el('div', 'grid gap-1.5');
    opts.setAttribute('role', 'group');
    opts.setAttribute('aria-label', 'Trạng thái công');
    const lunchBox = el('input', 'h-4 w-4 accent-pine-500');
    lunchBox.type = 'checkbox';
    lunchBox.checked = draft.lunch ?? !!rec.lunch;
    const noteIn = el('input', 'input mt-1');
    noteIn.type = 'text';
    noteIn.maxLength = 300;
    noteIn.value = draft.note ?? rec.note ?? '';
    const keepDraft = () => drafts.set(key, { lunch: lunchBox.checked, note: noteIn.value });
    lunchBox.addEventListener('change', keepDraft);
    noteIn.addEventListener('input', keepDraft);
    const all = [];
    const choose = (st, label) => saveDay(p, date, { st, lunch: lunchBox.checked, note: noteIn.value }, { status, buttons: all, describe: label });
    for (const [st, label, cong] of [...MONTH_OPTS, ['', 'Chưa chấm (xoá ghi nhận)', '']]) {
      if (st === '' && !rec.st) continue;
      const b = button('att-opt', null, () => choose(st, st ? label : 'đã xoá ghi nhận'));
      b.setAttribute('aria-pressed', String((rec.st || '') === st && !!st));
      b.append(el('span', 'flex-1', label));
      if (cong) b.append(el('span', 'text-xs text-ink-faint', cong));
      b.disabled = !editable;
      all.push(b);
      opts.append(b);
    }
    box.append(opts);

    // Phần mở rộng: ăn trưa (nếu áp dụng) + ghi chú / lý do chấm bù
    const more = el('details', 'mt-3 rounded-lg border border-line px-3 py-2');
    if (rec.note || rec.lunch || draft.note) more.open = true;
    more.append(el('summary', 'cursor-pointer text-sm font-medium text-ink-soft', p.lunch && w >= 1 && w <= 5 ? 'Ghi chú, ăn trưa' : 'Ghi chú'));
    const inner = el('div', 'mt-2 space-y-2');
    if (p.lunch && w >= 1 && w <= 5) {
      const lab = el('label', 'flex items-start gap-2 text-sm text-ink');
      lab.append(lunchBox, el('span', '', `Xưởng không phát cơm, tự túc ăn trưa${p.lunchRate ? ` (+${money(p.lunchRate)})` : ''}`));
      inner.append(lab);
    }
    const nl = el('label', 'block text-xs font-medium text-ink-soft', date < today && !isOwner() ? 'Ghi chú / lý do chấm bù' : 'Ghi chú');
    nl.append(noteIn);
    inner.append(nl);
    if (rec.st) {
      const saveNote = button('btn-secondary btn-sm', 'Lưu ghi chú', () => choose(rec.st, 'cập nhật ghi chú'));
      saveNote.disabled = !editable;
      all.push(saveNote);
      inner.append(saveNote);
    } else inner.append(el('p', 'hint', 'Chọn trạng thái ở trên để lưu kèm ghi chú.'));
    noteIn.disabled = lunchBox.disabled = !editable;
    more.append(inner);
    box.append(more);
    if (rec.late) box.append(el('p', 'mt-2 hint', 'Ngày này được chấm bù.'));
  }

  function hourForm(box, p, date, editable, status) {
    const rec = recOf(p.id, date) || {};
    const key = `${p.id}|${date}`;
    const draft = drafts.get(key);
    const w = dow(date);
    const sc = schedOf(p, date);
    const isToday = date === today;
    const segs = draft?.seg || (rec.seg || []).map((s) => ({ ...s }));
    const mains = segs.filter((s) => s.t === 'main');
    const lives = segs.filter((s) => s.t !== 'main');
    if (!mains.length) mains.push({ t: 'main', in: '', out: '', src: '' }); // nhập ca đầu tiên ngay, không cần "Thêm ca"

    box.append(el('p', 'mb-2 text-xs text-ink-faint', sc ? `Lịch chuẩn ${sc[0]}–${sc[1]} (chỉ là dự kiến, không tự tính công)` : 'Ngày nghỉ theo lịch — có làm thì nhập giờ thực tế.'));

    const form = el('form', 'space-y-2');
    form.noValidate = true;
    const mainBox = el('div', 'space-y-2');
    const liveBox = el('div', 'space-y-2');
    const total = el('p', 'text-sm font-medium text-ink');
    total.setAttribute('aria-live', 'polite');
    const pgBox = el('input', 'h-4 w-4 accent-pine-500');
    pgBox.type = 'checkbox';
    pgBox.checked = draft ? !!draft.pg : !!rec.pg;
    const noteIn = el('input', 'input mt-1');
    noteIn.type = 'text';
    noteIn.maxLength = 300;
    noteIn.value = draft ? draft.note : rec.note || '';

    const LIVE = { liveD: 'Live trưa', liveN: 'Live tối' };
    function row(seg, i) {
      const r = el('div', 'flex flex-wrap items-end gap-2');
      r.dataset.t = seg.t;
      r.dataset.src = seg.src || '';
      const lab = el('span', 'w-16 pb-2 text-xs font-medium text-ink-soft', seg.t === 'main' ? `Ca ${i + 1}` : LIVE[seg.t]);
      const mk = (val, aria, ph) => {
        const wrapL = el('label', 'text-[11px] text-ink-faint');
        wrapL.append(document.createTextNode(aria));
        const t = el('input', 'att-time mt-0.5 block');
        t.type = 'time';
        t.value = val || '';
        t.setAttribute('aria-label', `${seg.t === 'main' ? `Ca ${i + 1}` : LIVE[seg.t]}: ${aria}`);
        if (ph) t.title = `Dự kiến ${ph}`;
        t.disabled = !editable;
        t.addEventListener('input', () => {
          r.dataset.src = 'manual';
          delete r.dataset.suggested;
          sug.hidden = !r.dataset.suggested;
          sync();
        });
        wrapL.append(t);
        return [wrapL, t];
      };
      const sched = seg.t === 'main' ? sc : p.sched?.[seg.t];
      const [l1, tin] = mk(seg.in, 'Giờ vào', sched?.[0]);
      const [l2, tout] = mk(seg.out, 'Giờ ra', sched?.[1]);
      r.append(lab, l1, l2);
      if (editable && (seg.t !== 'main' || i > 0)) {
        const rm = button('btn-ghost btn-sm mb-0.5', '✕', () => {
          r.remove();
          renumber();
          sync();
        });
        rm.setAttribute('aria-label', 'Xoá ca này');
        r.append(rm);
      }
      const sug = el('span', 'w-full pl-18 text-[11px] font-medium text-sun-300', 'Giờ dự kiến — bấm Lưu để xác nhận');
      sug.hidden = !seg.suggested;
      if (seg.suggested) r.dataset.suggested = '1';
      r.append(sug);
      r._in = tin;
      r._out = tout;
      return r;
    }
    const renumber = () => [...mainBox.children].forEach((r, i) => (r.firstChild.textContent = `Ca ${i + 1}`));
    const rows = () => [...mainBox.children, ...liveBox.children];
    const collect = () =>
      rows().map((r) => ({ t: r.dataset.t, in: r._in.value, out: r._out.value, src: r.dataset.src === 'punch' ? 'punch' : 'manual' })) // bấm Lưu = xác nhận, bỏ cờ giờ tự điền.filter((s) => s.in || s.out);
    function sync() {
      let mh = 0;
      let lh = 0;
      for (const s of collect()) {
        const a = toMin(s.in);
        const b = toMin(s.out);
        if (a == null || b == null || b <= a) continue;
        if (s.t === 'main') mh += (b - a) / 60;
        else lh += (b - a) / 60;
      }
      total.textContent = `Tổng: ${fmtH(mh)} làm${p.live ? ` · ${fmtH(lh)} live` : ''}`;
      drafts.set(key, { seg: rows().map((r) => ({ t: r.dataset.t, in: r._in.value, out: r._out.value, src: r.dataset.src, suggested: !!r.dataset.suggested })), pg: pgBox.checked, note: noteIn.value });
    }
    mains.forEach((s, i) => mainBox.append(row(s, i)));
    lives.forEach((s) => liveBox.append(row(s, 0)));
    form.append(mainBox);

    // Lối tắt: điền giờ dự kiến (cần bấm Lưu), hoặc giờ hiện tại khi chấm trong ngày
    const quick = el('div', 'flex flex-wrap gap-1.5');
    if (editable && sc && !mains.some((s) => s.in || s.out)) {
      quick.append(button('btn-ghost btn-sm', `Điền giờ dự kiến ${sc[0]}–${sc[1]}`, () => {
        const r = mainBox.firstChild;
        r._in.value = sc[0];
        r._out.value = sc[1];
        r.dataset.src = 'manual'; // bấm Lưu = xác nhận giờ thực tế (không còn là giờ tự điền)
        r.dataset.suggested = '1';
        r.lastChild.hidden = false;
        quick.firstChild.remove();
        sync();
      }));
    }
    if (editable && isToday) {
      quick.append(button('btn-ghost btn-sm', 'Vào: bây giờ', () => {
        const r = rows().find((x) => x.dataset.t === 'main' && !x._in.value) || mainBox.lastChild;
        r._in.value = nowHM();
        r.dataset.src = 'punch';
        sync();
      }));
      quick.append(button('btn-ghost btn-sm', 'Ra: bây giờ', () => {
        const r = rows().find((x) => x.dataset.t === 'main' && x._in.value && !x._out.value) || mainBox.lastChild;
        r._out.value = nowHM();
        sync();
      }));
    }
    if (quick.childNodes.length) form.append(quick);
    form.append(total);

    // Phần mở rộng: thêm ca, live, trực page ngày nghỉ, ghi chú — chỉ những gì hồ sơ người này có
    const more = el('details', 'rounded-lg border border-line px-3 py-2');
    if (lives.length || rec.pg || rec.note || mains.length > 1) more.open = true;
    const moreLabel = ['Thêm ca', p.live && 'live', p.pg && w !== 0 && 'trực page', 'ghi chú'].filter(Boolean).join(', ');
    more.append(el('summary', 'cursor-pointer text-sm font-medium text-ink-soft', moreLabel.charAt(0).toUpperCase() + moreLabel.slice(1)));
    const inner = el('div', 'mt-2 space-y-2');
    if (editable) {
      const adds = el('div', 'flex flex-wrap gap-1.5');
      adds.append(button('btn-secondary btn-sm', '+ Thêm ca', () => {
        mainBox.append(row({ t: 'main', in: '', out: '' }, mainBox.children.length));
        mainBox.lastChild._in.focus();
        sync();
      }));
      if (p.live) {
        for (const t of ['liveD', 'liveN']) {
          const s = p.sched?.[t];
          adds.append(button('btn-secondary btn-sm', `+ ${LIVE[t]}${s ? ` ${s[0]}–${s[1]}` : ''}`, () => {
            liveBox.append(row({ t, in: s?.[0] || '', out: s?.[1] || '', src: 'manual', suggested: !!s }, 0));
            liveBox.lastChild._in.focus();
            sync();
          }));
        }
      }
      inner.append(adds);
    }
    inner.append(liveBox);
    if (p.pg && w !== 0) {
      const lab = el('label', 'flex items-start gap-2 text-sm text-ink');
      pgBox.disabled = !editable;
      pgBox.addEventListener('change', sync);
      lab.append(pgBox, el('span', '', 'Trực page ngày nghỉ'));
      inner.append(lab);
    }
    const nl = el('label', 'block text-xs font-medium text-ink-soft', 'Ghi chú / lý do chấm bù');
    noteIn.disabled = !editable;
    noteIn.addEventListener('input', sync);
    nl.append(noteIn);
    inner.append(nl);
    more.append(inner);
    form.append(more);

    const actions = el('div', 'flex items-center justify-end gap-2 pt-1');
    actions.append(button('btn-ghost btn-sm', 'Huỷ', () => {
      drafts.delete(key);
      closeEditor();
    }));
    const save = el('button', 'btn-primary btn-sm', 'Lưu');
    save.type = 'submit';
    save.disabled = !editable;
    actions.append(save);
    form.append(actions);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const seg = collect();
      // Kiểm tra trước cho nhanh (app lương kiểm tra lại đúng quy tắc khi ghi)
      for (const s of seg) {
        if (!s.in) return fail(`${s.t === 'main' ? 'Ca làm' : LIVE[s.t]}: điền giờ vào`);
        if (s.out && toMin(s.out) <= toMin(s.in)) return fail(`Giờ ra phải sau giờ vào (${s.in}–${s.out})`);
      }
      const ms = seg.filter((s) => s.t === 'main').sort((a, b) => toMin(a.in) - toMin(b.in));
      for (let k = 1; k < ms.length; k++) if (!ms[k - 1].out || toMin(ms[k - 1].out) > toMin(ms[k].in)) return fail(`Ca ${ms[k - 1].in} và ca ${ms[k].in} bị chồng giờ`);
      const mh = ms.reduce((a, s) => a + (s.out ? (toMin(s.out) - toMin(s.in)) / 60 : 0), 0);
      const describe = seg.length ? `${fmtH(mh)} làm${ms.some((s) => !s.out) ? ' (còn ca chưa có giờ ra)' : ''}` : 'đã xoá giờ';
      saveDay(p, date, { seg, pg: pgBox.checked, note: noteIn.value }, { status, buttons: [save], describe });
    });
    const fail = (msg) => {
      status.className = 'mt-3 min-h-5 text-sm font-medium text-bad-300';
      status.textContent = msg;
    };
    box.append(form);
    sync();
    if (!draft) drafts.delete(key); // chỉ giữ nháp khi người dùng đã sửa
    if (draft) {
      status.className = 'mt-3 min-h-5 text-sm text-sun-300';
      status.textContent = 'Đang hiện dữ liệu nhập dở chưa lưu.';
    }
  }

  // ---------- thông báo nhỏ (Đã lưu · Hoàn tác) ----------
  let toastEl = null;
  let toastTimer = null;
  function showToast(text, onUndo, isError) {
    toastEl?.remove();
    clearTimeout(toastTimer);
    toastEl = el('div', 'att-toast');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.append(el('span', isError ? 'text-bad-300' : '', text));
    if (onUndo) {
      const u = button('btn-ghost btn-sm', 'Hoàn tác', () => {
        toastEl?.remove();
        onUndo();
      });
      toastEl.append(u);
    }
    document.body.append(toastEl);
    toastTimer = setTimeout(() => toastEl?.remove(), onUndo ? 8000 : 4000);
  }

  // ---------- bảng công tháng (trang Tháng › Bảng công): mỗi người một tab, lưới cả tháng ----------
  // Cùng hình như lịch chấm công cũ của app lương: mỗi ngày một hình (ngày % 8), màu theo trạng thái
  // (Đủ công = màu riêng của người đó). Luôn kèm chữ trong ô để không chỉ dựa vào màu. Bấm ô = cùng popover như bảng tuần.
  let monthStaff = '';
  try {
    monthStaff = focusId || localStorage.getItem('att-month-staff') || '';
  } catch {}
  const statusColor = (st) => state?.legend?.statuses?.find((s) => s.st === st)?.color;
  function monthGridDates(ym) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const start = new Date(first);
    start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // về Thứ Hai
    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      if (i % 7 === 0 && i >= 28 && iso.slice(0, 7) !== ym) break; // hàng mới bắt đầu bằng tháng sau → dừng (hàng cuối luôn đủ 7 ô)
      out.push(iso);
    }
    return out;
  }
  function paintMonth() {
    const ym = root.dataset.month;
    root.hidden = false;
    root.replaceChildren();
    root.className = 'att-card';
    if (!state) {
      headBar(root, loadError || 'Đang tải chấm công…');
      const ph = el('div', 'att-scroll');
      ph.style.minHeight = '24rem';
      root.append(ph);
      return;
    }
    if (!state.signedIn) {
      const a = el('a', 'btn-secondary btn-sm', 'Đăng nhập Lương');
      a.href = '/luong';
      headBar(root, 'Cần đăng nhập phần Lương một lần trên máy này (chọn "Ghi nhớ đăng nhập") để chấm công tại đây.', [a]);
      return;
    }
    const list = people();
    if (!list.length) {
      headBar(root, isOwner() ? 'Chưa có nhân viên nào trong phần Lương. Thêm ở Lương › Cài đặt.' : 'Chưa có hồ sơ tính công.');
      return;
    }
    const p = list.find((x) => x.id === monthStaff) || list[0];

    // Tab từng người (chủ thấy cả nhóm, nhân viên chỉ thấy mình)
    const head = el('div', 'att-head');
    const tabs = el('div', 'flex flex-wrap gap-2');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Chọn nhân viên');
    for (const x of list) {
      const t = button(`attm-tab${x.id === p.id ? ' is-on' : ''}`, null, () => {
        monthStaff = x.id;
        try {
          localStorage.setItem('att-month-staff', x.id);
        } catch {}
        paint();
        root.querySelector('.attm-tab.is-on')?.focus();
      });
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(x.id === p.id));
      const dot = el('span', 'h-2.5 w-2.5 shrink-0 rounded-full');
      dot.style.background = x.color;
      t.append(dot, el('span', '', x.name));
      tabs.append(t);
    }
    head.append(tabs);

    const dates = monthGridDates(ym);
    root.append(head);

    // Lưới tháng T2–CN
    const grid = el('div', 'attm-grid');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', `Bảng công tháng của ${p.name}`);
    for (const w of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) grid.append(el('div', `attm-wd${w === 'CN' ? ' is-sun' : ''}`, w));
    for (const d of dates) {
      const out = !d.startsWith(ym);
      const dn = Number(d.slice(8));
      const sun = dow(d) === 0;
      if (out) {
        grid.append(el('div', 'attm-cell is-out', String(dn)));
        continue;
      }
      const rec = recOf(p.id, d);
      const ci = cellInfo(p, d);
      const editable = canEdit(p, d);
      const b = button(`attm-cell${d === today ? ' is-today' : ''}${d === selected ? ' is-selected' : ''}${busyCells.has(`${p.id}|${d}`) ? ' c-busy' : ''}`, null, () => openEditor(p, d, b));
      b.dataset.cell = `${p.id}|${d}`;
      b.disabled = d > today || (!editable && !rec);
      const num = el('span', `attm-num${sun ? ' is-sun' : ''}`, String(dn));
      b.append(num);
      const marked = isMarked(p, rec);
      if (marked) {
        const color = p.kind === 'month' ? (rec.st === 'work' ? p.color : statusColor(rec.st) || p.color) : ci.cls === 'c-work' ? p.color : statusColor('half');
        const sh = el('span', `att-shape sh${dn % 8}`);
        sh.style.background = color;
        sh.setAttribute('aria-hidden', 'true');
        b.append(sh);
      }
      // Ngày đã chấm theo công: chỉ hình (nghĩa màu xem chú thích dưới bảng, trình đọc màn hình đọc aria-label).
      // Theo giờ vẫn ghi số giờ; ngày chưa chấm / nghỉ ghi chữ vì không có hình.
      if (marked ? p.kind !== 'month' : ci.cls !== 'c-future') b.append(el('span', `attm-label ${marked ? '' : ci.cls}`, ci.text));
      if (lockedOf(p.id, d)) b.append(el('span', 'attm-lock', '🔒'));
      b.setAttribute('aria-label', `${dayName(d)}: ${ci.label}${editable ? '' : ' (chỉ xem)'}`);
      b.title = ci.label;
      grid.append(b);
    }
    const wrap = el('div', 'border-t border-line p-2 sm:p-3');
    wrap.append(grid, legendOf(p));
    root.append(wrap);
  }

  /** Chú thích dưới bảng: màu từng trạng thái (Đủ công = màu riêng của người đang xem). */
  function legendOf(p) {
    const box = el('div', 'mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-ink-soft');
    box.setAttribute('aria-label', 'Chú thích bảng công');
    const item = (color, label) => {
      const it = el('span', 'inline-flex items-center gap-1.5');
      const sh = el('span', 'att-shape sh7');
      sh.style.background = color;
      sh.style.width = sh.style.height = '14px';
      it.append(sh, el('span', '', label));
      box.append(it);
    };
    if (p.kind === 'month') {
      item(p.color, 'Đủ công');
      for (const [st, label] of [['half', 'Nửa ngày'], ['paid', 'Nghỉ phép có lương'], ['off', 'Nghỉ không lương']]) item(statusColor(st), label);
    } else {
      item(p.color, 'Có giờ làm (số giờ ghi trong ô)');
      item(statusColor('half'), 'Đang làm / cần kiểm tra giờ');
    }
    box.append(el('span', 'text-ink-faint', 'Hình đổi theo ngày cho dễ phân biệt · 🔒 kỳ lương đã chốt'));
    return box;
  }

  /** Vẽ lại riêng các ô (khi đang lưu) mà không đóng popover. */
  function paintCellsOnly() {
    for (const b of root.querySelectorAll('[data-cell]')) b.classList.toggle('c-busy', busyCells.has(b.dataset.cell));
  }
  function paint() {
    if (pop) return; // đang mở popover: vẽ lại sau khi đóng
    paintMonth();
  }

  paint();
})();
