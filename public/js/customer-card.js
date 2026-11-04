// Thẻ chi tiết khách hàng (views/customers/show.hbs).
// - Trang danh sách: <a data-customer-card href="/customers/:id"> -> mở thẻ trong popup <dialog id="customer-dialog">.
// - Nút <button data-card-export="png|pdf"> -> chụp khung [data-card] thành ảnh rồi tải về.
// Chụp ảnh dùng thư viện html-to-image (/vendor/html-to-image.js, biến toàn cục htmlToImage).
// PDF tự ghép: một trang A4 chứa ảnh JPEG của thẻ, không cần thư viện PDF.

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

// ---------- Tải PNG / PDF ----------

const CAPTURE = { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true, cacheBust: true };

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dataUrlBytes = (dataUrl) => Uint8Array.from(atob(dataUrl.split(',')[1]), (ch) => ch.charCodeAt(0));

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** PDF một trang A4 (dọc), ảnh JPEG canh giữa theo chiều ngang, lề 28pt. Thẻ quá dài thì trang dài theo. */
function jpegToPdf(jpeg, width, height) {
  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGIN = 28;
  const drawW = A4_W - MARGIN * 2;
  const drawH = (height / width) * drawW;
  const pageH = Math.max(A4_H, drawH + MARGIN * 2);
  const y = pageH - MARGIN - drawH;
  const n = (v) => v.toFixed(2);
  const content = `q ${n(drawW)} 0 0 ${n(drawH)} ${n(MARGIN)} ${n(y)} cm /Im0 Do Q`;

  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id, body, stream) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(A4_W)} ${n(pageH)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  object(5, `<< /Length ${content.length} >>`, content);

  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-card-export]');
  if (!button) return;
  const card = button.closest('[data-customer-sheet]')?.querySelector('[data-card]');
  if (!card || !window.htmlToImage) {
    window.alert('Chưa tải xong công cụ xuất file, thử lại sau vài giây.');
    return;
  }
  const kind = button.dataset.cardExport;
  const filename = `${card.dataset.filename || 'khach-hang'}.${kind}`;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Đang tạo…';
  try {
    if (kind === 'png') {
      save(await window.htmlToImage.toBlob(card, CAPTURE), filename);
    } else {
      const dataUrl = await window.htmlToImage.toJpeg(card, { ...CAPTURE, quality: 0.95 });
      const img = await loadImage(dataUrl);
      save(jpegToPdf(dataUrlBytes(dataUrl), img.naturalWidth, img.naturalHeight), filename);
    }
  } catch (error) {
    console.error(error);
    window.alert('Không tạo được file, thử lại nhé.');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});
