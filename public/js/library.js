// Thư viện ảnh — trang album (src/views/library/album.hbs).
// 1) Tải ảnh lên: chọn/kéo nhiều ảnh -> gửi lần lượt TỪNG ảnh (ảnh gốc + ảnh thu nhỏ ≤1200px tạo ngay trên máy),
//    để lưới ảnh mở nhanh mà vẫn tải về được đúng ảnh gốc. Xong thì tải lại trang.
// 2) Xem ảnh lớn: bấm ảnh mở <dialog id="lib-viewer">, ← → / vuốt để chuyển, có nút Tải xuống.
(() => {
  const THUMB_MAX = 1200;
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content;

  // ---------------------------------------------------------------- Tải ảnh lên

  const form = document.querySelector('[data-lib-upload]');
  if (form) {
    const input = form.querySelector('[data-lib-files]');
    const drop = form.querySelector('[data-lib-drop]');
    const box = form.querySelector('[data-lib-progress]');
    const fill = form.querySelector('[data-lib-progress-fill]');
    const text = form.querySelector('[data-lib-progress-text]');
    const errorList = form.querySelector('[data-lib-progress-errors]');
    const maxBytes = Number(input.dataset.libMaxMb) * 1024 * 1024;
    let busy = false;

    const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

    /** Ảnh thu nhỏ + kích thước thật. Trình duyệt không đọc được ảnh (VD HEIC) thì trả null, vẫn gửi ảnh gốc. */
    async function makeThumb(file) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const { width, height } = bitmap;
        const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        let blob = await canvasBlob(canvas, 'image/webp', 0.82);
        // Trình duyệt chưa tạo được WebP (Safari cũ trả PNG) -> dùng JPEG cho nhẹ.
        if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', 0.85);
        return { blob, width, height };
      } catch {
        return null;
      }
    }

    async function sendOne(file) {
      const body = new FormData();
      body.append('folder', form.elements.folder?.value ?? '');
      body.append('photo', file, file.name);
      const thumb = await makeThumb(file);
      if (thumb?.blob) {
        body.append('thumb', thumb.blob, thumb.blob.type === 'image/webp' ? 'thumb.webp' : 'thumb.jpg');
        body.append('width', thumb.width);
        body.append('height', thumb.height);
      }
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json', 'x-csrf-token': csrf() },
        body,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Lỗi ${response.status}`);
      }
    }

    function showError(name, message) {
      const li = document.createElement('li');
      li.textContent = `${name}: ${message}`;
      errorList.append(li);
    }

    async function uploadAll(fileList) {
      if (busy) return;
      const files = [...fileList];
      if (!files.length) return;
      busy = true;
      box.hidden = false;
      errorList.replaceChildren();
      let done = 0;
      let ok = 0;
      const step = () => {
        fill.style.width = `${Math.round((done / files.length) * 100)}%`;
        text.textContent = done < files.length ? `Đang tải ảnh ${done + 1}/${files.length}…` : `Đã tải xong ${ok}/${files.length} ảnh.`;
      };
      step();
      for (const file of files) {
        try {
          if (!file.type.startsWith('image/')) throw new Error('không phải ảnh');
          if (file.size > maxBytes) throw new Error(`quá lớn (tối đa ${input.dataset.libMaxMb}MB)`);
          await sendOne(file);
          ok += 1;
        } catch (error) {
          showError(file.name, error.message);
        }
        done += 1;
        step();
      }
      busy = false;
      input.value = '';
      // Có lỗi thì để lại danh sách cho người dùng đọc; ảnh đã lên sẽ hiện khi tải lại trang.
      if (!errorList.children.length) window.location.reload();
      else if (ok) text.textContent += ' Tải lại trang để xem ảnh vừa thêm.';
    }

    input.addEventListener('change', () => uploadAll(input.files));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      uploadAll(input.files);
    });
    ['dragenter', 'dragover'].forEach((type) =>
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add('lib-drop-active');
      }),
    );
    ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('lib-drop-active')));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      uploadAll(event.dataTransfer.files);
    });
    window.addEventListener('beforeunload', (event) => {
      if (busy) event.preventDefault();
    });
  }

  // ---------------------------------------------------------------- Sửa tên ngay dưới ảnh (quản lý)
  // Bấm tên -> ô nhập; Enter hoặc bấm ra ngoài là lưu, Esc là huỷ. Chỉ sửa phần tên, đuôi .jpg server giữ nguyên.

  async function saveCaption(tile, input, button) {
    const name = input.value.trim();
    const before = button.textContent;
    if (!name || name === before) return input.replaceWith(button);
    input.disabled = true;
    input.classList.add('lib-caption-saving');
    try {
      const response = await fetch(`/library/photos/${tile.dataset.id}/rename`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'x-csrf-token': csrf() },
        body: new URLSearchParams({ name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Lỗi ${response.status}`);
      button.textContent = data.displayName;
      tile.dataset.name = data.fileName;
      for (const a of tile.querySelectorAll('a[download]')) {
        a.setAttribute('download', data.fileName);
        a.setAttribute('aria-label', `Tải ảnh ${data.fileName}`);
      }
      tile.querySelector('img')?.setAttribute('alt', data.fileName);
      input.replaceWith(button);
    } catch (error) {
      input.disabled = false;
      input.classList.remove('lib-caption-saving');
      input.setCustomValidity(error.message);
      input.reportValidity();
      input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
      input.focus();
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lib-caption]');
    if (!button) return;
    const tile = button.closest('[data-lib-photo]');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 150;
    input.className = 'lib-caption-input';
    input.value = button.textContent.trim();
    input.setAttribute('aria-label', 'Tên ảnh mới');
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) saveCaption(tile, input, button).finally(() => (done = !input.isConnected));
      else input.replaceWith(button);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
        button.focus();
      }
    });
    input.addEventListener('blur', () => finish(true));
    button.replaceWith(input);
    input.focus();
    input.select();
  });

  // ---------------------------------------------------------------- Xem ảnh lớn

  const viewer = document.getElementById('lib-viewer');
  const tiles = [...document.querySelectorAll('[data-lib-photo]')];
  if (!viewer || !tiles.length) return;

  const img = viewer.querySelector('[data-viewer-img]');
  const nameEl = viewer.querySelector('[data-viewer-name]');
  const countEl = viewer.querySelector('[data-viewer-count]');
  const download = viewer.querySelector('[data-viewer-download]');
  const coverForm = viewer.querySelector('[data-viewer-cover]');
  const deleteForm = viewer.querySelector('[data-viewer-delete]');
  // Đổi tên (chỉ quản lý): ô nhập thay chỗ tên ảnh, chỉ sửa phần tên — đuôi .jpg giữ nguyên.
  const renameForm = viewer.querySelector('[data-viewer-rename]');
  const renameInput = viewer.querySelector('[data-viewer-rename-input]');
  const renameExt = viewer.querySelector('[data-viewer-rename-ext]');
  const renameOpen = viewer.querySelector('[data-viewer-rename-open]');
  const splitExt = (name) => {
    const m = name.match(/^(.*?)(\.[a-z0-9]{1,5})?$/i);
    return { base: m[1] || name, ext: m[2] || '' };
  };
  function editing(on) {
    if (!renameForm) return;
    renameForm.hidden = !on;
    renameForm.parentElement.classList.toggle('lib-renaming', on);
    if (on) {
      renameInput.focus();
      renameInput.select();
    }
  }
  let current = 0;

  function show(index) {
    current = (index + tiles.length) % tiles.length;
    const tile = tiles[current].dataset;
    img.src = `/library/photos/${tile.id}/thumb`;
    img.alt = tile.name;
    nameEl.textContent = tile.name;
    countEl.textContent = `${current + 1} / ${tiles.length}`;
    download.href = `/library/photos/${tile.id}/file?download=1`;
    download.setAttribute('download', tile.name);
    for (const f of [coverForm, deleteForm, renameForm]) if (f) f.action = f.dataset.actionTemplate.replace(':id', tile.id);
    if (coverForm) coverForm.hidden = 'cover' in tile;
    if (renameForm) {
      const { base, ext } = splitExt(tile.name);
      renameInput.value = base;
      renameExt.textContent = ext;
      editing(false);
    }
    // Tải trước ảnh kế tiếp cho bấm "›" là hiện ngay.
    new Image().src = `/library/photos/${tiles[(current + 1) % tiles.length].dataset.id}/thumb`;
  }

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-lib-open]');
    if (!opener) return;
    show(tiles.indexOf(opener.closest('[data-lib-photo]')));
    viewer.showModal();
  });

  viewer.querySelector('[data-viewer-prev]').addEventListener('click', () => show(current - 1));
  viewer.querySelector('[data-viewer-next]').addEventListener('click', () => show(current + 1));
  viewer.addEventListener('click', (event) => {
    if (event.target.closest('[data-dialog-close]') || event.target.classList.contains('lib-viewer-stage')) viewer.close();
  });
  renameOpen?.addEventListener('click', () => editing(true));
  viewer.querySelector('[data-viewer-rename-cancel]')?.addEventListener('click', () => editing(false));

  viewer.addEventListener('keydown', (event) => {
    if (event.target.closest('input')) return; // đang gõ tên ảnh: ← → để di chuyển con trỏ, không chuyển ảnh
    if (event.key === 'ArrowLeft') show(current - 1);
    if (event.key === 'ArrowRight') show(current + 1);
  });
  viewer.addEventListener('close', () => img.removeAttribute('src'));

  // Vừa đổi tên xong (/library/:id#photo-<id>): mở lại đúng ảnh đó để thấy tên mới.
  const fromHash = location.hash.match(/^#photo-(\d+)$/)?.[1];
  const hashIndex = tiles.findIndex((t) => t.dataset.id === fromHash);
  if (hashIndex >= 0) {
    show(hashIndex);
    viewer.showModal();
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Vuốt ngang trên điện thoại để chuyển ảnh.
  let touchX = null;
  viewer.addEventListener('touchstart', (event) => (touchX = event.touches[0].clientX), { passive: true });
  viewer.addEventListener('touchend', (event) => {
    if (touchX === null) return;
    const dx = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) show(dx < 0 ? current + 1 : current - 1);
  });
})();
