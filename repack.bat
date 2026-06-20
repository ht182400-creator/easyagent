@echo off
cd /d "%~dp0packages\desktop"
echo Killing electron processes...
taskkill /f /im electron.exe >nul 2>&1
taskkill /f /im EasyAgent.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo Removing old release...
rmdir /s /q release >nul 2>&1
echo Packaging...
call pnpm exec electron-builder --dir --win
if %errorlevel% neq 0 (
    echo [FAIL] Packaging failed
    pause
    exit /b 1
)
echo [OK] Packaging succeeded
pause
