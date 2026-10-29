// Danh sách module (tính năng) của app. Thêm module mới: import router rồi thêm 1 dòng.
// Mỗi module nằm trong src/modules/<ten>/ với các file:
//   <ten>.routes.js     -> khai báo URL
//   <ten>.controller.js -> nhận request, gọi service, render view
//   <ten>.service.js    -> nghiệp vụ + kiểm tra dữ liệu
//   <ten>.repo.js       -> câu SQL (chỉ chỗ này được viết SQL)
//   <ten>.schema.js     -> schema zod cho form
// `middleware` (tuỳ chọn) chạy trước mọi route của module, VD: [requireAuth].
import homeRoutes from './home/home.routes.js';
import authRoutes from './auth/auth.routes.js';
import { requireAuth, requireRole } from '#middleware/auth.js'; // dùng: middleware: [requireAuth]
import scheduleRoutes from './schedule/schedule.routes.js';
import tasksRoutes from './tasks/tasks.routes.js';
import staffRoutes from './staff/staff.routes.js';
import linksRoutes from './links/links.routes.js';
import performanceRoutes from './performance/performance.routes.js';
// [vibe:module-imports]

export const modules = [
  { path: '/', router: homeRoutes },
  { path: '/', router: authRoutes },
  { path: '/', router: scheduleRoutes }, // /today, /calendar (tự kiểm tra đăng nhập)
  { path: '/tasks', router: tasksRoutes, middleware: [requireAuth] },
  { path: '/staff', router: staffRoutes, middleware: [requireRole('admin')] },
  { path: '/links', router: linksRoutes, middleware: [requireAuth] }, // xem: mọi người; thêm/sửa/xoá: quản lý
  { path: '/performance', router: performanceRoutes, middleware: [requireRole('admin')] },
  // [vibe:module-mounts]
];

export function registerModules(app) {
  for (const { path, router, middleware = [] } of modules) app.use(path, ...middleware, router);
}
