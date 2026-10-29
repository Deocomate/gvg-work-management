// Hiệu ứng rơi nhẹ trong dịp lễ. Chỉ được nạp khi đang có lễ; emoji lấy từ data-holiday-sky
// (server chọn theo ngày — src/lib/holidays.js). Người dùng bật "giảm chuyển động" thì không chạy.
const sky = document.querySelector('[data-holiday-sky]');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (sky && !calm) {
  const icons = sky.dataset.holidaySky.trim().split(/\s+/);
  const count = window.innerWidth < 640 ? 8 : 16;
  for (let i = 0; i < count; i++) {
    const flake = document.createElement('span');
    const duration = 14 + Math.random() * 14;
    flake.className = 'holiday-flake';
    flake.textContent = icons[i % icons.length];
    flake.style.left = `${Math.random() * 100}%`;
    flake.style.animationDuration = `${duration}s`;
    flake.style.animationDelay = `${-Math.random() * duration}s`; // âm -> vào trang là đã rơi rải rác
    flake.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    flake.style.setProperty('--spin', `${(Math.random() - 0.5) * 540}deg`);
    sky.append(flake);
  }
}
