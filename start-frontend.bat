@echo off
chcp 65001 >nul
cd /d "d:\Work_Area\AI\Claude Code  CN\packages\web"
npx vite --port 5173 --host 0.0.0.0
pause
