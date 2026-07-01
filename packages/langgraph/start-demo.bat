@echo off
cd /d "%~dp0"

REM ============ Port config ============
if not defined LANGGRAPH_PORT set LANGGRAPH_PORT=3455

REM ============ Parse mode ============
set MODE=terminal
set SKIP_BUILD=0

:parse_args
if "%1"=="" goto :done_parsing
if "%1"=="--web" (
    set MODE=web
    shift
    goto :parse_args
)
if "%1"=="--skip-build" (
    set SKIP_BUILD=1
    shift
    goto :parse_args
)
shift
goto :parse_args
:done_parsing

if "%MODE%"=="web" (
    echo.
    echo ==================================================
    echo    LangGraph Web UI -- Graph Visualization Panel
    echo ==================================================
) else (
    echo.
    echo ==================================================
    echo    LangGraph Directed Graph Demo Launcher
    echo ==================================================
)
echo.

REM ============ Step 1: Config check ============
echo [1/3] Checking config file
if not exist "langgraph.config.json" (
    echo   ^> langgraph.config.json not found, using defaults (DEBUG)
) else (
    echo   ^> langgraph.config.json found
    findstr /c:"level" langgraph.config.json > nul 2> nul && echo     - Log level configured
    findstr /c:"modules" langgraph.config.json > nul 2> nul && echo     - Module filter configured
)

REM ============ Step 2: Build ============
echo.
echo [2/3] Checking build artifacts
if "%SKIP_BUILD%"=="1" (
    echo   ^> Skipping build (--skip-build)
    goto :run_demo
)
if exist "dist\index.js" (
    echo   ^> dist/index.js exists, skipping build
) else (
    echo   ^> dist/ not found, building
    call pnpm build
    if %errorlevel% neq 0 (
        echo   ^> Build failed, check error messages
        pause
        exit /b %errorlevel%
    )
    echo   ^> Build complete
)

REM ============ Step 3: Run ============
:run_demo
echo.
if "%MODE%"=="web" (
    echo [3/3] Starting Web UI server (http://localhost:%LANGGRAPH_PORT%)
    echo.
    call pnpm demo:web
) else (
    echo [3/3] Starting directed graph demo (terminal mode)
    echo         Usage: start-demo.bat --web  ^(graph panel^)
    echo.
    call pnpm demo
)

if %errorlevel% neq 0 (
    echo.
    echo ==================================================
    echo    [FAIL] Demo failed
    echo ==================================================
    pause
    exit /b %errorlevel%
)

if "%MODE%"=="web" goto :end

echo.
echo ==================================================
echo    [OK] Demo complete
echo ==================================================
echo.
echo   Usage:
echo     - Web graph panel:  start-demo.bat --web
echo     - Terminal mode:    start-demo.bat
echo     - Skip build:       start-demo.bat --skip-build
echo     - Edit config:      langgraph.config.json
echo     - Run tests:        pnpm test
echo.
:end
pause
