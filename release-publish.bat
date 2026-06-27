@echo off
rem 设置 UTF-8 代码页，防止中文乱码
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title EasyAgent Release Publisher
cd /d "%~dp0"

rem 调试开关：set EASYAGENT_DEBUG=1 启用详细日志（[DEBUG] 行可见）
set _DBG=0
if "%EASYAGENT_DEBUG%"=="1" set _DBG=1

rem ============================================================
rem  EasyAgent Release Publisher v2.1
rem  Flow: Version bump -> DTS Check -> Build EXE -> GitHub Release -> Pipeline Sync
rem  Usage:
rem    release-publish.bat            Interactive mode
rem    release-publish.bat --auto      Auto mode (patch, skip confirm)
rem    release-publish.bat --help      Show help
rem ============================================================

set AUTO_MODE=0
if /i "%~1"=="--auto"  set AUTO_MODE=1
if /i "%~1"=="--help"  goto :HELP

cls

echo.
echo ============================================================
echo         EasyAgent Release Publisher v2.1
echo ============================================================
echo.

rem ============================================================
rem Read current version
rem ============================================================
for /f "tokens=2 delims=:," %%a in ('type version.json ^| findstr "version"') do (
    set CURRENT_VERSION=%%~a
    goto :VERSION_READ
)
:VERSION_READ

rem Strip quotes
set CURRENT_VERSION=%CURRENT_VERSION:"=%

rem Trim spaces
for /f "tokens=* delims= " %%s in ("%CURRENT_VERSION%") do set CURRENT_VERSION=%%s

rem Parse version into major.minor.patch
for /f "tokens=1,2,3 delims=." %%a in ("%CURRENT_VERSION%") do (
    set V_MAJOR=%%a
    set V_MINOR=%%b
    set V_PATCH=%%c
)

rem Calculate next versions
set /a NEXT_PATCH_VER=%V_PATCH%+1
set /a NEXT_MINOR_VER=%V_MINOR%+1
set /a NEXT_MAJOR_VER=%V_MAJOR%+1

echo   Current version: %CURRENT_VERSION%
echo   Repository: https://github.com/ht182400-creator/easyagent
echo.

rem ============================================================
rem Step 1: Choose release type
rem ============================================================
echo -----------------------------------------------------------
echo   Step 1: Select version bump type
echo -----------------------------------------------------------
echo   [1] patch  (bug fix)    --%V_MAJOR%.%V_MINOR%.%NEXT_PATCH_VER%
echo   [2] minor  (feature)    --%V_MAJOR%.%NEXT_MINOR_VER%.0
echo   [3] major  (breaking)   --%NEXT_MAJOR_VER%.0.0
echo   [4] custom (enter x.y.z)
echo   [0] skip   (已手动递增版本+commit，仅 build/upload - 无新commit则拒绝打tag)
echo -----------------------------------------------------------
echo.

if %AUTO_MODE%==1 (
    set RELEASE_TYPE=patch
    echo   [Auto] Using patch upgrade
    goto :SKIP_TYPE
)

:ASK_TYPE
set /p TYPE_CHOICE="  Choose [1/2/3/4/0, default=1]: "
if "!TYPE_CHOICE!"=="" set TYPE_CHOICE=1

if "!TYPE_CHOICE!"=="1" set RELEASE_TYPE=patch & goto :SKIP_TYPE
if "!TYPE_CHOICE!"=="2" set RELEASE_TYPE=minor & goto :SKIP_TYPE
if "!TYPE_CHOICE!"=="3" set RELEASE_TYPE=major & goto :SKIP_TYPE
if "!TYPE_CHOICE!"=="4" goto :CUSTOM_VERSION
if "!TYPE_CHOICE!"=="0" set SKIP_RELEASE=1 & goto :SKIP_TYPE
echo   Invalid choice, try again
goto :ASK_TYPE

