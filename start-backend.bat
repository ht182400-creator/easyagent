@echo off
chcp 65001 >nul
cd /d "d:\Work_Area\AI\Claude Code  CN"
rem 自动切换 better-sqlite3 为系统 Node 版本（与 Electron 版本分开编译）
node scripts/sqlite3-loader.mjs system
if %ERRORLEVEL% neq 0 (
    echo [WARN] sqlite3 版本切换失败，尝试继续...
)
cd /d "d:\Work_Area\AI\Claude Code  CN\packages\server"
rem 设置版本号环境变量（兜底，代码也会从 version.json 动态读取）
for /f "tokens=2 delims=:, " %%v in ('findstr "version" "..\\..\\version.json"') do set EASYAGENT_VERSION=%%~v
echo   EasyAgent Server v%EASYAGENT_VERSION%
node dist/index.js
pause
