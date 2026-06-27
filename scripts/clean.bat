@echo off
rem EasyAgent Clean Script (跨平台兼容)
rem 绕过 pnpm isolated mode，使用 rimraf 替代 rm -rf

chcp 65001 >nul
setlocal enabledelayedexpansion

set ROOT=%~dp0..

rem 寻找 rimraf bin
set RIMRAF_BIN=
for /f "delims=" %%D in ('dir /b /ad "%ROOT%\node_modules\.pnpm\rimraf@*" 2^>nul') do (
    if exist "%ROOT%\node_modules\.pnpm\%%D\node_modules\rimraf\dist\esm\bin.mjs" (
        set RIMRAF_BIN=%ROOT%\node_modules\.pnpm\%%D\node_modules\rimraf\dist\esm\bin.mjs
    )
)

if "%RIMRAF_BIN%"=="" (
    echo [ERROR] rimraf not found in pnpm store. Run: pnpm install
    exit /b 1
)

set EASYAGENT_SKIP_NODE_CHECK=1

echo Cleaning build artifacts...

rem 删除各包的 dist 和 node_modules
for %%P in (packages\cli packages\core packages\server packages\desktop packages\frontend packages\web) do (
    if exist "%ROOT%\%%P\dist" (
        echo   Cleaning %%P\dist...
        node "%RIMRAF_BIN%" "%ROOT%\%%P\dist" 2>nul
    )
    if exist "%ROOT%\%%P\node_modules" (
        echo   Cleaning %%P\node_modules...
        node "%RIMRAF_BIN%" "%ROOT%\%%P\node_modules" 2>nul
    )
)

rem 根 node_modules
if exist "%ROOT%\node_modules" (
    echo   Cleaning root node_modules...
    node "%RIMRAF_BIN%" "%ROOT%\node_modules"
)

echo Clean complete.

endlocal
