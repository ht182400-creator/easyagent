@echo off
rem ============================================================
rem  共享构建 — core + server tsup（被 build.bat 和 build-web.bat 共用）
rem  目的：消除两套构建流程中的 core/server 重复编译
rem  参考：docs/37_双重构建体系详解_Desktop与Web.md §7.1
rem ============================================================
rem 设置 UTF-8 代码页，防止中文乱码
call :silent chcp 65001
setlocal
cd /d "%~dp0"

echo   [shared] Building core...
call pnpm --filter @easyagent/core exec tsup
if %errorlevel% neq 0 (
    echo   [FAIL] core build failed
    endlocal
    exit /b 1
)

echo   [shared] Building server...
call pnpm --filter @easyagent/server exec tsup
if %errorlevel% neq 0 (
    echo   [FAIL] server build failed
    endlocal
    exit /b 1
)

echo   [shared] Core + Server build OK
endlocal
exit /b 0

rem ============================================================
rem  Helper: 静默执行命令（兼容 PowerShell 启动的 cmd）
rem ============================================================
:silent
%* >nul 2>&1
goto :eof
