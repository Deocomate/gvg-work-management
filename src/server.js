// Điểm khởi động: chạy migration rồi mở cổng.
import { config } from '#config';
import { usingEphemeralDb } from '#db';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';
import { ensureAdminUser } from '#modules/auth/auth.service.js';
// [vibe:server-imports]

async function main() {
  await runMigrations();
  await ensureAdminUser();
  // [vibe:server-startup]

  if (usingEphemeralDb()) {
    console.warn(
      '[cảnh báo] Đang dùng file SQLite trên host free: dữ liệu sẽ MẤT khi server ngủ/khởi động lại. ' +
        'Đặt DATABASE_URL + DATABASE_AUTH_TOKEN (Turso) để lưu bền.',
    );
  }

  const server = createApp().listen(config.port, () => {
    console.info(`[server] ${config.appName} chạy tại http://localhost:${config.port} (${config.env})`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[server] không khởi động được:', err);
  process.exit(1);
});
