@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat"
if %ERRORLEVEL% neq 0 (
    echo vcvars64.bat FAILED
    exit /b 1
)
cd /d "D:\Work_Area\AI\Claude Code  CN\node_modules\.pnpm\better-sqlite3@12.11.1\node_modules\better-sqlite3"
"D:\Program Files\nodejs\node.exe" "D:\Work_Area\AI\Claude Code  CN\node_modules\.pnpm\node_modules\node-gyp\bin\node-gyp.js" rebuild
