# Image chạy production (Coolify / VPS). Build CSS ở stage riêng, image cuối chỉ có dependency chạy.
# Dùng bản slim (glibc) thay vì alpine để @libsql/client dùng đúng bản native có sẵn.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:data/app.db
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --from=build --chown=node:node /app/public/css/app.css ./public/css/app.css
# Thư mục chứa file SQLite: gắn volume vào đây để dữ liệu không mất khi deploy lại.
RUN mkdir -p data && chown node:node data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Chạy node trực tiếp (không qua npm) để nhận SIGTERM và tắt êm khi Coolify deploy lại.
CMD ["node", "src/server.js"]
