@echo off
rem ============================================================
rem  快速重打包 — 仅 electron-builder，不做任何编译！
rem  ⚠️ 如果源码已修改，请先运行 build.bat 而不是 repack.bat
rem  适用场景：仅修改了打包配置(如 electron-builder.yml)后验证
rem ============================================================
echo Killing electron processes...
taskkill /f /im electron.exe >nul 2>&1
taskkill /f /im EasyAgent.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo Removing old release...
rmdir /s /q packages\desktop\release >nul 2>&1
echo Packaging (no compilation, reusing existing dist/)...
call pnpm --filter @easyagent/desktop exec electron-builder -- --dir --win
if %errorlevel% neq 0 (
    echo [FAIL] Packaging failed
    pause
    exit /b 1
)
echo [OK] Packaging succeeded
pause
