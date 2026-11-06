// Đổi link tài liệu thành link "xem trước" nhúng được vào khung (iframe) ngay trong app.
// Chỉ các dịch vụ cho phép nhúng: Google Drive/Docs/Sheets/Slides/Forms, YouTube.
// Trang khác hầu hết chặn nhúng -> trả về null, người dùng bấm "Mở" sang tab mới.
// Khi thêm dịch vụ mới: nhớ thêm tên miền vào frame-src trong src/app.js (CSP).

export const PREVIEW_HOSTS = ['https://drive.google.com', 'https://docs.google.com', 'https://www.youtube-nocookie.com'];

const ID = String.raw`([\w-]{10,})`;

export function previewUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/u\/\d+(?=\/)/, ''); // bỏ "/u/0" (tài khoản Google thứ mấy)
  let m;

  if (host === 'drive.google.com') {
    if ((m = path.match(new RegExp(`^/file/d/${ID}`)))) return `https://drive.google.com/file/d/${m[1]}/preview`;
    if ((m = path.match(new RegExp(`^/drive/folders/${ID}`))))
      return `https://drive.google.com/embeddedfolderview?id=${m[1]}#list`;
    const id = url.searchParams.get('id');
    if (/^\/open\/?$/.test(path) && id && new RegExp(`^${ID}$`).test(id))
      return `https://drive.google.com/file/d/${id}/preview`;
    return null;
  }

  if (host === 'docs.google.com') {
    if ((m = path.match(new RegExp(`^/(document|spreadsheets|presentation)/d/${ID}`))))
      return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
    if ((m = path.match(new RegExp(`^/forms/d/(e/)?${ID}`))))
      return `https://docs.google.com/forms/d/${m[1] ?? ''}${m[2]}/viewform?embedded=true`;
    return null;
  }

  const youtubeId =
    host === 'youtu.be'
      ? path.slice(1)
      : ['youtube.com', 'm.youtube.com'].includes(host)
        ? (url.searchParams.get('v') ?? path.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1])
        : null;
  if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) return `https://www.youtube-nocookie.com/embed/${youtubeId}`;

  return null;
}
