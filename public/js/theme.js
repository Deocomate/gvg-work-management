// Chế độ sáng/tối. Nạp trong <head> (không defer) để đặt data-theme trước khi vẽ trang, tránh nháy màu.
// Mặc định theo hệ thống (máy đang để tối thì tối); không biết hệ thống thì sáng.
// Ai bấm ☀/☾ thì lựa chọn đó lưu trong localStorage của máy và luôn được ưu tiên.
// (Khung Lương đọc theo đúng quy tắc này — hostTheme() trong src/payroll/src/app.html.)
const THEME_KEY = 'theme';
const THEME_COLORS = { dark: '#0d1514', light: '#f3ecfb' };
const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function savedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function readTheme() {
  return savedTheme() || (systemDark && systemDark.matches ? 'dark' : 'light');
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
  root.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

applyTheme(readTheme());

// Chưa ai chọn: đổi theo khi hệ thống chuyển sáng/tối.
systemDark?.addEventListener?.('change', () => {
  if (!savedTheme()) applyTheme(readTheme());
});

// <button data-theme-toggle> -> đổi sáng/tối và nhớ lựa chọn.
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-theme-toggle]')) return;
  const next = readTheme() === 'light' ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Trình duyệt chặn lưu: vẫn đổi cho trang hiện tại.
  }
  applyTheme(next);
});
