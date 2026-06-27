@echo off
rem 设置 UTF-8 代码页，防止中文乱码
call :silent chcp 65001
setlocal enabledelayedexpansion
title EasyAgent Web Build
cd /d "%~dp0"

rem 允许 Node 24+ 构建
set EASYAGENT_SKIP_NODE_CHECK=1

rem 调试开关：set EASYAGENT_DEBUG=1 启用详细日志
set _DBG=0
if "%EASYAGENT_DEBUG%"=="1" set _DBG=1

::::::: ============================================================
:::::::  EasyAgent Web Dashboard - Standard Build Pipeline
:::::::  Usage:
:::::::    build-web.bat           Fast mode (vite build only, ~20s)
:::::::    build-web.bat --check   Full mode (tsc check + vite, ~50s)
:::::::    build-web.bat --serve   Build + start preview server
:::::::    build-web.bat --clean   Clean dist only
::::::: ============================================================

set MODE=fast
if /i "%~1"=="--check"  set MODE=check
if /i "%~1"=="--fast"   set MODE=fast
if /i "%~1"=="--serve"  set MODE=serve
if /i "%~1"=="--clean"  set MODE=clean

echo.
echo ============================================
echo   EasyAgent Web Dashboard Build Pipeline
echo   Mode: %MODE%
echo   Time: %date% %time%
echo ============================================

::::::: ============================================================
::::::: Phase 0: Cleanup
::::::: ============================================================
echo.
echo [0/3] Cleanup...

rem 清理 web dist 目录
if exist "packages\web\dist" (
    echo   Cleaning web dist...
    rmdir /s /q "packages\web\dist" >nul 2>&1
)
if %_DBG%==1 echo [DEBUG] web dist cleaned

echo   Cleanup done.

if /i "%MODE%"=="clean" (
    echo.
    echo ============================================
    echo   CLEANUP COMPLETE
    echo ============================================
    goto :END
)

::::::: ============================================================
::::::: Phase 1: Build Core (共享代码，Server API 依赖)
::::::: ============================================================
echo.
echo [1/3] Building core + server (shared)...
call "%~dp0build-shared.bat"
if %errorlevel% neq 0 (
    echo [FAIL] Shared build failed
    goto :END_FAIL
)
if %_DBG%==1 echo [DEBUG] core+server build OK

::::::: ============================================================
::::::: Phase 2: Build Web Frontend
::::::: ============================================================
echo [2/3] Building web frontend...

if /i "%MODE%"=="check" (
    echo   - tsc type check...
    call pnpm --filter @easyagent/web exec tsc -- --noEmit
    if %errorlevel% neq 0 (
        echo [FAIL] TypeScript type check failed
        goto :END_FAIL
    )
)

echo   - vite build...
rem 暂时关闭延迟扩展避免 Vite 输出中的 ! 符号被 CMD 解析
setlocal disabledelayedexpansion
call pnpm --filter @easyagent/web exec vite build
if errorlevel 1 (
    endlocal
    echo [FAIL] vite build failed
    goto :END_FAIL
)
endlocal

echo   All modules built.

::::::: ============================================================
::::::: Phase 3: Verify Output
::::::: ============================================================
echo.
echo [3/3] Verifying output...
echo ============================================
echo   VERIFYING OUTPUT
echo ============================================

set HTML_PATH=packages\web\dist\index.html

if exist "%HTML_PATH%" (
    for %%A in ("%HTML_PATH%") do (
        echo   index.html: %%~zA bytes
    )
    for %%F in ("packages\web\dist\assets\*.js") do (
        for %%A in ("%%F") do (
            set /a JS_KB=%%~zA / 1024
            echo   %%~nxF: !JS_KB! KB
        )
    )
    for %%F in ("packages\web\dist\assets\*.css") do (
        for %%A in ("%%F") do (
            set /a CSS_KB=%%~zA / 1024
            echo   %%~nxF: !CSS_KB! KB
        )
    )
) else (
    echo   [WARN] index.html not found! Build may have failed.
    goto :END_FAIL
)

:::::::: Quick content verification
if exist "%HTML_PATH%" (
    echo.
    echo   Verifying HTML content...
    node -e "var fs=require('fs');var h=fs.readFileSync('packages/web/dist/index.html','utf8');var hasRoot=h.includes('id=\"root\"');var hasScript=h.includes('<script');var hasCss=h.includes('.css');if(hasRoot&&hasScript)process.stdout.write('  OK: valid HTML structure');else process.stdout.write('  WARN: HTML structure issue');console.log('')" 2>nul
    ver >nul
)

echo.
echo ============================================
echo   BUILD SUCCESS
echo   Mode: %MODE%
echo   Output: packages\web\dist\
echo ============================================
echo.
echo   Dev server:  cd packages\web ^&^& npx vite
echo   Preview:     cd packages\web ^&^& npx vite preview
echo   Deploy:      静态文件服务指向 packages\web\dist\
echo                (后端 API 需单独启动: pnpm run start:server)
echo.

if %_DBG%==1 echo [DEBUG] Build script finished successfully

if /i "%MODE%"=="serve" (
    echo Starting preview server...
    cd packages\web
    start http://localhost:4173
    call npx vite preview
    cd ..\..
)

goto :END

:END_FAIL
echo.
echo ============================================
echo   BUILD FAILED
echo ============================================
echo.
echo   Check error messages above.
echo   Debug mode: set EASYAGENT_DEBUG=1 ^&^& build-web.bat
echo ============================================
pause

:END
endlocal
exit /b 0

rem ============================================================
rem  Helper: 静默执行命令（兼容 PowerShell 启动的 cmd）
rem ============================================================
:silent
%* >nul 2>&1
goto :eof
