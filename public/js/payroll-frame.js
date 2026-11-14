// Khung Lương cao bằng nội dung bên trong → trang chỉ có MỘT thanh cuộn dọc (không cuộn lồng nhau).
// App lương gửi {gvg:'size',h}; trang này đặt chiều cao khung, và báo phần khung đang thấy trên màn hình
// ({gvg:'vp',top,h}) để cửa sổ nổi / thông báo trong app lương hiện đúng chỗ người dùng đang xem.
(() => {
  const frame = document.querySelector('[data-payroll-frame]');
  if (!frame) return;
  let fitted = false;
  const sendViewport = () => {
    if (!fitted) return;
    const r = frame.getBoundingClientRect();
    // phần khung đang nằm trong màn hình (toạ độ bên trong khung)
    const top = Math.max(0, -r.top);
    const h = Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top);
    frame.contentWindow?.postMessage({ gvg: 'vp', top, h }, location.origin);
  };
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data || {};
    if (m.gvg !== 'size') return;
    if (!fitted) {
      fitted = true;
      frame.contentWindow.postMessage({ gvg: 'fit' }, location.origin);
    }
    if (m.h > 0) {
      frame.style.height = `${Math.max(320, m.h)}px`;
      frame.classList.remove('min-h-[560px]');
    }
    sendViewport();
  });
  window.addEventListener('scroll', sendViewport, { passive: true });
  window.addEventListener('resize', sendViewport);
})();