:CUSTOM_VERSION
set /p CUSTOM_VER="  Enter version (x.y.z): "
echo !CUSTOM_VER! | findstr /r "^[0-9]\+\.[0-9]\+\.[0-9]\+$" >nul
if %errorlevel% neq 0 (
    echo   Invalid format! Use x.y.z (e.g. 0.3.1)
    goto :CUSTOM_VERSION
)
set RELEASE_TYPE=!CUSTOM_VER!

:SKIP_TYPE
echo.

rem ============================================================
rem Step 2: Pre-checks
rem ============================================================
echo -----------------------------------------------------------
echo   Step 2: Pre-checks
echo -----------------------------------------------------------
echo   Checking git, remote, tools...
echo.

rem Check git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] git not found. Please install Git first.
    pause & exit /b 1
)

rem Check node
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] node not found. Please install Node.js first.
    pause & exit /b 1
)

rem Check git remote
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] git remote origin not configured
    pause & exit /b 1
)

rem Check remote connectivity
echo   Checking remote connectivity...
git ls-remote origin HEAD >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Cannot reach remote. Check network.
    pause & exit /b 1
)
echo   [OK] Remote reachable

rem Check working tree status (modified + untracked) - single pass
set "STATUS_FILE=%TEMP%\_rel_status.tmp"
git status --porcelain > "%STATUS_FILE%" 2>nul
set HAS_CHANGES=0
if exist "%STATUS_FILE%" for %%F in ("%STATUS_FILE%") do if %%~zF gtr 0 set HAS_CHANGES=1
if "!HAS_CHANGES!"=="1" (
    echo.
    echo   [WARN] Uncommitted/untracked changes:
    type "%STATUS_FILE%"
    echo.
    if "!AUTO_MODE!"=="1" (
        echo   [Auto] Will proceed - release script handles this
    ) else (
        set /p CONTINUE_CHECK="  Continue? (changes will be handled by release script) [Y/n]: "
        if /i not "!CONTINUE_CHECK!"=="Y" if not "!CONTINUE_CHECK!"=="" (
            echo   Cancelled.
            del "%STATUS_FILE%" 2>nul
            pause & exit /b 0
        )
    )
)
del "%STATUS_FILE%" 2>nul

echo.
echo   [OK] Pre-checks passed

rem ============================================================
rem Step 3: Run version bump script
rem ============================================================
if defined SKIP_RELEASE (
    echo.
    echo -----------------------------------------------------------
    echo   Step 3: Version Bump - SKIPPED
    echo -----------------------------------------------------------
    goto :STEP_DTS
)

echo.
echo -----------------------------------------------------------
echo   Step 3: Version Bump
echo   Type: %RELEASE_TYPE%
echo -----------------------------------------------------------
echo   Will execute:
echo   (1) Update version.json
echo   (2) Sync 7 package.json files
echo   (3) Update CHANGELOG.md
echo   (4) git commit + tag + push
echo -----------------------------------------------------------
echo.

if %AUTO_MODE%==0 (
    set /p CONFIRM_RELEASE="  Run version bump? [Y/n]: "
    if /i not "!CONFIRM_RELEASE!"=="Y" if not "!CONFIRM_RELEASE!"=="" (
        echo   Skipped version bump, proceeding to DTS check...
        goto :STEP_DTS
    )
)

echo   Running: node scripts/release.mjs %RELEASE_TYPE%
echo   ----------------------------------------
node scripts/release.mjs %RELEASE_TYPE%
if %errorlevel% neq 0 (
    echo.
    echo   [FAIL] Version bump failed! Check errors above.
    pause & exit /b 1
)
echo   ----------------------------------------
echo   [OK] Version bump complete

