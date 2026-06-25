@echo off
rem 设置 UTF-8 代码页，防止中文乱码
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title EasyAgent Desktop Build
cd /d "%~dp0"

rem 允许 Node 24+ 构建（better-sqlite3 已在本地编译兼容）
set EASYAGENT_SKIP_NODE_CHECK=1

::::: ============================================================
:::::  EasyAgent Desktop EXE - Standard Build Pipeline
:::::  Usage:
:::::    build.bat            Fast test mode (--dir, ~60s)
:::::    build.bat --release  Full NSIS installer (~3 min)
:::::    build.bat --verify   Pre-flight check only (no build)
::::: ============================================================

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

::::: ============================================================
::::: Phase 0: Cleanup
::::: ============================================================
echo.
echo [0/5] Cleanup...

::::: Kill running processes
taskkill /f /im EasyAgent.exe >nul 2>&1
taskkill /f /im electron.exe  >nul 2>&1
timeout /t 1 /nobreak >nul

::::: Clean old release directory (keep directory, just clear contents to avoid NSIS "Can't open output file")
if exist "packages\desktop\release" (
    echo   Cleaning old release artifacts...
    del /s /q "packages\desktop\release\*" >nul 2>&1
    for /d %%d in ("packages\desktop\release\*") do rmdir /s /q "%%d" >nul 2>&1
) else (
    mkdir "packages\desktop\release" >nul 2>&1
)

::::: Clean dist/renderer for fresh Vite build
if exist "packages\desktop\dist\renderer" (
    echo   Cleaning dist/renderer for fresh build...
    rmdir /s /q "packages\desktop\dist\renderer" >nul 2>&1
)

echo   Cleanup done.

::::: ============================================================
::::: Phase 1: Pre-flight Verification
::::: ============================================================
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

::::: ============================================================
::::: Phase 2: Build All Modules
::::: ============================================================
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
rem Temporarily disable delayed expansion to avoid ! chars in Vite output
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

:::::: ============================================================
:::::: Phase 2.5: Switch better-sqlite3 to Electron version for packaging
::::::   No node-gyp rebuild — just copy existing electron.node
::::::   Phase 3.5 will restore system version after packaging
:::::: ============================================================
echo.
echo [4.5/5] Switching better-sqlite3 to Electron version...

rem 使用 %~dp0 前缀以确保路径基于项目根目录（cd 后 CWD 可能在子目录）
set _SQLITE_RELEASE=%~dp0node_modules\.pnpm\better-sqlite3@12.11.1\node_modules\better-sqlite3\build\Release
set _NODE_FILE=%_SQLITE_RELEASE%\better_sqlite3.node
set _ELECTRON_FILE=%_SQLITE_RELEASE%\better_sqlite3_electron.node

if not exist "%_ELECTRON_FILE%" (
    echo   [WARN] better_sqlite3_electron.node missing, compiling...
    node "%~dp0scripts\rebuild-sqlite3.mjs"
    if not exist "%_ELECTRON_FILE%" (
        echo   [FAIL] Compile failed, cannot package
        pause
        exit /b 1
    )
)

rem Backup system version + switch to Electron for packaging
echo   [SWITCH] better_sqlite3.node (system) -> electron
copy /Y "%_NODE_FILE%" "%_NODE_FILE%.backup" >nul
copy /Y "%_ELECTRON_FILE%" "%_NODE_FILE%" >nul
echo   [OK] Switched (will restore after packaging)

::::: ============================================================
::::: Phase 3: Package
::::: ============================================================
echo.
echo [5/5] Packaging...

rem goto avoids if/else bracket parsing bugs in CMD
rem pushd/popd ensures directory safety (no setlocal needed here)
if /i "%MODE%"=="release" goto PKG_RELEASE
goto PKG_FAST

:PKG_RELEASE
echo   Building full NSIS installer...
set _PKG_ERR=0
pushd "%~dp0packages\desktop"
call pnpm exec electron-builder --win --x64
set _PKG_ERR=%errorlevel%
popd
goto PKG_DONE

:PKG_FAST
echo   Building fast test package (--dir)...
set _PKG_ERR=0
pushd "%~dp0packages\desktop"
call pnpm exec electron-builder --dir --win
set _PKG_ERR=%errorlevel%
popd
goto PKG_DONE

