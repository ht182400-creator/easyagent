@echo off
chcp 65001 >nul
cd /d "%~dp0packages\web"
npx vite --port 5173 --host 0.0.0.0
pause