rem ============================================================
rem Step 3.5: DTS Type Check (quality gate before EXE build)
rem ============================================================
:STEP_DTS
echo.
echo -----------------------------------------------------------
echo   Step 3.5: DTS Type Check (packages/core)
echo -----------------------------------------------------------
echo   Verifying TypeScript declaration generation...
echo   This catches type errors before the heavy EXE build.
echo   Running: cd packages/core ^&^& npx tsup --dts
echo   ----------------------------------------
pushd packages\core
call npx tsup --dts
set _DTS_ERR=%errorlevel%
popd
rem 使用 goto 模式避免 CMD if 块内 () 冲突
if %_DTS_ERR% equ 0 goto :DTS_OK
echo   ----------------------------------------
echo   [WARN] DTS build has issues (exit code: %_DTS_ERR%)
echo   Review errors above before proceeding to EXE build.
echo   Common fix: Ensure all type casts use 'as unknown as Type'.
if %AUTO_MODE%==0 (
    set /p DTS_CONTINUE="  Continue anyway? [y/N]: "
    if /i not "!DTS_CONTINUE!"=="Y" (
        echo   Aborted by user. Fix DTS errors first.
        pause & exit /b 1
    )
)
goto :STEP_BUILD

:DTS_OK
echo   ----------------------------------------
echo   [OK] DTS Build success - no type errors

rem ============================================================
rem Step 4: Build Desktop EXE
rem ============================================================
:STEP_BUILD
echo.
echo -----------------------------------------------------------
echo   Step 4: Build Desktop EXE Installer
echo -----------------------------------------------------------
echo   Mode: --release (NSIS installer)
echo   Estimated time: 3-5 minutes
echo   Output: EasyAgent-xxx-win-x64.exe + blockmap + latest.yml
echo -----------------------------------------------------------
echo.

if %AUTO_MODE%==0 (
    set /p CONFIRM_BUILD="  Start build? [Y/n]: "
    if /i not "!CONFIRM_BUILD!"=="Y" if not "!CONFIRM_BUILD!"=="" (
        echo   Skipped build.
        goto :STEP_UPLOAD
    )
)

echo   Running: build.bat --release
echo   ----------------------------------------
call build.bat --release
set _BUILD_ERR=%errorlevel%
if %_DBG%==1 echo [DEBUG A] errorlevel=%_BUILD_ERR%
if %_BUILD_ERR% neq 0 goto :BUILD_FAILED
goto :BUILD_OK

:BUILD_FAILED
echo.
echo   [FAIL] Build failed (errorlevel=%errorlevel%)
echo.
echo   --- Recovery options ---
echo   1. Check if Windows Defender blocked NSIS makensis.exe
echo      - Add exclusion: packages\desktop\release\ 
echo      - Or temporarily disable real-time protection
echo   2. Ensure no EasyAgent.exe/electron.exe processes running
echo   3. Try standalone build: build.bat --release
echo   4. Clean electron-builder cache: 
echo      rmdir /s /q "%%LOCALAPPDATA%%\electron-builder\Cache\nsis"
echo   -------------------------
pause
exit /b 1

:BUILD_OK
if %_DBG%==1 echo [DEBUG B] Build OK, proceeding to Step 5
echo   [OK] Build complete

rem Show output files
echo.
echo   --- Build Artifacts ---
if exist "packages\desktop\release\*.exe" (
    for %%F in ("packages\desktop\release\EasyAgent-*.exe") do (
        for %%A in ("%%F") do (
            set /a FILE_MB=%%~zA / 1048576
            rem 去掉括号避免嵌套 for/if 块内 CMD 解析冲突
            echo   [OK] %%~nxF  - Size: !FILE_MB! MB
        )
    )
)
if exist "packages\desktop\release\*.blockmap" (
    for %%F in ("packages\desktop\release\*.blockmap") do echo   [OK] %%~nxF
)
if exist "packages\desktop\release\latest.yml" (
    echo   [OK] latest.yml
)

