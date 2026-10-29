@echo off
rem Bam dup file nay de chay app "Lich cong viec" tren Windows.
rem Lan dau: tu cai thu vien, tao tai khoan quan ly. Cac lan sau: chi khoi dong.
title Lich cong viec
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  May chua cai Node.js.
  echo  Trang tai se mo ra: tai ban LTS, cai xong thi bam dup lai file nay.
  echo.
  start "" https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo Dang cai thu vien lan dau, cho khoang 1 phut...
  call npm install --no-fund --no-audit --loglevel=error
  if errorlevel 1 goto fail
)

node scripts\first-run.mjs
if errorlevel 1 goto fail

call npm run -s build >nul
if errorlevel 1 goto fail

echo App dang chay tai http://localhost:3000  (dong cua so nay de tat app)
echo Code thay doi thi app tu nap lai, khong can dong/mo lai cua so nay.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
rem "dev" = tu khoi dong lai server khi code doi + tu build lai giao dien (CSS)
call npm run dev
goto end

:fail
echo.
echo  Co loi xay ra. Chup man hinh cua so nay gui cho Claude.
pause
exit /b 1

:end
pause
