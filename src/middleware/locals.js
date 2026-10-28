// Biến có sẵn trong mọi view.
import { config } from '#config';

export function locals(req, res, next) {
  res.locals.appName = config.appName;
  res.locals.currentPath = req.path;
  res.locals.year = new Date().getFullYear();
  next();
}