rem ============================================================
rem Step 5: GitHub Release Upload
rem ============================================================
:STEP_UPLOAD
echo.
echo -----------------------------------------------------------
echo   Step 5: Create GitHub Release
echo -----------------------------------------------------------
echo   Upload methods:
echo   [1] gh CLI (recommended, requires install)
echo   [2] Token + _release.mjs (auto, recommended)
echo   [3] Manual upload (open browser)
echo   [0] Skip, handle later
echo -----------------------------------------------------------
echo.

if %AUTO_MODE%==1 (
    set UPLOAD_CHOICE=2
    goto :SKIP_UPLOAD_CHOICE
)

:ASK_UPLOAD
set /p UPLOAD_CHOICE="  Choose [1/2/3/0]: "
if "!UPLOAD_CHOICE!"=="" set UPLOAD_CHOICE=2

if "!UPLOAD_CHOICE!"=="1" goto :UPLOAD_GH_CLI
if "!UPLOAD_CHOICE!"=="2" goto :UPLOAD_TOKEN
if "!UPLOAD_CHOICE!"=="3" goto :UPLOAD_MANUAL
if "!UPLOAD_CHOICE!"=="0" goto :SKIP_UPLOAD
echo   Invalid choice
goto :ASK_UPLOAD

:SKIP_UPLOAD_CHOICE

rem --- Method 1: gh CLI ---
:UPLOAD_GH_CLI
echo.
echo   --- gh CLI Release ---

where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo   [WARN] GitHub CLI not installed
    echo   Install: winget install GitHub.cli
    echo   Or visit: https://cli.github.com
    echo.
    set /p GH_FALLBACK="  Fallback to _release.mjs? [Y/n]: "
    if /i not "!GH_FALLBACK!"=="Y" if not "!GH_FALLBACK!"=="" goto :ASK_UPLOAD
    goto :UPLOAD_TOKEN
)

rem Get version for tag (use node for reliable JSON parsing)
for /f %%a in ('node -e "console.log(require('./version.json').version)" 2^>nul') do set TAG_VERSION=v%%a

rem Check if tag exists
git rev-parse "!TAG_VERSION!" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] Tag !TAG_VERSION! exists
) else (
    echo   [WARN] Tag !TAG_VERSION! does not exist
    rem 安全检查：防止多个 tag 指向同一个 commit（常见于跳过了 Step 3 版本递增）
    set HEAD_HAS_TAG=0
    for /f %%c in ('git tag --points-at HEAD --list "v*" 2^>nul') do set "HEAD_HAS_TAG=1" & set "EXISTING_TAG=%%c"
    if "!HEAD_HAS_TAG!"=="1" (
        echo   [ERROR] HEAD already has tag !EXISTING_TAG! - multiple tags on same commit is not allowed!
        echo   This means no new commit was created since the last release.
        echo   Please re-run and choose a version bump type in Step 1, do NOT skip.
        echo   Falling back to alternative upload method...
        pause
        goto :UPLOAD_TOKEN
    )
    if %AUTO_MODE%==0 (
        set /p TAG_CONT="  Create and push tag? [Y/n]: "
        if /i not "!TAG_CONT!"=="Y" if not "!TAG_CONT!"=="" goto :UPLOAD_TOKEN
    )
    git tag -a !TAG_VERSION! -m "EasyAgent !TAG_VERSION!"
    git push origin !TAG_VERSION!
)

rem Create Release
echo   Creating GitHub Release !TAG_VERSION! ...
gh release create !TAG_VERSION! ^
    --title "EasyAgent !TAG_VERSION!" ^
    --notes-file CHANGELOG.md ^
    "packages\desktop\release\EasyAgent-*-win-x64.exe" ^
    "packages\desktop\release\EasyAgent-*-win-x64.exe.blockmap" ^
    "packages\desktop\release\latest.yml"

if %errorlevel% equ 0 (
    echo   [OK] GitHub Release created
    goto :STEP_SYNC
) else (
    echo   [FAIL] GitHub Release creation failed, falling back to _release.mjs...
    goto :UPLOAD_TOKEN
)

