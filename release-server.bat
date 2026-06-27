@echo off
rem 设置 UTF-8 代码页，防止中文乱码
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title EasyAgent Server Release (CI/CD)
cd /d "%~dp0"

rem ============================================================
rem  EasyAgent 服务器端发布脚本 v1.0
rem
rem  功能: 版本升级 → 更新 CHANGELOG → Git 提交+打标签+推送
rem        推送标签后自动触发 GitHub Actions CI/CD 流水线
rem        CI/CD 会自动构建 Desktop EXE + Web Dashboard 并发布到 Release
rem
rem  用法:
rem    release-server.bat                 交互式模式 (推荐)
rem    release-server.bat --auto         自动模式 (默认 patch 升级)
rem    release-server.bat --help         显示帮助
rem
rem  前提条件:
rem    - Git 已安装并配置
rem    - Node.js >= 18.0.0
rem    - 已连接 GitHub 远程仓库
rem    - CHANGELOG.md 已手动编写 (或使用 --auto 自动生成)
rem ============================================================

set AUTO_MODE=0
if /i "%~1"=="--auto"   set AUTO_MODE=1
if /i "%~1"=="--help"   goto :HELP

cls

echo.
echo ============================================================
echo    EasyAgent Server Release (CI/CD Mode) v1.0
echo ============================================================
echo.
echo   模式: 本地仅执行版本升级 + Git 推送
echo   构建: 由 GitHub Actions 自动完成 (约 5-10 分钟)
echo   前提: 需要 .github/workflows/release.yml 已配置
echo.
echo   发布地址: https://github.com/ht182400-creator/easyagent/releases
echo   CI 状态:  https://github.com/ht182400-creator/easyagent/actions
echo ============================================================

rem ============================================================
rem Step 0: 环境检查
rem ============================================================
echo.
echo -----------------------------------------------------------
echo   [Step 0] 环境检查
echo -----------------------------------------------------------

rem 检查 Git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Git 未找到！请先安装 Git。
    pause & exit /b 1
)
echo   [OK] Git 已安装

rem 检查 Node
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js 未找到！请先安装 Node.js。
    pause & exit /b 1
)
echo   [OK] Node.js 已安装

rem 检查远程仓库连接
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] 未配置 git remote origin！
    pause & exit /b 1
)
echo   [OK] 远程仓库已配置

rem 检查远程连通性
echo   检查远程仓库连通性...
git ls-remote origin HEAD >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] 无法连接到远程仓库！请检查网络。
    pause & exit /b 1
)
echo   [OK] 远程仓库可连接

rem 检查 release.yml 是否存在 (CI/CD 流水线)
if exist ".github\workflows\release.yml" (
    echo   [OK] CI/CD 流水线配置已就绪 (.github/workflows/release.yml^)
) else (
    echo   [WARN] 未找到 .github/workflows/release.yml
    echo         推送标签后不会触发自动构建！
    echo         本脚本仅执行版本升级和 Git 推送，
    echo         构建和发布需要手动完成 或 补充 release.yml。
)

echo.
echo   [OK] 环境检查通过

rem ============================================================
rem Step 1: 读取当前版本
rem ============================================================
echo.
echo -----------------------------------------------------------
echo   [Step 1] 读取当前版本
echo -----------------------------------------------------------

rem 从 version.json 读取
for /f "tokens=2 delims=:," %%a in ('type version.json ^| findstr "version"') do (
    set CURRENT=%%~a
    goto :VER_GOT
)
:VER_GOT
set CURRENT=%CURRENT:"=%
for /f "tokens=* delims= " %%s in ("%CURRENT%") do set CURRENT=%%s

echo   当前版本: %CURRENT%

rem 解析版本
for /f "tokens=1,2,3 delims=." %%a in ("%CURRENT%") do (
    set MJ=%%a
    set MN=%%b
    set PT=%%c
)
set /a NEXT_PT=%PT%+1
set /a NEXT_MN=%MN%+1
set /a NEXT_MJ=%MJ%+1

