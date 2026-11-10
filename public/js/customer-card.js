// Thẻ chi tiết khách hàng (views/customers/show.hbs).
// - Trang danh sách: <a data-customer-card href="/customers/:id"> -> mở thẻ trong popup <dialog id="customer-dialog">.
// - Nút tải PNG / PDF của thẻ xử lý ở public/js/export-image.js (data-export).

const dialog = document.getElementById('customer-dialog');

async function openCard(href) {
  dialog.innerHTML = '<p class="customer-dialog-loading">Đang tải…</p>';
  if (!dialog.open) dialog.showModal();
  try {
    const url = new URL(href, location.href);
    url.searchParams.set('modal', '1');
    const response = await fetch(url, { headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error(`Lỗi ${response.status}`);
    dialog.innerHTML = await response.text();
    dialog.querySelector('[data-card-export]')?.focus();
  } catch {
    dialog.close();
    location.href = href; // Không tải được thì mở trang chi tiết.
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-customer-card]');
  // Ctrl/Cmd + bấm, chuột giữa: để trình duyệt mở tab mới như link thường.
  if (!link || !dialog || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  openCard(link.href);
});

if (dialog) {
  dialog.addEventListener('click', (event) => {
    // Bấm nút Đóng hoặc bấm ra vùng tối bên ngoài thẻ.
    if (event.target === dialog || event.target.closest('[data-dialog-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => (dialog.innerHTML = ''));
}
