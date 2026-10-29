// Ô chọn ngày, giờ và danh sách tự vẽ, thay cho ô mặc định của trình duyệt.
// Phần tử gốc vẫn nằm trong form (chỉ bị ẩn) nên tên & giá trị gửi lên server không đổi;
// trình duyệt tắt JS thì vẫn dùng ô mặc định như cũ.
//   <select>               -> danh sách xổ xuống (trên 7 lựa chọn có ô tìm nhanh, gõ không dấu cũng được)
//   <select multiple>      -> như trên nhưng bấm để chọn/bỏ nhiều mục; data-placeholder là chữ khi chưa chọn gì
//   <input type="date">    -> lịch tháng + nút "Hôm nay" / "Ngày mai". data-min-from="date": không chọn trước ngày ở ô "date"
//   <input type="time">    -> cột giờ + phút (bước 5 phút). data-after="start_time": tự gợi ý giờ kết thúc = bắt đầu + 1 tiếng
(() => {
  const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const ICONS = {
    chevron: '<path d="m6 9 6 6 6-6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    prev: '<path d="m15 6-6 6 6 6"/>',
    next: '<path d="m9 6 6 6-6 6"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
  };
  const icon = (name) =>
    `<svg class="picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => parseISO(toISO(new Date()));
  const formatDay = (d) => `${WEEKDAY_NAMES[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const toMinutes = (t) => {
    const m = /^(\d{2}):(\d{2})$/.exec(t || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const fromMinutes = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
  // Tìm không dấu: "nguyen" khớp "Nguyễn"
  const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();

  const make = (tag, className = '', attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const button = (className, label, attrs = {}) => {
    const node = make('button', className, { type: 'button', ...attrs });
    node.textContent = label;
    return node;
  };

  /* ---------- Khung chung: nút hiển thị giá trị + bảng xổ ra ---------- */
  let current = null; // chỉ mở một bảng một lúc

  function createPicker(original, kind, iconName) {
    const extraClasses = [...original.classList].filter((c) => c !== 'input' && c !== 'input-error');
    const wrap = make('div', ['picker', `picker-${kind}`, ...extraClasses].join(' '));
    const trigger = make('button', 'input picker-trigger', {
      type: 'button',
      'aria-haspopup': kind === 'select' ? 'listbox' : 'dialog',
      'aria-expanded': 'false',
    });
    if (original.classList.contains('input-error')) trigger.classList.add('input-error');
    for (const attr of ['aria-invalid', 'aria-describedby', 'aria-label']) {
      if (original.hasAttribute(attr)) trigger.setAttribute(attr, original.getAttribute(attr));
    }
    // <label for="..."> trỏ vào nút mới để bấm nhãn là mở bảng.
    if (original.id) {
      trigger.id = original.id;
      original.id = `${original.id}-value`;
    }
    const value = make('span', 'picker-value');
    trigger.append(value);
    trigger.insertAdjacentHTML('beforeend', icon(iconName));
    const panel = make('div', `picker-panel picker-panel-${kind}`);

    original.replaceWith(wrap);
    wrap.append(trigger, panel, original);
    original.hidden = true;
    original.tabIndex = -1;

    const picker = {
      wrap,
      trigger,
      value,
      panel,
      onOpen: null, // chuẩn bị nội dung trước khi đo kích thước
      afterOpen: null, // đặt con trỏ/cuộn khi bảng đã hiện
      isOpen: () => wrap.classList.contains('is-open'),
      open() {
        if (current && current !== picker) current.close();
        current = picker;
        picker.onOpen?.();
        // Gần đáy màn hình thì mở lên trên; sát mép phải thì canh phải.
        const rect = trigger.getBoundingClientRect();
        const height = panel.offsetHeight + 12;
        wrap.classList.toggle('picker-up', rect.bottom + height > window.innerHeight && rect.top > height);
        wrap.classList.toggle('picker-end', rect.left + panel.offsetWidth > document.documentElement.clientWidth - 8);
        wrap.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        picker.afterOpen?.();
      },
      close() {
        wrap.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (current === picker) current = null;
      },
      // Báo cho form biết giá trị đã đổi (để data-autosubmit, data-after... hoạt động).
      emit() {
        original.dispatchEvent(new Event('change', { bubbles: true }));
      },
      done() {
        picker.close();
        trigger.focus();
      },
    };

    trigger.addEventListener('click', () => (picker.isOpen() ? picker.close() : picker.open()));
    trigger.addEventListener('keydown', (event) => {
      if (!picker.isOpen() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        picker.open();
      }
    });
    return picker;
  }

  document.addEventListener('pointerdown', (event) => {
    if (current && !current.wrap.contains(event.target)) current.close();
  });
  document.addEventListener('focusin', (event) => {
    if (current && !current.wrap.contains(event.target)) current.close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current) current.done();
  });

  /* ---------- Danh sách ---------- */
  function enhanceSelect(select) {
    const picker = createPicker(select, 'select', 'chevron');
    const { panel, trigger } = picker;
    const multiple = select.multiple;
    // Ô bắt buộc: dòng trống ("— Chọn nhân viên —") chỉ là chữ gợi ý, không phải lựa chọn.
    const placeholder = select.required ? select.querySelector('option[value=""]') : null;
    const options = [...select.options].filter((option) => option !== placeholder);
    const placeholderText = placeholder?.textContent.trim() || select.dataset.placeholder || 'Chọn…';

    let search = null;
    if (options.length > 7) {
      search = make('input', 'picker-search', { type: 'text', placeholder: 'Tìm nhanh…', 'aria-label': 'Tìm trong danh sách', autocomplete: 'off' });
      panel.append(search);
    }
    const list = make('ul', 'picker-list', { role: 'listbox', ...(multiple ? { 'aria-multiselectable': 'true' } : {}) });
    panel.append(list);
    if (multiple) {
      const foot = make('div', 'picker-foot');
      const ok = button('picker-chip picker-chip-end', 'Xong');
      ok.addEventListener('click', () => picker.done());
      foot.append(ok);
      panel.append(foot);
    }

    const items = options.map((option) => {
      const item = make('li', 'picker-option', { role: 'option' });
      item.dataset.value = option.value;
      const text = make('span');
      text.textContent = option.textContent.trim();
      item.append(text);
      item.insertAdjacentHTML('beforeend', icon('check'));
      item.addEventListener('click', () => choose(option.value));
      item.addEventListener('pointermove', () => setActive(visible().indexOf(item), false));
      list.append(item);
      return item;
    });
    const empty = make('li', 'picker-empty');
    empty.textContent = 'Không tìm thấy';
    list.append(empty);

    let active = 0;
    const visible = () => items.filter((item) => !item.hidden);
    function setActive(index, scroll = true) {
      const shown = visible();
      active = Math.max(0, Math.min(index, shown.length - 1));
      items.forEach((item) => item.classList.toggle('is-active', item === shown[active]));
      if (scroll) shown[active]?.scrollIntoView({ block: 'nearest' });
    }
    function filter() {
      const query = normalize(search?.value || '');
      items.forEach((item) => (item.hidden = !normalize(item.textContent).includes(query)));
      empty.hidden = visible().length > 0;
    }
    function render() {
      const chosen = options.filter((option) => option.selected);
      const isEmpty = chosen.length === 0;
      picker.value.textContent = isEmpty ? placeholderText : chosen.map((option) => option.textContent.trim()).join(', ');
      trigger.classList.toggle('is-placeholder', isEmpty);
      items.forEach((item, i) => {
        const on = options[i].selected;
        item.classList.toggle('is-selected', on);
        item.setAttribute('aria-selected', String(on));
      });
    }
    function choose(value) {
      // Chọn nhiều: bấm để bật/tắt mục đó, bảng vẫn mở để chọn tiếp.
      if (multiple) {
        const option = options.find((o) => o.value === value);
        option.selected = !option.selected;
        render();
        picker.emit();
        return;
      }
      const changed = select.value !== value;
      select.value = value;
      render();
      picker.done();
      if (changed) picker.emit();
    }

    picker.onOpen = () => {
      if (search) search.value = '';
      filter();
    };
    picker.afterOpen = () => {
      setActive(Math.max(0, visible().findIndex((item) => item.classList.contains('is-selected'))));
      search?.focus();
    };
    function onKey(event) {
      if (event.defaultPrevented || !picker.isOpen()) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const item = visible()[active];
        if (item) choose(item.dataset.value);
      }
    }
    trigger.addEventListener('keydown', onKey);
    search?.addEventListener('keydown', onKey);
    search?.addEventListener('input', () => {
      filter();
      setActive(0);
    });
    select.addEventListener('change', render);
    render();
  }

  /* ---------- Chọn ngày ---------- */
  function enhanceDate(input) {
    const picker = createPicker(input, 'date', 'calendar');
    input.type = 'hidden';
    const { panel, trigger } = picker;
    const placeholder = input.getAttribute('placeholder') || 'Chọn ngày';
    let view; // ngày 1 của tháng đang xem
    let focus; // ngày đang trỏ bằng bàn phím

    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chọn ngày');
    const head = make('div', 'picker-head');
    const prev = make('button', 'picker-nav', { type: 'button', 'aria-label': 'Tháng trước' });
    prev.innerHTML = icon('prev');
    const next = make('button', 'picker-nav', { type: 'button', 'aria-label': 'Tháng sau' });
    next.innerHTML = icon('next');
    const title = make('span', 'picker-title', { 'aria-live': 'polite' });
    head.append(prev, title, next);
    const weekdays = make('div', 'picker-weekdays', { 'aria-hidden': 'true' });
    for (const label of WEEKDAYS) weekdays.append(Object.assign(make('span'), { textContent: label }));
    const grid = make('div', 'picker-days');
    const foot = make('div', 'picker-foot');
    panel.append(head, weekdays, grid, foot);

    const minDate = () => {
      const from = input.dataset.minFrom && input.form?.elements[input.dataset.minFrom];
      return parseISO(from ? from.value : input.getAttribute('min'));
    };
    const quick = [
      ['Hôm nay', 0],
      ['Ngày mai', 1],
    ].map(([label, offset]) => {
      const chip = button('picker-chip', label);
      chip.addEventListener('click', () => choose(addDays(today(), offset)));
      foot.append(chip);
      return { chip, offset };
    });
    if (!input.required) {
      const clear = button('picker-chip picker-chip-end', 'Bỏ chọn');
      clear.addEventListener('click', () => choose(null));
      foot.append(clear);
    }

    function draw() {
      title.textContent = `Tháng ${view.getMonth() + 1}, ${view.getFullYear()}`;
      const todayISO = toISO(today());
      const min = minDate();
      const start = addDays(view, -((view.getDay() + 6) % 7)); // lùi về Thứ Hai
      const days = [];
      for (let i = 0; i < 42; i++) {
        const day = addDays(start, i);
        const iso = toISO(day);
        const cell = button('picker-day', String(day.getDate()), {
          tabindex: iso === toISO(focus) ? '0' : '-1',
          'aria-label': formatDay(day),
        });
        cell.dataset.date = iso;
        cell.classList.toggle('is-outside', day.getMonth() !== view.getMonth());
        cell.classList.toggle('is-today', iso === todayISO);
        if (iso === input.value) {
          cell.classList.add('is-selected');
          cell.setAttribute('aria-pressed', 'true');
        }
        cell.disabled = Boolean(min && day < min);
        days.push(cell);
      }
      grid.replaceChildren(...days);
      for (const { chip, offset } of quick) chip.disabled = Boolean(min && addDays(today(), offset) < min);
    }
    function moveFocus(day) {
      focus = day;
      if (day.getMonth() !== view.getMonth() || day.getFullYear() !== view.getFullYear()) {
        view = new Date(day.getFullYear(), day.getMonth(), 1);
      }
      draw();
      grid.querySelector(`[data-date="${toISO(day)}"]`)?.focus();
    }
    function render() {
      const day = parseISO(input.value);
      picker.value.textContent = day ? formatDay(day) : placeholder;
      trigger.classList.toggle('is-placeholder', !day);
    }
    function choose(day) {
      const value = day ? toISO(day) : '';
      const changed = value !== input.value;
      input.value = value;
      render();
      picker.done();
      if (changed) picker.emit();
    }

    prev.addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      draw();
    });
    next.addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      draw();
    });
    grid.addEventListener('click', (event) => {
      const cell = event.target.closest('.picker-day');
      if (cell && !cell.disabled) choose(parseISO(cell.dataset.date));
    });
    grid.addEventListener('keydown', (event) => {
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (event.key in steps) moveFocus(addDays(focus, steps[event.key]));
      else if (event.key === 'PageUp' || event.key === 'PageDown') {
        const months = event.key === 'PageUp' ? -1 : 1;
        moveFocus(new Date(focus.getFullYear(), focus.getMonth() + months, Math.min(focus.getDate(), 28)));
      } else return;
      event.preventDefault();
    });

    picker.onOpen = () => {
      focus = parseISO(input.value) || minDate() || today();
      view = new Date(focus.getFullYear(), focus.getMonth(), 1);
      draw();
    };
    picker.afterOpen = () => grid.querySelector('[tabindex="0"]')?.focus();
    input.addEventListener('change', render);
    render();
  }

  /* ---------- Chọn giờ ---------- */
  function enhanceTime(input) {
    const picker = createPicker(input, 'time', 'clock');
    input.type = 'hidden';
    const { panel, trigger } = picker;
    const placeholder = input.getAttribute('placeholder') || '--:--';

    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chọn giờ');
    const head = make('div', 'picker-time-head', { 'aria-hidden': 'true' });
    head.append(Object.assign(make('span'), { textContent: 'Giờ' }), Object.assign(make('span'), { textContent: 'Phút' }));
    const columns = make('div', 'picker-time-cols');
    const hourCol = make('div', 'picker-col', { role: 'group', 'aria-label': 'Giờ' });
    const minuteCol = make('div', 'picker-col', { role: 'group', 'aria-label': 'Phút' });
    for (let h = 0; h < 24; h++) hourCol.append(Object.assign(button('picker-cell', pad(h)), { value: h }));
    for (let m = 0; m < 60; m += 5) minuteCol.append(Object.assign(button('picker-cell', pad(m)), { value: m }));
    columns.append(hourCol, minuteCol);
    const foot = make('div', 'picker-foot');
    if (!input.required) {
      const clear = button('picker-chip', input.dataset.clearLabel || 'Bỏ chọn');
      clear.addEventListener('click', () => set(''));
      foot.append(clear);
    }
    const ok = button('picker-chip picker-chip-end', 'Xong');
    ok.addEventListener('click', () => picker.done());
    foot.append(ok);
    panel.append(head, columns, foot);

    const parts = () => {
      const minutes = toMinutes(input.value);
      return minutes === null ? null : { h: Math.floor(minutes / 60), m: minutes % 60 };
    };
    function set(value, close = true) {
      const changed = value !== input.value;
      input.value = value;
      render();
      if (close) picker.done();
      if (changed) picker.emit();
    }
    function render() {
      picker.value.textContent = input.value || placeholder;
      trigger.classList.toggle('is-placeholder', !input.value);
      const now = parts();
      for (const cell of hourCol.children) cell.classList.toggle('is-selected', now?.h === Number(cell.value));
      for (const cell of minuteCol.children) cell.classList.toggle('is-selected', now?.m === Number(cell.value));
    }
    const centerOn = (col, index) => {
      const cell = col.children[index];
      if (cell) col.scrollTop = cell.offsetTop - col.clientHeight / 2 + cell.offsetHeight / 2;
    };

    // Chọn giờ thì giữ bảng mở để chọn phút; chọn phút là xong.
    hourCol.addEventListener('click', (event) => {
      const cell = event.target.closest('.picker-cell');
      if (cell) set(`${pad(Number(cell.value))}:${pad(parts()?.m ?? 0)}`, false);
    });
    minuteCol.addEventListener('click', (event) => {
      const cell = event.target.closest('.picker-cell');
      if (cell) set(`${pad(parts()?.h ?? 8)}:${pad(Number(cell.value))}`);
    });
    for (const col of [hourCol, minuteCol]) {
      col.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const sibling = event.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling';
        document.activeElement?.[sibling]?.focus();
      });
    }

    picker.onOpen = render;
    picker.afterOpen = () => {
      const now = parts();
      centerOn(hourCol, now ? now.h : 8);
      centerOn(minuteCol, now ? Math.floor(now.m / 5) : 0);
      (hourCol.querySelector('.is-selected') || hourCol.children[8]).focus({ preventScroll: true });
    };
    input.addEventListener('change', render);
    render();
  }

  // Giờ kết thúc đi theo giờ bắt đầu: chưa có, sớm hơn, hoặc vẫn là giờ tự gợi ý thì đặt = bắt đầu + 1 tiếng;
  // người dùng tự chỉnh giờ kết thúc thì thôi không đổi nữa.
  // Xoá giờ bắt đầu (= việc cả ngày) thì xoá luôn giờ kết thúc.
  let syncing = false;
  document.addEventListener('change', (event) => {
    const start = event.target;
    if (!start.name || !start.form) return;
    if (start.dataset.after && !syncing) delete start.dataset.autoFilled;
    for (const end of start.form.querySelectorAll(`[data-after="${CSS.escape(start.name)}"]`)) {
      const from = toMinutes(start.value);
      const to = toMinutes(end.value);
      let value = end.value;
      if (from === null) value = '';
      else if (to === null || to <= from || end.dataset.autoFilled) value = fromMinutes(Math.min(from + 60, 23 * 60 + 59));
      if (value === end.value) continue;
      end.value = value;
      if (value) end.dataset.autoFilled = 'true';
      syncing = true;
      end.dispatchEvent(new Event('change', { bubbles: true }));
      syncing = false;
    }
  });

  // <div data-show-when="repeat!=none"> chỉ hiện khi điều kiện đúng (VD: ô "Đến ngày" khi có lặp lại).
  function applyShowWhen(form) {
    const data = new FormData(form);
    for (const el of form.querySelectorAll('[data-show-when]')) {
      const [, name, op, value] = /^(\w+)(!=|=)(.*)$/.exec(el.dataset.showWhen) || [];
      if (name) el.hidden = (op === '=') !== ((data.get(name) ?? '') === value);
    }
  }
  document.addEventListener('change', (event) => {
    if (event.target.form?.querySelector('[data-show-when]')) applyShowWhen(event.target.form);
  });

  document.querySelectorAll('select').forEach(enhanceSelect);
  document.querySelectorAll('input[type="date"]').forEach(enhanceDate);
  document.querySelectorAll('input[type="time"]').forEach(enhanceTime);
  document.querySelectorAll('form').forEach((form) => {
    if (form.querySelector('[data-show-when]')) applyShowWhen(form);
  });
})();