echo.
echo   可用升级选项:
echo     [1] patch (Bug修复)   → %MJ%.%MN%.%NEXT_PT%
echo     [2] minor (新功能)    → %MJ%.%NEXT_MN%.0
echo     [3] major (重大更新)  → %NEXT_MJ%.0.0
echo     [4] custom (自定义)   → 手动输入版本号
echo.

rem ============================================================
rem Step 2: 选择版本号
rem ============================================================
if %AUTO_MODE%==1 (
    set NEW_VERSION=%MJ%.%MN%.%NEXT_PT%
    echo   [Auto] 使用 patch 升级: %CURRENT% → !NEW_VERSION!
    goto :VER_DONE
)

:ASK_TYPE
set /p TYPE_CHOICE="  选择 [1/2/3/4，默认=1]: "
if "!TYPE_CHOICE!"=="" set TYPE_CHOICE=1

if "!TYPE_CHOICE!"=="1" set NEW_VERSION=%MJ%.%MN%.%NEXT_PT% & goto :VER_DONE
if "!TYPE_CHOICE!"=="2" set NEW_VERSION=%MJ%.%NEXT_MN%.0        & goto :VER_DONE
if "!TYPE_CHOICE!"=="3" set NEW_VERSION=%NEXT_MJ%.0.0            & goto :VER_DONE
if "!TYPE_CHOICE!"=="4" goto :CUSTOM_VER
echo   无效选项，请重新选择！
goto :ASK_TYPE

:CUSTOM_VER
set /p CUSTOM_VER="  输入版本号 (x.y.z): "
echo !CUSTOM_VER! | findstr /r "^[0-9]\+\.[0-9]\+\.[0-9]\+$" >nul
if %errorlevel% neq 0 (
    echo   格式错误！请使用 x.y.z 格式 (如 0.6.2)
    goto :CUSTOM_VER
)
set NEW_VERSION=!CUSTOM_VER!

:VER_DONE
echo.
echo -----------------------------------------------------------
echo   版本升级确认
echo -----------------------------------------------------------
echo   当前版本:   %CURRENT%
echo   目标版本:   !NEW_VERSION!
echo   Git 标签:   v!NEW_VERSION!
echo.
echo   执行步骤:
echo     (1) 更新 version.json → !NEW_VERSION!
echo     (2) 同步版本到 7 个 package.json
echo     (3) 更新 CHANGELOG.md
echo     (4) Git commit + tag v!NEW_VERSION!
echo     (5) Git push origin main + tags
echo     (6) GitHub Actions 自动构建 (约 5-10 分钟)
echo     (7) 自动发布到 GitHub Release
echo -----------------------------------------------------------

if %AUTO_MODE%==0 (
    set /p CONFIRM="  确认执行以上操作？[Y/n]: "
    if /i not "!CONFIRM!"=="Y" if not "!CONFIRM!"=="" (
        echo   已取消。
        pause & exit /b 0
    )
)

rem ============================================================
rem Step 3: 检查 CHANGELOG.md
rem ============================================================
echo.
echo -----------------------------------------------------------
echo   [Step 3] 检查 CHANGELOG.md
echo -----------------------------------------------------------

rem 检查是否存在当前版本的条目
findstr /c:"[%CURRENT%]" CHANGELOG.md >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] 当前版本 %CURRENT% 在 CHANGELOG.md 中已存在
) else (
    echo   [WARN] 当前版本 %CURRENT% 在 CHANGELOG.md 中未找到
    echo          release.mjs 会从最近 git 提交自动生成条目。
)
echo   release.mjs 会将新条目插入到 CHANGELOG.md 顶部。

rem ============================================================
rem Step 4: 执行版本升级 (release.mjs)
rem ============================================================
echo.
echo -----------------------------------------------------------
echo   [Step 4] 执行版本升级
echo -----------------------------------------------------------
echo   运行: node scripts/release.mjs !NEW_VERSION!
echo   ----------------------------------------

node scripts/release.mjs !NEW_VERSION!
set REL_ERR=%errorlevel%

if %REL_ERR% equ 0 goto :RELEASE_OK

