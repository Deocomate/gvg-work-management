// Chế độ sáng/tối. Nạp trong <head> (không defer) để đặt data-theme trước khi vẽ trang, tránh nháy màu.
// Mặc định là tối; lựa chọn lưu trong localStorage của từng máy.
const THEME_KEY = 'theme';
const THEME_COLORS = { dark: '#0d1514', light: '#6c4f8b' };

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
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

// <button data-theme-toggle> -> đổi sáng/tối.
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
