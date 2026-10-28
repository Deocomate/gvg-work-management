#!/usr/bin/env bash
# Chạy app (production) trên MÁY NÀY và tạo link public HTTPS tạm thời qua
# Cloudflare Quick Tunnel (free, không cần tài khoản). Nhiều người dùng cùng lúc được.
#   bash scripts/share.sh        -> khởi động, in ra link
#   bash scripts/share.sh stop   -> tắt server + link
#   bash scripts/share.sh status -> xem link hiện tại
# Link sống chừng nào máy còn bật và tiến trình còn chạy. Mỗi lần chạy lại sẽ ra link mới.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
RUN=.run
mkdir -p "$RUN" .bin

stop_pid() { [ -f "$1" ] && kill "$(cat "$1")" 2>/dev/null || true; rm -f "$1"; }

case "${1:-start}" in
  stop)
    stop_pid "$RUN/tunnel.pid"; stop_pid "$RUN/server.pid"; rm -f "$RUN/url.txt"
    echo "Đã tắt server và link chia sẻ."; exit 0 ;;
  status)
    if [ -f "$RUN/url.txt" ] && kill -0 "$(cat "$RUN/tunnel.pid" 2>/dev/null)" 2>/dev/null; then
      echo "Đang chia sẻ tại: $(cat "$RUN/url.txt")"
    else
      echo "Chưa chia sẻ. Chạy: bash scripts/share.sh"
    fi
    exit 0 ;;
esac

# 1) .env với SESSION_SECRET ngẫu nhiên
if [ ! -f .env ]; then cp .env.example .env; fi
if grep -q '^SESSION_SECRET=thay-bang' .env; then
  secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  node -e "const fs=require('fs');fs.writeFileSync('.env',fs.readFileSync('.env','utf8').replace(/^SESSION_SECRET=.*$/m,'SESSION_SECRET=$secret'))"
fi

# 2) Cài thư viện + build CSS
[ -d node_modules ] || npm install --no-fund --no-audit
npm run -s build

# 3) Khởi động server (tắt bản cũ nếu có)
stop_pid "$RUN/tunnel.pid"; stop_pid "$RUN/server.pid"
NODE_ENV=production PORT="$PORT" nohup node --env-file-if-exists=.env src/server.js >"$RUN/server.log" 2>&1 &
echo $! >"$RUN/server.pid"

for _ in $(seq 1 40); do
  curl -fsS "http://localhost:$PORT/healthz" >/dev/null 2>&1 && break
  sleep 0.5
done
if ! curl -fsS "http://localhost:$PORT/healthz" >/dev/null 2>&1; then
  echo "Server không khởi động được. Log:"; tail -30 "$RUN/server.log"; exit 1
fi
echo "Server chạy tại http://localhost:$PORT"

# 4) Tìm hoặc tải cloudflared
CF=$(command -v cloudflared || true)
if [ -z "$CF" ]; then
  CF=.bin/cloudflared
  if [ ! -x "$CF" ]; then
    os=$(uname -s); arch=$(uname -m)
    case "$arch" in x86_64|amd64) arch=amd64 ;; arm64|aarch64) arch=arm64 ;; *) echo "Kiến trúc $arch chưa hỗ trợ tự tải. Cài cloudflared thủ công."; exit 1 ;; esac
    base=https://github.com/cloudflare/cloudflared/releases/latest/download
    echo "Đang tải cloudflared ($os/$arch)..."
    case "$os" in
      Linux) curl -fsSL "$base/cloudflared-linux-$arch" -o "$CF" ;;
      Darwin) curl -fsSL "$base/cloudflared-darwin-$arch.tgz" | tar -xz -C .bin ;;
      *) echo "Windows: chạy 'winget install --id Cloudflare.cloudflared' rồi chạy lại."; exit 1 ;;
    esac
    chmod +x "$CF"
  fi
fi

# 5) Mở tunnel và chờ link
nohup "$CF" tunnel --url "http://localhost:$PORT" --no-autoupdate >"$RUN/tunnel.log" 2>&1 &
echo $! >"$RUN/tunnel.pid"

url=""
for _ in $(seq 1 60); do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$RUN/tunnel.log" | head -1 || true)
  [ -n "$url" ] && break
  sleep 0.5
done
if [ -z "$url" ]; then
  echo "Không tạo được link. Log tunnel:"; tail -20 "$RUN/tunnel.log"; exit 1
fi
echo "$url" >"$RUN/url.txt"
echo ""
echo "✅ Link chia sẻ: $url"
echo "   (link có thể mất ~10-30 giây mới truy cập được lần đầu)"
echo "   Tắt: bash scripts/share.sh stop"
