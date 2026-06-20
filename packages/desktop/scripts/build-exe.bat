@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo.
echo ============================================
echo   EasyAgent Desktop - 打包 EXE
echo ============================================
echo.
echo [1/3] 构建主进程 (tsup)...
call pnpm exec tsup
if %errorlevel% neq 0 (
    echo [FAIL] 主进程构建失败
    exit /b 1
)
echo [OK] 主进程构建完成
echo.
echo [2/3] 构建渲染进程 (Vite)...
call pnpm exec vite build
if %errorlevel% neq 0 (
    echo [FAIL] 渲染进程构建失败
    exit /b 1
)
echo [OK] 渲染进程构建完成
echo.
echo [3/3] 打包 Electron (electron-builder)...
echo 输出目录: .\release\
echo.
call pnpm exec electron-builder --win --x64
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] 打包失败，错误信息见上方
    exit /b 1
)
echo.
echo ============================================
echo   打包成功！
echo   输出: .\release\
echo ============================================
dir /b "release\*.exe" 2>nul
pause
