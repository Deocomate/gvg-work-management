// Lắp ráp ứng dụng Express. Không gọi listen() ở đây để test có thể dùng app trực tiếp.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieSession from 'cookie-session';
import { engine } from 'express-handlebars';

import { config } from '#config';
import { helpers } from '#lib/view-helpers.js';
import { csrf } from '#middleware/csrf.js';
import { flash } from '#middleware/flash.js';
import { locals } from '#middleware/locals.js';
import { errorHandler, notFoundHandler } from '#middleware/errors.js';
import { registerModules } from '#modules/index.js';
import { loadUser } from '#middleware/auth.js';
import { taskBadge } from '#middleware/task-badge.js';
// [vibe:app-imports]

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS = path.join(ROOT, 'src', 'views');

export function createApp() {
  const app = express();

  // Chạy sau proxy HTTPS (Render, Cloudflare Tunnel, Nginx) -> tin header X-Forwarded-*.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir: path.join(VIEWS, 'layouts'),
      partialsDir: path.join(VIEWS, 'partials'),
      helpers,
    }),
  );
  app.set('view engine', 'hbs');
  app.set('views', VIEWS);

  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: config.isProd ? '7d' : 0 }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    cookieSession({
      name: 'sid',
      keys: [config.sessionSecret],
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: true,
      secure: config.isProd,
    }),
  );

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use(locals);
  app.use(flash);
  app.use(csrf);
  app.use(loadUser);
  app.use(taskBadge);
  // [vibe:app-middleware]

  registerModules(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