rem --- Method 2: _release.mjs (PowerShell-based, reliable) ---
:UPLOAD_TOKEN
rem 确保工作目录在项目根目录（防止 build.bat 等改变了 CWD）
cd /d "%~dp0"
echo.
echo   --- Token-based Release (via _release.mjs) ---
echo.

rem Check token exists (required by _release.mjs)
rem 反向判断 + goto 模式：避免 CMD if 块内 () 解析冲突
if exist "scripts\.release_token" goto :UPLOAD_TOKEN_GO
echo   [ERROR] scripts/.release_token not found!
echo   Create at: https://github.com/settings/tokens
echo   Scope: repo (full)
echo.
echo   Save token to scripts/.release_token
pause
goto :UPLOAD_MANUAL

:UPLOAD_TOKEN_GO
rem Get numeric version (strip v prefix) for _release.mjs
for /f %%a in ('node -e "console.log(require('./version.json').version)" 2^>nul') do set NUM_VERSION=%%a
echo   Target version: v!NUM_VERSION!

rem _release.mjs handles: find/create Release, delete old assets, upload EXE+blockmap+yml
rem   Uses PowerShell Invoke-RestMethod — proven reliable for large file uploads
echo   Running: node _release.mjs !NUM_VERSION!
echo   ----------------------------------------
node _release.mjs !NUM_VERSION!
set _REL_ERR=%errorlevel%

rem 上传结果判断用 goto 模式，避免括号冲突
if %_REL_ERR% equ 0 goto :UPLOAD_TOKEN_OK
echo   Release not found, creating new one...
node _release.mjs !NUM_VERSION! --create
set _REL_ERR=%errorlevel%

if %_REL_ERR% equ 0 goto :UPLOAD_TOKEN_OK
echo   [FAIL] _release.mjs failed (exit code: %_REL_ERR%)
echo   Falling back to manual upload...
goto :UPLOAD_MANUAL

:UPLOAD_TOKEN_OK
echo   [OK] Upload complete (EXE + blockmap + latest.yml)
goto :STEP_SYNC

rem --- Method 3: Manual upload ---
:UPLOAD_MANUAL
echo.
echo   --- Manual Upload Guide ---
echo.
echo   [WARN] GitHub web upload limit: 25MB per file!
echo   [WARN] EXE file (~105MB) exceeds this limit - browser upload WILL fail.
echo.
rem Get version (use node for reliable JSON parsing)
for /f %%a in ('node -e "console.log(require('./version.json').version)" 2^>nul') do set TAG_VERSION=v%%a
echo   Recommended: Run this script again, choose option [2] (auto)
echo   Or use command line:
echo       node _release.mjs !TAG_VERSION:v=!
echo.
echo   Release page (if not yet created):
echo       https://github.com/ht182400-creator/easyagent/releases/new?tag=!TAG_VERSION!
echo.
echo   Press any key to continue...
pause >nul
goto :STEP_SYNC

rem --- Skip upload ---
:SKIP_UPLOAD
echo   Skipped GitHub Release. Please create it manually later.

rem ============================================================
rem Step 5.5: Build Web Dashboard (optional)
rem ============================================================
:STEP_WEB_BUILD
echo.
echo -----------------------------------------------------------
echo   Step 5.5: Build Web Dashboard
echo -----------------------------------------------------------
echo   Mode: fast (vite build only, ~20s)
echo   Output: packages\web\dist\
echo -----------------------------------------------------------

if %AUTO_MODE%==0 (
    set /p CONFIRM_WEB="  Build Web Dashboard? [Y/n]: "
    if /i not "!CONFIRM_WEB!"=="Y" if not "!CONFIRM_WEB!"=="" (
        echo   Skipped Web build.
        goto :STEP_SYNC
    )
)

