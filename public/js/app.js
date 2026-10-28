// JS phía trình duyệt dùng chung. CSP chặn <script> inline và onclick="",
// nên mọi hành vi đặt ở đây và gắn qua thuộc tính data-*.

// <form data-confirm="Bạn chắc chứ?"> -> hỏi trước khi gửi.
document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-confirm]');
  if (form && !window.confirm(form.dataset.confirm)) event.preventDefault();
});

// Chống bấm gửi 2 lần.
document.addEventListener('submit', (event) => {
  if (event.defaultPrevented) return;
  const button = event.target.querySelector('button[type="submit"]');
  if (button) setTimeout(() => (button.disabled = true), 0);
});

// <input|select data-autosubmit> -> tự gửi form khi đổi giá trị (VD: chọn ngày, bộ lọc).
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-autosubmit]')) event.target.form?.requestSubmit();
});

// <a data-back> -> quay lại trang trước.
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-back]')) {
    event.preventDefault();
    history.back();
  }
});

// Thông báo flash tự ẩn sau 5 giây.
document.querySelectorAll('[data-dismissible]').forEach((el) => {
  setTimeout(() => el.remove(), 5000);
});

/** Gọi API JSON có kèm CSRF token. Dùng: await api('/api/items', { method: 'POST', body: {...} }) */
window.api = async (url, { method = 'GET', body } = {}) => {
  const token = document.querySelector('meta[name="csrf-token"]')?.content;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-csrf-token': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Lỗi ${response.status}`);
  return data;
};
