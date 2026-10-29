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

// <button data-print> -> mở hộp thoại in (in giấy hoặc lưu PDF).
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-print]')) window.print();
});

// <button data-copy="#id"> -> chép chữ của phần tử đó (VD phiếu công việc để dán vào Zalo).
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const source = document.querySelector(button.dataset.copy);
  if (!source) return;
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(source.innerText.trim());
    button.textContent = '✓ Đã chép';
  } catch {
    button.textContent = 'Không chép được';
  }
  setTimeout(() => (button.textContent = label), 2000);
});

// <fieldset data-weekdays> (form công việc): bấm thứ -> cập nhật dòng "Mỗi Thứ Hai"…;
// chưa bấm thứ nào thì đổi ô Ngày sẽ tự chọn đúng thứ của ngày đó.
// Quy tắc mô tả giống repeatSummary() trong tasks.schema.js.
function weekdaySummary(box) {
  const boxes = [...box.querySelectorAll('input[name="repeat_days"]')];
  const picked = boxes.filter((input) => input.checked);
  const has = (day) => picked.some((input) => input.value === day);
  let text = `Mỗi ${picked.map((input) => input.dataset.name).join(', ')}`;
  if (picked.length === 0) text = 'Chưa chọn thứ';
  else if (picked.length === 7) text = 'Hằng ngày';
  else if (picked.length === 5 && !has('6') && !has('0')) text = 'Thứ Hai – Thứ Sáu';
  box.querySelector('[data-weekday-summary]').textContent = text;
}
document.addEventListener('change', (event) => {
  const box = event.target.form?.querySelector('[data-weekdays]');
  if (!box) return;
  if (event.target.name === 'repeat_days') {
    box.dataset.touched = 'true';
  } else if (event.target.name === 'date' && !box.dataset.touched && event.target.value) {
    const day = String(new Date(`${event.target.value}T00:00:00Z`).getUTCDay());
    for (const input of box.querySelectorAll('input[name="repeat_days"]')) input.checked = input.value === day;
  } else {
    return;
  }
  weekdaySummary(box);
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