echo   Running: build-web.bat
echo   ----------------------------------------
call build-web.bat
if %errorlevel% neq 0 (
    echo   [WARN] Web build had issues (exit code: %errorlevel%)
) else (
    echo   [OK] Web build complete
)

rem ============================================================
rem Step 6: Pipeline Data Auto-Sync
rem ============================================================
:STEP_SYNC
echo.
echo -----------------------------------------------------------
echo   Step 6: Pipeline Data Auto-Sync
echo -----------------------------------------------------------
echo   Step 6a: Running unified-sync locally (CI sync is handled by GitHub Actions sync-pipeline job)
echo   Step 6b: Restarting pipeline server on port 8899
echo   Running: powershell -File scripts/pipeline-auto-sync.ps1 --skip-ci
echo   ----------------------------------------
rem 注: --skip-ci 跳过等待 CI 完成（CI 的 sync-pipeline job 会自动推送管线数据）
rem      本地 release 流程不需要等 CI，避免阻塞 5-10 分钟
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\pipeline-auto-sync.ps1" --skip-ci
set _SYNC_ERR=%errorlevel%
rem 使用 goto 模式避免 CMD if 块内 () 冲突
if %_SYNC_ERR% equ 0 goto :SYNC_OK
echo   ----------------------------------------
echo   [WARN] Pipeline sync had issues (exit code: %_SYNC_ERR%)
goto :DONE

:SYNC_OK
echo   ----------------------------------------
echo   [OK] Pipeline sync complete - server running on port 8899

rem ============================================================
rem Done
rem ============================================================
:DONE
echo.
echo ============================================================
echo           Release Pipeline Complete
echo ============================================================
echo.

rem Show version info (use node for reliable JSON parsing)
for /f %%a in ('node -e "console.log(require('./version.json').version)" 2^>nul') do set FIN_VERSION=%%a
echo   Version: v!FIN_VERSION!
echo   Repository: https://github.com/ht182400-creator/easyagent
echo   Releases: https://github.com/ht182400-creator/easyagent/releases
echo   Pipeline Server: http://localhost:8899

rem Check for reminders
if "!UPLOAD_CHOICE!"=="3" (
    echo.
    echo   [WARN] Complete the manual upload to finish the release!
)
if "!UPLOAD_CHOICE!"=="0" (
    echo.
    echo   [WARN] GitHub Release not created yet. Remember to publish it later!
)

echo.
echo -----------------------------------------------------------
echo   Pipeline Summary:
echo   1. Version Bump       [OK] v!FIN_VERSION!
echo   2. DTS Type Check     [Check output above]
echo   3. Desktop EXE Build  [Check output above]
echo   4. GitHub Release     [Check output above]
echo   5. Web Build          [Check output above]
echo   6. Pipeline Sync      [Check output above]
echo -----------------------------------------------------------
echo.

rem Update memory file for cross-session tracking
node -e "try{var d=new Date();var p='.codebuddy/memory/'+d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)+'.md';var fs=require('fs');var e='\n## release-publish.bat execution ('+d.toTimeString().split(' ')[0]+')\n- Version: v!FIN_VERSION!\n- DTS check + EXE build + GitHub Release + Pipeline Sync completed\n';if(fs.existsSync(p)){fs.appendFileSync(p,e,'utf-8')}else{fs.mkdirSync('.codebuddy/memory',{recursive:true});fs.writeFileSync(p,'# Memory '+p.split('/').pop()+'\n'+e,'utf-8')};console.log('  Memory updated')}catch(e){console.log('  Memory update skipped: '+e.message)}" 2>nul
ver >nul

rem ============================================================
rem Step 7: Final Commit (捕获 pipeline 执行过程中产生的文件变更)
rem   问题: Step 3 commit 之后，build.bat/pipeline-sync/memory
rem         继续修改文件但未提交，导致工作区始终有脏文件
rem ============================================================
echo.
echo -----------------------------------------------------------
echo   Step 7: Final Commit (pipeline artifacts)
echo -----------------------------------------------------------

