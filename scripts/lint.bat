@echo off
rem EasyAgent ESLint Runner
rem 绕过 pnpm isolated mode 限制，直接调用 .pnpm 中的 eslint

chcp 65001 >nul
setlocal enabledelayedexpansion

rem 寻找 eslint bin 脚本
set ROOT=%~dp0..
set ESLINT_BIN=

for /d %%D in ("%ROOT%\node_modules\.pnpm\eslint@10.*") do (
    if exist "%%D\node_modules\eslint\bin\eslint.js" (
        set ESLINT_BIN=%%D\node_modules\eslint\bin\eslint.js
    )
)

if "%ESLINT_BIN%"=="" (
    echo [ERROR] ESLint not found in pnpm store. Run: pnpm install
    exit /b 1
)

rem 跳过 Node 版本检查
set EASYAGENT_SKIP_NODE_CHECK=1

echo Running ESLint...
node "%ESLINT_BIN%" "%ROOT%" --max-warnings 50 --config "%ROOT%\packages\frontend\eslint.config.cjs" %*

endlocal
