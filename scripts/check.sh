#!/usr/bin/env bash
# Tự review nhanh — chạy trước khi báo "xong" một nhiệm vụ.
#   bash scripts/check.sh
# Thoát mã 1 nếu có LỖI (phải sửa). CẢNH BÁO thì nên xem lại nhưng không chặn.
set -uo pipefail
cd "$(dirname "$0")/.."

errors=0
warnings=0
step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
err() { printf '  \033[31m✗ LỖI:\033[0m %s\n' "$1"; errors=$((errors + 1)); }
warn() { printf '  \033[33m! CẢNH BÁO:\033[0m %s\n' "$1"; warnings=$((warnings + 1)); }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }

# Liệt kê dòng khớp (bỏ qua thư mục không liên quan)
scan() { grep -rnE "$1" "${@:2}" --include='*.js' --include='*.hbs' 2>/dev/null || true; }

step "Cú pháp JavaScript"
syntax_ok=1
while IFS= read -r file; do
  node --check "$file" 2>/dev/null || { err "sai cú pháp: $file"; syntax_ok=0; }
done < <(find src tests public/js -name '*.js' -not -path '*/node_modules/*')
[ "$syntax_ok" = 1 ] && ok "không có lỗi cú pháp"

step "Build CSS (Tailwind)"
if npm run -s css:build >/dev/null 2>.run-css.log; then ok "build CSS thành công"; else err "build CSS lỗi: $(cat .run-css.log)"; fi
rm -f .run-css.log

step "Chạy test"
if npm test --silent >.run-test.log 2>&1; then
  ok "$(grep -E '^# (pass|tests)' .run-test.log | tr '\n' ' ')"
else
  err "test thất bại — xem chi tiết bên dưới"
  grep -E 'not ok|Error|expected|actual|AssertionError' .run-test.log | head -30
fi
rm -f .run-test.log

step "Bảo mật"
if hits=$(node scripts/lint-sql.mjs); then ok "SQL dùng tham số ?"
else err "SQL ghép giá trị bằng \${} (nguy cơ SQL injection) — dùng tham số ?, hoặc đặt tên *Sql nếu là đoạn SQL cố định:
$hits"; fi
hits=$(scan '<script>|<script [^>]*>[^<]|on(click|submit|change|load)=' src/views)
[ -n "$hits" ] && err "script inline/onclick trong view sẽ bị CSP chặn — chuyển vào public/js/app.js với data-*:
$hits" || ok "không có script inline"
hits=$(grep -rn '{{{' src/views --include='*.hbs' | grep -v 'layouts/main.hbs' || true)
[ -n "$hits" ] && warn "{{{ }}} không escape HTML (nguy cơ XSS) — chắc chắn dữ liệu an toàn:
$hits"
hits=$(scan "(api[_-]?key|secret|password|token)['\"]?[[:space:]]*[:=][[:space:]]*['\"][^'\"]{8,}" src | grep -v 'dev-only-secret' || true)
[ -n "$hits" ] && warn "có vẻ có secret viết cứng trong code — chuyển vào biến môi trường:
$hits"

step "Cấu trúc & sạch sẽ"
hits=$(grep -rlE '\b(SELECT|INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM)\b' src/modules --include='*.js' 2>/dev/null | grep -v '\.repo\.js$' || true)
[ -n "$hits" ] && warn "SQL nằm ngoài file *.repo.js:
$hits"
hits=$(grep -rln 'process\.env' src --include='*.js' | grep -v 'src/config/' || true)
[ -n "$hits" ] && warn "đọc process.env ngoài src/config — đưa vào config:
$hits"
hits=$(grep -rn 'console\.log' src --include='*.js' || true)
[ -n "$hits" ] && warn "còn console.log debug (log có chủ đích thì dùng console.info/warn/error):
$hits"
hits=$(scan 'TODO|FIXME|XXX' src)
[ -n "$hits" ] && warn "còn TODO/FIXME:
$hits"
while IFS= read -r file; do
  lines=$(wc -l <"$file")
  [ "$lines" -gt 250 ] && warn "$file dài $lines dòng — cân nhắc tách nhỏ"
done < <(find src -name '*.js' -o -name '*.hbs')
for dir in src/modules/*/; do
  name=$(basename "$dir")
  [ "$name" = "home" ] && continue
  ls tests/"$name"*.test.js >/dev/null 2>&1 || warn "module '$name' chưa có test (tests/$name.test.js)"
done

printf '\n\033[1mKết quả: %s lỗi, %s cảnh báo\033[0m\n' "$errors" "$warnings"
[ "$errors" -eq 0 ]
