// Popup xem chi tiết nội dung Plan (views/plan/show.hbs).
// Bấm <a data-plan-detail href="/plan/:id?back=…"> -> tải thẻ (?modal=1) vào <dialog id="plan-dialog">.
// Không tải được thì mở trang chi tiết như link thường.

const dialog = document.getElementById('plan-dialog');

async function openDetail(href) {
  dialog.innerHTML = '<p class="customer-dialog-loading">Đang tải…</p>';
  if (!dialog.open) dialog.showModal();
  try {
    const url = new URL(href, location.href);
    url.searchParams.set('modal', '1');
    const response = await fetch(url, { headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error(`Lỗi ${response.status}`);
    dialog.innerHTML = await response.text();
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
  dialog.addEventListener('close', () => (dialog.innerHTML = ''));
}