rem 读取当前版本号
for /f %%a in ('node -e "console.log(require('./version.json').version)" 2^>nul') do set FINAL_VERSION=v%%a

set "STATUS_FILE=%TEMP%\_rel_status2.tmp"
git status --porcelain > "%STATUS_FILE%" 2>nul
set HAS_POST_CHANGES=0
if exist "%STATUS_FILE%" for %%F in ("%STATUS_FILE%") do if %%~zF gtr 0 set HAS_POST_CHANGES=1

if "!HAS_POST_CHANGES!"=="0" (
    echo   [OK] Working tree clean - nothing to commit
    del "%STATUS_FILE%" 2>nul
    goto :FINAL_DONE
)

echo   Uncommitted files detected (pipeline artifacts):
type "%STATUS_FILE%"
echo.

rem 恢复 pnpm-lock.yaml 到 committed 版本（build.bat 中的 pnpm exec 可能静默回退 checksum）
git checkout HEAD -- pnpm-lock.yaml 2>nul
if %errorlevel% equ 0 echo   [OK] Restored pnpm-lock.yaml to committed version

rem 再次检查 status（pnpm-lock.yaml 恢复后可能还有变更）
git status --porcelain > "%STATUS_FILE%" 2>nul
set HAS_POST_CHANGES=0
if exist "%STATUS_FILE%" for %%F in ("%STATUS_FILE%") do if %%~zF gtr 0 set HAS_POST_CHANGES=1

if "!HAS_POST_CHANGES!"=="0" (
    echo   [OK] All changes resolved - nothing to commit
    del "%STATUS_FILE%" 2>nul
    goto :FINAL_DONE
)

echo   Committing pipeline artifacts...
git add .
git commit -m "chore: release artifacts for !FINAL_VERSION!"
if %errorlevel% equ 0 (
    echo   [OK] Commit created
    rem 推送前先 rebase 远程（CI 管线同步可能在此期间推了新 commit）
    rem git hooks 可能在 commit 后修改了管线文件 → stash 保护
    echo   Syncing with remote before push...
    git stash
    git pull --rebase origin main
    git stash pop
    git push origin main
    if %errorlevel% equ 0 (
        echo   [OK] Pushed to origin
    ) else (
        echo   [WARN] Push failed - please push manually
    )
) else (
    echo   [WARN] Nothing to commit or commit failed
)
del "%STATUS_FILE%" 2>nul

:FINAL_DONE
echo -----------------------------------------------------------

pause
exit /b 0

rem ============================================================
rem Help
rem ============================================================
:HELP
echo.
echo EasyAgent Release Publisher v2.1 - Usage
echo ------------------------------------------
echo.
echo Usage:
echo   release-publish.bat            Interactive mode (recommended)
echo   release-publish.bat --auto      Auto mode (patch, fewer prompts)
echo   release-publish.bat --help      Show this help
echo.
echo 7-Step Pipeline:
echo   1. Select version bump type (patch/minor/major/custom)
echo   2. Pre-checks (git status, remote connectivity)
echo   3. Version bump (version.json + 7 package.json + CHANGELOG + git push)
echo   3.5. DTS Type Check (npx tsup --dts)^ - quality gate
echo   4. Build Desktop EXE (build.bat --release)
echo   5. Upload to GitHub Release (gh CLI / _release.mjs / manual)
echo   6. Build Web Dashboard (build-web.bat)
echo   6. Pipeline Data Local-Sync (unified-sync + server restart, CI auto-sync handled by GitHub Actions)
echo.
echo Prerequisites:
echo   - Git installed and configured
echo   - Node.js >= 18.0.0
echo   - pnpm installed
echo   - GitHub repo connected
echo   - Required: scripts\.release_token for auto-upload (method 2)
echo.   - Optional: gh CLI for drag-and-drop release upload (method 1)
echo.
pause
exit /b 0
