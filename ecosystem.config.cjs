// PM2: giữ server luôn chạy (tự khởi động lại khi lỗi) trên máy chủ/VPS.
//   npx pm2 start ecosystem.config.cjs && npx pm2 save
module.exports = {
  apps: [
    {
      name: 'lich-cong-viec',
      script: 'src/server.js',
      node_args: '--env-file-if-exists=.env',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
  ],
};