:RELEASE_FAIL
echo   ----------------------------------------
echo   [FAIL] 版本升级失败！(退出码: %REL_ERR%)
echo.
echo   常见原因:
echo     1. Git 提交/推送失败 (网络问题或权限不足)
echo     2. 远程仓库与本地冲突 (请先 git pull)
echo     3. version.json 格式异常
echo.
echo   修复后重新运行本脚本即可。
pause
exit /b 1

:RELEASE_OK
echo   ----------------------------------------
echo   [OK] 版本升级 + Git 推送完成！

rem ============================================================
rem Step 5: 验证标签已推送
rem ============================================================
echo.
echo -----------------------------------------------------------
echo   [Step 5] 验证远程标签
echo -----------------------------------------------------------

rem 检查远程标签
git ls-remote origin refs/tags/v!NEW_VERSION! >nul 2>&1
if %errorlevel% neq 0 (
    echo   [WARN] 远程标签 v!NEW_VERSION! 尚未同步，稍后重试...
    echo         如果长时间未出现，请手动: git push origin v!NEW_VERSION!
) else (
    echo   [OK] 远程标签 v!NEW_VERSION! 已推送
)

rem ============================================================
rem Step 6: 提示后续步骤
rem ============================================================
echo.
echo ============================================================
echo    ✅ 本地操作完成！CI/CD 流水线已触发
echo ============================================================
echo.
echo   版本:      v!NEW_VERSION!
echo   状态:      等待 GitHub Actions 构建...
echo   预计耗时:   5-10 分钟
echo.
echo   监控链接:
echo     🔗 CI/CD 进度:  https://github.com/ht182400-creator/easyagent/actions
echo     🔗 Release 页:  https://github.com/ht182400-creator/easyagent/releases
echo.
echo   接下来会发生:
echo     1. GitHub Actions 检测到标签推送 → 自动启动 Release 工作流
echo     2. Windows Runner 构建 Desktop EXE (约 5 分钟)
echo     3. Ubuntu Runner 构建 Web Dashboard (约 2 分钟)
echo     4. 合并产物 → 创建 GitHub Release
echo     5. 上传 4 个 Assets: EXE + blockmap + latest.yml + web-dist.tar.gz
echo.
echo   你什么都不用做了，喝杯咖啡等待即可 ☕
echo   Release 就绪后，Desktop 用户将在 24h 内收到自动更新通知。
echo.
echo ============================================================

rem 询问是否打开 CI 页面
if %AUTO_MODE%==0 (
    echo.
    set /p OPEN_CI="  是否在浏览器中打开 CI/CD 进度页面？[Y/n]: "
    if /i "!OPEN_CI!"=="Y" (
        start https://github.com/ht182400-creator/easyagent/actions
    ) else if "!OPEN_CI!"=="" (
        start https://github.com/ht182400-creator/easyagent/actions
    )
)

echo.
pause
exit /b 0

rem ============================================================
rem 帮助信息
rem ============================================================
:HELP
echo.
echo EasyAgent Server Release (CI/CD Mode) v1.0
echo ============================================================
echo.
echo 用法:
echo   release-server.bat                 交互式模式 (推荐)
echo   release-server.bat --auto          自动模式 (默认 patch 升级, 减少确认)
echo   release-server.bat --help          显示此帮助
echo.
echo 流程:
echo   1. 环境检查 (Git/Node/Remote/CI配置^)
echo   2. 读取当前版本，选择升级类型
echo   3. 检查 CHANGELOG.md
echo   4. 执行: node scripts/release.mjs ^<version^>
echo      - 更新 version.json + 子包 package.json
echo      - 更新 CHANGELOG.md (从 git log 自动生成)
echo      - git commit + tag + push
echo   5. 验证远程标签
echo   6. 提示 CI/CD 监控链接
echo.
echo 与 release-publish.bat 的区别:
echo   release-publish.bat  → 本地构建 EXE + 上传 (需 MSVC + electron-builder^)
echo   release-server.bat   → 仅推送版本标签，由 GitHub Actions 构建 (无需本地环境^)
echo.
echo   详见: docs/38_双通道发布指南_本地vs服务器.md
echo.
pause
exit /b 0
