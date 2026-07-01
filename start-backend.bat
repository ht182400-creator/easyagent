@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 自动切换 better-sqlite3 为系统 Node 版本（与 Electron 版本分开编译）
node scripts/sqlite3-loader.mjs system
if %ERRORLEVEL% neq 0 (
    echo [WARN] sqlite3 版本切换失败，尝试继续...
)
cd /d "%~dp0packages\server"
rem 设置版本号环境变量（兜底，代码也会从 version.json 动态读取）
for /f "tokens=2 delims=:, " %%v in ('findstr "version" "..\\..\\version.json"') do set EASYAGENT_VERSION=%%~v
echo   EasyAgent Server v%EASYAGENT_VERSION%
rem 引擎选择: 支持 --engine langgraph|legacy 参数，或使用 engine.config.json
rem 优先级: CLI参数 > 环境变量 EASYAGENT_ENGINE > engine.config.json > 默认 legacy
if "%~1"=="" (
    echo   Engine: (来自 engine.config.json / 环境变量 / legacy)
    node dist/index.js
) else (
    echo   Engine: %~1 %~2
    node dist/index.js %*
)
pause
