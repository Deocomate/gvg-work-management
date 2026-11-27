// Popup xem chi tiết nội dung Plan (views/plan/show.hbs).
// Bấm <a data-plan-detail href="/plan/:id?back=…"> -> tải thẻ (?modal=1) vào <dialog id="plan-dialog">.
// Không tải được thì mở trang chi tiết như link thường.
// Sửa nhanh (partials/plan/quick.hbs): bấm vào một mục -> hiện ô sửa ngay tại chỗ, Lưu gửi bằng fetch
// rồi tải lại thẻ. Đóng popup sau khi đã sửa -> tải lại trang bên dưới để lịch/bảng hiện dữ liệu mới.

const dialog = document.getElementById('plan-dialog');
let currentHref = null;
let changed = false;

async function loadDetail(href) {
  const url = new URL(href, location.href);
  url.searchParams.set('modal', '1');
  const response = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`Lỗi ${response.status}`);
  dialog.innerHTML = await response.text();
  window.enhancePickers?.(dialog);
}

async function openDetail(href) {
  currentHref = href;
  dialog.innerHTML = '<p class="customer-dialog-loading">Đang tải…</p>';
  if (!dialog.open) dialog.showModal();
  try {
    await loadDetail(href);
    dialog.querySelector('[data-dialog-close]')?.focus();
  } catch {
    dialog.close();
    location.href = href;
  }
}

if (dialog) {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-plan-detail]');
    // Ctrl/Cmd + bấm, chuột giữa: để trình duyệt mở tab mới như link thường.
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    openDetail(link.href);
  });
  dialog.addEventListener('click', (event) => {
    // Bấm nút Đóng hoặc bấm ra vùng tối bên ngoài thẻ.
    if (event.target === dialog || event.target.closest('[data-dialog-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.innerHTML = '';
    if (changed) location.reload();
  });
}

// ---- Sửa nhanh từng mục (trong popup và trên trang /plan/:id) ----

function setEditing(box, on) {
  const view = box.querySelector('[data-quick-open]');
  const form = box.querySelector('[data-quick-form]');
  view.hidden = on;
  form.hidden = !on;
  if (on) {
    // Mỗi lúc chỉ sửa một mục.
    for (const other of document.querySelectorAll('[data-quick]')) if (other !== box && !other.querySelector('[data-quick-form]').hidden) setEditing(other, false);
    const first = form.querySelector('textarea, input:not([type="hidden"]), .picker-trigger, select');
    first?.focus();
    if (first?.select && first.tagName !== 'SELECT') first.select();
  } else {
    form.reset();
    form.querySelectorAll('input, select, textarea').forEach((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
    const error = form.querySelector('[data-quick-error]');
    error.hidden = true;
    view.focus();
  }
}

document.addEventListener('click', (event) => {
  const view = event.target.closest('[data-quick-open]');
  // Bấm vào link (Mở kịch bản…) thì mở link, không vào chế độ sửa.
  if (view && !event.target.closest('a')) return setEditing(view.closest('[data-quick]'), true);
  const cancel = event.target.closest('[data-quick-cancel]');
  if (cancel) setEditing(cancel.closest('[data-quick]'), false);
});

// Chạy trước pickers.js (capture) để biết lúc bấm Esc có bảng chọn nào đang mở không.
document.addEventListener('keydown', (event) => {
  const view = event.target.closest?.('[data-quick-open]');
  if (view && (event.key === 'Enter' || event.key === ' ') && event.target === view) {
    event.preventDefault();
    return setEditing(view.closest('[data-quick]'), true);
  }
  const form = event.target.closest?.('[data-quick-form]');
  if (!form) return;
  if (event.key === 'Escape') {
    // Esc trong ô sửa: chỉ huỷ sửa, không đóng cả popup (trừ khi đang mở bảng chọn ngày/người — để bảng tự đóng).
    event.preventDefault();
    if (!form.querySelector('.is-open')) setEditing(form.closest('[data-quick]'), false);
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.tagName === 'TEXTAREA') {
    event.preventDefault();
    form.requestSubmit();
  }
}, true);

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-quick-form]');
  if (!form) return;
  event.preventDefault();
  const error = form.querySelector('[data-quick-error]');
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Không lưu được, thử lại nhé.');
    if (dialog?.open && dialog.contains(form)) {
      changed = true;
      await loadDetail(currentHref);
    } else {
      location.reload();
    }
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    button.disabled = false;
  }
});
