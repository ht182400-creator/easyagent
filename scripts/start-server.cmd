@echo off
chcp 65001 >nul
rem ================================================================
rem  EasyAgent 生产环境启动器 (Windows)
rem  作用: 激活系统 Node 版 better-sqlite3 → 启动 Server
rem  注意: 绑定 80 端口需要"以管理员身份运行"
rem  用法: 右键 start-server.cmd → 以管理员身份运行
rem ================================================================
cd /d "%~dp0.."

rem 监听配置（如需改端口/地址在此修改）
set PORT=80
set HOST=0.0.0.0

rem 切换到系统 Node 版 better-sqlite3（原生模块必须与运行 Node 的 ABI 一致）
node scripts/sqlite3-loader.mjs system
if %ERRORLEVEL% neq 0 (
    echo [ERROR] better-sqlite3 切换失败，请确认已执行 pnpm install 并成功编译原生模块
    pause
    exit /b 1
)

echo ====================================================
echo  EasyAgent Server 启动中...
echo  HTTP : http://localhost:%PORT%
echo  WS   : ws://localhost:%PORT%/ws
echo  页面 : 通过域名 http://CCCN.fable5.icu 访问
echo ====================================================
node packages/server/dist/index.js