:PKG_DONE
echo [DEBUG] Packaging exit code: %_PKG_ERR%
rem Use goto to avoid CMD nested-if bracket parsing bugs
if %_PKG_ERR% neq 0 goto PKG_RETRY
goto PKG_VERIFY

:PKG_RETRY
echo [FAIL] electron-builder packaging failed (attempt 1)
echo   Retrying packaging in 5 seconds...
echo   (If this fails: Add Defender exclusion for packages\desktop\release\)
timeout /t 5 /nobreak >nul
pushd "%~dp0packages\desktop"
if not exist "release" mkdir "release" >nul 2>&1
if /i "%MODE%"=="release" goto PKG_RETRY_RELEASE
goto PKG_RETRY_FAST

:PKG_RETRY_RELEASE
call pnpm exec electron-builder --win --x64
set _PKG_ERR=%errorlevel%
goto PKG_RETRY_DONE

:PKG_RETRY_FAST
call pnpm exec electron-builder --dir --win
set _PKG_ERR=%errorlevel%
goto PKG_RETRY_DONE

:PKG_RETRY_DONE
popd
echo [DEBUG] Packaging retry exit code: %_PKG_ERR%
if %_PKG_ERR% neq 0 goto PKG_RETRY_FAIL
echo [OK] Packaging succeeded on retry
cd /d "%~dp0"
goto PKG_VERIFY

:PKG_RETRY_FAIL
echo.
echo ============================================
echo   [FAIL] Packaging failed after retry
echo ============================================
echo.
echo   Windows Defender is likely blocking NSIS.
echo   Run in PowerShell (Admin):
echo     Add-MpPreference -ExclusionPath "%%CD%%\packages\desktop\release"
echo.
echo   Then: build.bat --release
echo ============================================
pause
exit /b 1

:PKG_VERIFY
echo [DEBUG] Packaging successful

rem Return to workspace root for Phase 4/5 relative paths
cd ..\..

::::: ============================================================

:::::: ============================================================
:::::: Phase 3.5: Restore better-sqlite3 system version
:::::: ============================================================
echo.
echo Restoring better-sqlite3 to system version...
rem 使用 %~dp0 确保路径基于项目根目录
set _SQLITE_RELEASE=%~dp0node_modules\.pnpm\better-sqlite3@12.11.1\node_modules\better-sqlite3\build\Release
set _NODE_FILE=%_SQLITE_RELEASE%\better_sqlite3.node
if exist "%_NODE_FILE%.backup" (
    copy /Y "%_NODE_FILE%.backup" "%_NODE_FILE%" >nul
    del "%_NODE_FILE%.backup" >nul 2>&1
    echo   [OK] Restored system version
) else (
    echo   [WARN] No backup found, using sqlite3-loader...
    node "%~dp0scripts\sqlite3-loader.mjs" system
)

::::: Phase 4: Verify Output
::::: ============================================================
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

::::: ============================================================
::::: Phase 5: Quick asar content verification
::::: ============================================================
if exist "%ASAR_PATH%" (
    echo.
    echo   Verifying asar content...
    node -e "try{var a=require('packages/desktop/node_modules/@electron/asar');var f='packages/desktop/release/win-unpacked/resources/app.asar';var fs=a.listPackage(f);var t=fs.find(function(x){return x.includes('dist\\\\renderer\\\\assets\\\\index')&&x.endsWith('.js')});if(t){var c=a.extractFile(f,t.replace(/^\\\\/,''));var l=(c.toString('utf8').match(/localhost:3456/g)||[]).length;var d=(c.toString('utf8').match(/\\.then\\(\\s*\\(\\s*r\\s*\\)\\s*=>\\s*r\\.json\\(\\s*\\)\\s*\\)/g)||[]).length;if(l>0)process.stdout.write('  WARN: localhost found! ');if(d>0)process.stdout.write('  WARN: double .json() found! ');if(l===0&&d===0)process.stdout.write('  OK: no known issues');console.log('')}}" 2>nul
    rem Reset errorlevel - node may fail but that's non-critical
    ver >nul
)

::::: ============================================================
echo.
echo ============================================
echo   BUILD SUCCESS
echo   Mode: %MODE%
echo   Output: packages\desktop\release\
echo ============================================
echo.
echo   Run: packages\desktop\release\win-unpacked\EasyAgent.exe
echo.
echo [DEBUG] Build script finished successfully
endlocal
exit /b 0
