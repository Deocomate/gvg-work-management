// Chấm công ngay trên lịch tuần (Hôm nay) và lịch tháng.
// Dữ liệu lương mã hoá trên trình duyệt nên không đọc được từ server: trang này mở app lương trong một khung ẩn
// (/luong/app/?embed=1&bridge=1), khung đó tự đăng nhập (tài khoản đã liên kết, hoặc "Ghi nhớ đăng nhập") rồi trả dữ liệu qua postMessage.
// Icon giống lịch chấm công của app lương: mỗi ngày một hình, màu theo trạng thái.
//   Nhân viên: 1 icon của chính mình.  Chủ cửa hàng: mỗi nhân viên 1 icon kèm chữ cái đầu tên (VD N, L, T).
// HTML cần có: <div data-att-root data-mode="today|calendar" data-selected="YYYY-MM-DD"> + các ô <span data-att-day="YYYY-MM-DD">.
(() => {
  const root = document.querySelector('[data-att-root]');
  if (!root) return;
  const cells = [...document.querySelectorAll('[data-att-day]')];
  const months = [...new Set(cells.map((c) => c.dataset.attDay.slice(0, 7)))].sort();
  const mode = root.dataset.mode;
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const selected = root.dataset.selected || today;

  const frame = document.createElement('iframe');
  frame.src = '/luong/app/?embed=1&bridge=1';
  frame.title = 'Chấm công (ẩn)';
  frame.hidden = true;
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  document.body.appendChild(frame);

  const send = (msg) => frame.contentWindow?.postMessage({ gvg: 'att', months, ...msg }, location.origin);
  let state = null;
  let busy = false;
  let error = '';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /** Hình chấm công (sh = 0..7, 7 = tròn), có thể kèm chữ ở giữa. */
  function icon(sh, color, letter, title) {
    const shape = el('span', `att-shape sh${sh}`);
    shape.style.background = color;
    if (!letter) {
      if (title) shape.title = title;
      return shape;
    }
    const wrap = el('span', 'att-icon');
    wrap.title = title || '';
    wrap.append(shape, el('b', '', letter));
    return wrap;
  }

  function paintCells() {
    for (const cell of cells) {
      const info = state?.signedIn ? state.days?.[cell.dataset.attDay] : null;
      cell.replaceChildren();
      cell.hidden = !info;
      if (!info) continue;
      if (state.role === 'owner') {
        cell.classList.add('flex-wrap', 'gap-0.5');
        for (const p of info.people) cell.append(icon(info.sh, p.color, p.letter, `${p.name}: ${p.label}`));
      } else {
        cell.classList.add('items-center', 'gap-1');
        cell.append(icon(info.sh, info.color, null, `Chấm công: ${info.label}`));
        if (state.kind !== 'month') cell.append(el('span', 'text-[10px] font-medium text-ink-soft', info.label));
      }
    }
  }

  /** Chú thích: màu từng trạng thái (+ chữ cái của từng nhân viên với chủ). */
  function legend() {
    const box = el('div', 'flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint');
    for (const p of state.legend?.people || []) {
      const item = el('span', 'inline-flex items-center gap-1');
      item.append(icon(7, p.color, p.letter), el('span', '', p.name));
      box.append(item);
    }
    for (const s of state.legend?.statuses || []) {
      if (!s.color) continue; // Đi làm của chủ: màu riêng từng người (đã có ở trên)
      const item = el('span', 'inline-flex items-center gap-1');
      const shape = icon(7, s.color);
      shape.style.width = shape.style.height = '12px';
      item.append(shape, el('span', '', s.label));
      box.append(item);
    }
    return box;
  }

  function paintRoot() {
    root.replaceChildren();
    root.hidden = false;
    const box = el('div', 'card card-body flex flex-wrap items-center gap-3');

    if (!state) {
      box.append(el('span', 'text-sm text-ink-faint', 'Đang tải chấm công…'));
    } else if (!state.signedIn) {
      box.append(el('span', 'text-sm text-ink-soft', 'Chấm công: chưa đăng nhập phần Lương trên máy này.'));
      const a = el('a', 'btn-secondary btn-sm', 'Đăng nhập Lương');
      a.href = '/luong';
      box.append(a, el('span', 'hint', 'Hoặc nhờ quản lý liên kết tài khoản lương ở trang Nhân viên để vào thẳng.'));
    } else if (state.role === 'owner' || mode === 'calendar') {
      const who = state.role === 'owner' ? 'cả nhóm' : state.name;
      box.append(el('span', 'text-sm text-ink-soft', `Chấm công trên lịch: ${who}.`));
      const a = el('a', 'btn-ghost btn-sm', 'Mở trang Lương →');
      a.href = '/luong';
      box.append(a, legend());
    } else {
      // Nhân viên, trang Hôm nay: chấm cho ngày đang chọn
      const future = selected > today;
      const locked = state.locked?.[selected.slice(0, 7)];
      const cur = state.days?.[selected];
      const [y, m, d] = selected.split('-');
      const title = el('div', 'min-w-40');
      title.append(
        el('p', 'text-xs font-semibold uppercase tracking-wide text-ink-faint', selected === today ? 'Chấm công hôm nay' : `Chấm công ${d}/${m}/${y}`),
        el('p', 'text-sm font-medium text-ink', state.name),
      );
      box.append(title);
      if (state.kind !== 'month') {
        box.append(el('span', 'text-sm text-ink-soft', cur ? `Đã ghi: ${cur.label}` : 'Chưa ghi giờ.'));
        const a = el('a', 'btn-secondary btn-sm', 'Ghi giờ làm ở trang Lương →');
        a.href = '/luong';
        box.append(a);
      } else if (future) {
        box.append(el('span', 'text-sm text-ink-faint', 'Chưa tới ngày này.'));
      } else {
        const btns = el('div', 'flex flex-wrap gap-2');
        const colors = Object.fromEntries((state.legend?.statuses || []).map((s) => [s.st, s.color]));
        for (const [st, label] of Object.entries(state.statuses || {})) {
          const on = cur?.st === st;
          const b = el('button', `btn-sm inline-flex items-center gap-1.5 ${on ? 'btn-primary' : 'btn-secondary'}`);
          const dot = icon(+d % 8, colors[st]);
          dot.style.width = dot.style.height = '14px';
          b.append(dot, `${on ? '✓ ' : ''}${label}`);
          b.type = 'button';
          b.disabled = busy || locked;
          b.addEventListener('click', () => {
            busy = true;
            error = '';
            paintRoot();
            send({ op: 'set', date: selected, st: on ? '' : st });
          });
          btns.append(b);
        }
        box.append(btns);
        if (locked) box.append(el('span', 'badge-yellow', '🔒 Kỳ lương đã chốt'));
        if (selected < today && !cur) box.append(el('span', 'hint', 'Ngày đã qua: sẽ ghi là chấm bù.'));
      }
    }
    if (error) box.append(el('span', 'text-sm text-bad-300', error));
    root.append(box);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data || {};
    if (m.gvg !== 'att') return;
    if (m.op === 'ready') {
      if (m.signedIn) send({ op: 'get' });
      else {
        state = { signedIn: false };
        paintRoot();
      }
    } else if (m.op === 'state') {
      state = m;
      busy = false;
      paintCells();
      paintRoot();
    } else if (m.op === 'error') {
      busy = false;
      error = m.msg;
      paintRoot();
    }
  });

  paintRoot();
})();
