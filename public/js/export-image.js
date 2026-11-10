// Tải một khung trên trang thành file PNG hoặc PDF (thẻ khách hàng, phiếu công việc).
// Dùng: <button data-export="png|pdf" data-export-target="#sheet"> ; khung đích có data-filename="ten-file".
// Chụp ảnh bằng html-to-image (/vendor/html-to-image.js, biến toàn cục htmlToImage) — nạp script đó trước.
// PDF tự ghép, không cần thư viện: khổ A4 dọc, ảnh JPEG; khung dài thì chia nhiều trang, cắt ở ranh giới
// giữa các dòng bảng / trước tiêu đề mỗi người (data-export-breaks) để không cắt ngang một việc.
// Link trong PDF là ảnh nên không bấm được — muốn bấm link thì dùng nút "In / Lưu PDF".

// style.margin = 0: khung căn giữa bằng margin auto (phiếu công việc) sẽ bị html-to-image chép nguyên lề
// tính ra (VD 380px trên màn rộng) vào ảnh -> nội dung lệch phải, mất nửa phiếu. Bỏ lề ngoài khi chụp.
const CAPTURE = { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true, cacheBust: true, style: { margin: '0' } };
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 28;

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

/**
 * Chỗ cắt trang (px trên ảnh): đáy mỗi dòng việc; trước dòng tiêu đề ngày (.row-day) và trước mỗi khối người
 * — để tiêu đề không bị bỏ lại một mình cuối trang.
 */
function breakPoints(target, scale) {
  const selector = target.dataset.exportBreaks;
  if (!selector) return [];
  const top = target.getBoundingClientRect().top;
  return [...target.querySelectorAll(selector)]
    .map((el) => {
      const box = el.getBoundingClientRect();
      return el.tagName === 'TR' && !el.classList.contains('row-day') ? box.bottom : box.top;
    })
    .map((y) => Math.round((y - top) * scale))
    .sort((a, b) => a - b);
}

/** Chia ảnh cao thành các đoạn vừa một trang A4; ưu tiên cắt ở breakPoints. */
function slices(height, pageHeight, points) {
  const result = [];
  let start = 0;
  while (height - start > pageHeight) {
    const limit = start + pageHeight;
    const cut = points.filter((p) => p > start + pageHeight * 0.3 && p <= limit).at(-1) ?? limit;
    result.push([start, cut]);
    start = cut;
  }
  result.push([start, height]);
  return result;
}

/** PDF nhiều trang A4, mỗi trang một ảnh JPEG { bytes, width, height } canh lề trên. */
function jpegsToPdf(pages) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const n = (v) => v.toFixed(2);
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

  // 1 = Catalog, 2 = Pages, mỗi trang 3 object: Page, ảnh, nội dung vẽ.
  const pageIds = pages.map((_, i) => 3 + i * 3);
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((page, i) => {
    const [pageId, imageId, contentId] = [pageIds[i], pageIds[i] + 1, pageIds[i] + 2];
    const drawW = A4_W - MARGIN * 2;
    const drawH = (page.height / page.width) * drawW;
    const pageH = Math.max(A4_H, drawH + MARGIN * 2); // ảnh một trang quá dài (thẻ khách) thì trang dài theo
    const content = `q ${n(drawW)} 0 0 ${n(drawH)} ${n(MARGIN)} ${n(pageH - MARGIN - drawH)} cm /Im0 Do Q`;
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(A4_W)} ${n(pageH)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    object(imageId, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`, page.bytes);
    object(contentId, `<< /Length ${content.length} >>`, content);
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

async function toPdf(target) {
  const canvas = await window.htmlToImage.toCanvas(target, CAPTURE);
  const scale = canvas.width / target.getBoundingClientRect().width;
  const pageHeight = Math.floor(((A4_H - MARGIN * 2) / (A4_W - MARGIN * 2)) * canvas.width);
  const parts = target.dataset.exportBreaks ? slices(canvas.height, pageHeight, breakPoints(target, scale)) : [[0, canvas.height]];
  const pages = parts.map(([from, to]) => {
    const piece = document.createElement('canvas');
    piece.width = canvas.width;
    piece.height = to - from;
    const ctx = piece.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, piece.width, piece.height);
    ctx.drawImage(canvas, 0, from, canvas.width, piece.height, 0, 0, canvas.width, piece.height);
    return { bytes: dataUrlBytes(piece.toDataURL('image/jpeg', 0.92)), width: piece.width, height: piece.height };
  });
  return jpegsToPdf(pages);
}

const toPng = (target) => window.htmlToImage.toBlob(target, CAPTURE);

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-export]');
  if (!button) return;
  const target = document.querySelector(button.dataset.exportTarget);
  if (!target || !window.htmlToImage) {
    window.alert('Chưa tải xong công cụ xuất file, thử lại sau vài giây.');
    return;
  }
  const kind = button.dataset.export === 'pdf' ? 'pdf' : 'png';
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Đang tạo…';
  try {
    save(await (kind === 'pdf' ? toPdf(target) : toPng(target)), `${target.dataset.filename || 'tai-ve'}.${kind}`);
  } catch (error) {
    console.error(error);
    window.alert('Không tạo được file, thử lại nhé.');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});
