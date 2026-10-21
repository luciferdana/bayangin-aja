@echo off
rem Update kuis ke versi terbaru dari GitHub, matikan server lama, lalu jalankan live.
rem Klik dua kali file ini. Nama akun TikTok: bayangin.3d (lihat "live" di package.json).

rem Jalankan salinan di folder TEMP, supaya git pull aman mengganti file ini sendiri.
if not "%~1"=="__run" (
  copy /y "%~f0" "%TEMP%\kuis-update.bat" >nul
  "%TEMP%\kuis-update.bat" __run "%~dp0"
  exit /b
)
cd /d "%~2"

echo.
echo [1/4] Mengambil update terbaru...
git fetch origin
git checkout claude/magical-hopper-52mozk
git pull origin claude/magical-hopper-52mozk
if errorlevel 1 (
  echo.
  echo Gagal mengambil update. Kirim screenshot jendela ini.
  pause
  exit /b 1
)
echo Versi sekarang:
git log --oneline -1

echo.
echo [2/4] Mematikan server lama...
taskkill /IM node.exe /F >nul 2>&1

echo.
echo [3/4] Memasang paket...
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo Gagal npm install. Kirim screenshot jendela ini.
  pause
  exit /b 1
)

echo.
echo [4/4] Menjalankan kuis live. Biarkan jendela ini terbuka selama live.
echo Setelah muncul "tersambung", muat ulang sumber Link di LIVE Studio.
echo.
call npm run live
pause
