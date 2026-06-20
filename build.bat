@echo off
setlocal enabledelayedexpansion
title EasyAgent Desktop Build
cd /d "%~dp0"

:: ============================================================
::  EasyAgent Desktop EXE - Standard Build Pipeline
::  Usage:
::    build.bat            Fast test mode (--dir, ~60s)
::    build.bat --release  Full NSIS installer (~3 min)
::    build.bat --verify   Pre-flight check only (no build)
:: ============================================================

set MODE=fast
if /i "%~1"=="--release" set MODE=release
if /i "%~1"=="--fast"   set MODE=fast
if /i "%~1"=="--verify" set MODE=verify

echo.
echo ============================================
echo   EasyAgent Desktop Build Pipeline
echo   Mode: %MODE%
echo   Time: %date% %time%
echo ============================================

:: ============================================================
:: Phase 0: Cleanup
:: ============================================================
echo.
echo [0/5] Cleanup...

:: Kill running processes
taskkill /f /im EasyAgent.exe >nul 2>&1
taskkill /f /im electron.exe  >nul 2>&1
timeout /t 1 /nobreak >nul

:: Clean old release directory
if exist "packages\desktop\release" (
    echo   Removing old release directory...
    rmdir /s /q "packages\desktop\release" >nul 2>&1
)

:: Clean dist/renderer for fresh Vite build
if exist "packages\desktop\dist\renderer" (
    echo   Cleaning dist/renderer for fresh build...
    rmdir /s /q "packages\desktop\dist\renderer" >nul 2>&1
)

echo   Cleanup done.

:: ============================================================
:: Phase 1: Pre-flight Verification
:: ============================================================
echo.
echo [1/5] Pre-flight verification...

node "packages\desktop\scripts\verify-build.cjs"
if %errorlevel% neq 0 (
    echo.
    echo ============================================
    echo   BUILD ABORTED - Fix issues above first!
    echo ============================================
    pause
    exit /b 1
)

if /i "%MODE%"=="verify" (
    echo.
    echo Verification only mode - no build performed.
    pause
    exit /b 0
)

:: ============================================================
:: Phase 2: Build All Modules
:: ============================================================
echo.
echo [2/5] Building core...

cd packages\core
call pnpm exec tsup
if %errorlevel% neq 0 (
    echo [FAIL] core build failed
    cd ..\..
    pause
    exit /b 1
)

echo [3/5] Building server...
cd ..\server
call pnpm exec tsup
if %errorlevel% neq 0 (
    echo [FAIL] server build failed
    cd ..\..
    pause
    exit /b 1
)

echo [4/5] Building desktop...
cd ..\desktop

echo   - tsup (main + preload)...
call pnpm exec tsup
if %errorlevel% neq 0 (
    echo [FAIL] desktop tsup build failed
    cd ..\..
    pause
    exit /b 1
)

echo   - vite (renderer)...
rem 临时关闭延迟展开，避免 vite 输出中的 ! 字符干扰
setlocal disabledelayedexpansion
call pnpm exec vite build
endlocal
if errorlevel 1 (
    echo [FAIL] vite build failed
    cd ..\..
    pause
    exit /b 1
)

echo   All modules built.

:: ============================================================
:: Phase 3: Package
:: ============================================================
echo.
echo [5/5] Packaging...

rem setlocal/endlocal 必须在 if 块外面，否则会扰乱括号解析
setlocal disabledelayedexpansion
if /i "%MODE%"=="release" (
    echo   Building full NSIS installer...
    call pnpm exec electron-builder --win --x64
) else (
    echo   Building fast test package (--dir)...
    call pnpm exec electron-builder --dir --win
)
endlocal
if errorlevel 1 (
    echo [FAIL] electron-builder packaging failed
    cd ..\..
    pause
    exit /b 1
)

cd ..\..

:: ============================================================
:: Phase 4: Verify Output
:: ============================================================
echo.
echo ============================================
echo   VERIFYING OUTPUT
echo ============================================

set EXE_PATH=packages\desktop\release\win-unpacked\EasyAgent.exe
set ASAR_PATH=packages\desktop\release\win-unpacked\resources\app.asar

if exist "%EXE_PATH%" (
    for %%A in ("%EXE_PATH%") do (
        set /a EXE_MB=%%~zA / 1048576
        echo   EasyAgent.exe: !EXE_MB! MB
    )
) else (
    echo   [WARN] EasyAgent.exe not found!
)

if exist "%ASAR_PATH%" (
    for %%A in ("%ASAR_PATH%") do (
        set /a ASAR_KB=%%~zA / 1024
        echo   app.asar: !ASAR_KB! KB
    )
) else (
    echo   [WARN] app.asar not found!
)

if /i "%MODE%"=="release" (
    for %%F in ("packages\desktop\release\EasyAgent-*.exe") do (
        for %%A in ("%%F") do (
            set /a INST_MB=%%~zA / 1048576
            echo   Installer: %%~nxF (!INST_MB! MB)
        )
    )
)

:: ============================================================
:: Phase 5: Quick asar content verification
:: ============================================================
if exist "%ASAR_PATH%" (
    echo.
    echo   Verifying asar content...
    node -e "try{var a=require('packages/desktop/node_modules/@electron/asar');var f='packages/desktop/release/win-unpacked/resources/app.asar';var fs=a.listPackage(f);var t=fs.find(function(x){return x.includes('dist\\\\renderer\\\\assets\\\\index')&&x.endsWith('.js')});if(t){var c=a.extractFile(f,t.replace(/^\\\\/,''));var l=(c.toString('utf8').match(/localhost:3456/g)||[]).length;var d=(c.toString('utf8').match(/\\.then\\(\\s*\\(\\s*r\\s*\\)\\s*=>\\s*r\\.json\\(\\s*\\)\\s*\\)/g)||[]).length;if(l>0)process.stdout.write('  WARN: localhost found! ');if(d>0)process.stdout.write('  WARN: double .json() found! ');if(l===0&&d===0)process.stdout.write('  OK: no known issues');console.log('')}}" 2>nul
)

:: ============================================================
echo.
echo ============================================
echo   BUILD SUCCESS
echo   Mode: %MODE%
echo   Output: packages\desktop\release\
echo ============================================
echo.
echo   Run: packages\desktop\release\win-unpacked\EasyAgent.exe
echo.
pause
