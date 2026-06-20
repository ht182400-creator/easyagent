@echo off
setlocal enabledelayedexpansion
title EasyAgent Release Publisher
cd /d "%~dp0"

rem ============================================================
rem  EasyAgent Interactive Release Script
rem  Flow: Version bump -> Build EXE -> GitHub Release
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
echo         EasyAgent Release Publisher v1.0
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
echo   [0] skip   (already tagged, build/upload only)
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
        echo   [Auto] Will proceed (release script handles this)
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
    goto :STEP_BUILD
)

echo.
echo -----------------------------------------------------------
echo   Step 3: Version Bump
echo   Type: %RELEASE_TYPE%
echo -----------------------------------------------------------
echo   Will execute:
echo   (1) Update version.json
echo   (2) Sync 6 package.json files
echo   (3) Update CHANGELOG.md
echo   (4) git commit + tag + push
echo -----------------------------------------------------------
echo.

if %AUTO_MODE%==0 (
    set /p CONFIRM_RELEASE="  Run version bump? [Y/n]: "
    if /i not "!CONFIRM_RELEASE!"=="Y" if not "!CONFIRM_RELEASE!"=="" (
        echo   Skipped version bump, proceeding to build...
        goto :STEP_BUILD
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
echo [DEBUG A] errorlevel=%errorlevel%
if errorlevel 1 goto :BUILD_FAILED
goto :BUILD_OK

:BUILD_FAILED
echo.
echo   [FAIL] Build failed (errorlevel=%errorlevel%)
pause
exit /b 1

:BUILD_OK
echo [DEBUG B] Build OK, proceeding to Step 5
echo   [OK] Build complete

rem Show output files
echo.
echo   --- Build Artifacts ---
if exist "packages\desktop\release\*.exe" (
    for %%F in ("packages\desktop\release\EasyAgent-*.exe") do (
        for %%A in ("%%F") do (
            set /a FILE_MB=%%~zA / 1048576
            echo   [OK] %%~nxF  (!FILE_MB! MB)
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
echo   [2] GitHub Token + curl (semi-auto)
echo   [3] Manual upload (open browser)
echo   [0] Skip, handle later
echo -----------------------------------------------------------
echo.

if %AUTO_MODE%==1 (
    set UPLOAD_CHOICE=3
    goto :SKIP_UPLOAD_CHOICE
)

:ASK_UPLOAD
set /p UPLOAD_CHOICE="  Choose [1/2/3/0]: "
if "!UPLOAD_CHOICE!"=="" set UPLOAD_CHOICE=3

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
    set /p GH_FALLBACK="  Fallback to manual upload? [Y/n]: "
    if /i not "!GH_FALLBACK!"=="Y" if not "!GH_FALLBACK!"=="" goto :ASK_UPLOAD
    goto :UPLOAD_MANUAL
)

rem Get version for tag
for /f "tokens=2 delims=:," %%a in ('type version.json ^| findstr "version"') do set TAG_VERSION=v%%~a

rem Check if tag exists
git rev-parse "!TAG_VERSION!" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] Tag !TAG_VERSION! exists
) else (
    echo   [WARN] Tag !TAG_VERSION! does not exist
    if %AUTO_MODE%==0 (
        set /p TAG_CONT="  Create and push tag? [Y/n]: "
        if /i not "!TAG_CONT!"=="Y" if not "!TAG_CONT!"=="" goto :UPLOAD_MANUAL
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
    goto :DONE
) else (
    echo   [FAIL] GitHub Release creation failed
    echo   Try manual: https://github.com/ht182400-creator/easyagent/releases/new
    pause
    goto :DONE
)

rem --- Method 2: Token + curl ---
:UPLOAD_TOKEN
echo.
echo   --- Token-based Release ---
echo.
echo   Requires GitHub Personal Access Token (classic)
echo   Create at: https://github.com/settings/tokens
echo   Scope needed: repo (full)
echo.

set /p GITHUB_TOKEN="  Enter GitHub Token (hidden input): "

if "!GITHUB_TOKEN!"=="" (
    echo   Token cannot be empty. Falling back to manual...
    goto :UPLOAD_MANUAL
)

rem Get version
for /f "tokens=2 delims=:," %%a in ('type version.json ^| findstr "version"') do set TAG_VERSION=v%%~a
echo   Target version: !TAG_VERSION!

rem Step 1: Create Release
echo   (1) Creating Release ...
set RELEASE_BODY="Release !TAG_VERSION! - see CHANGELOG.md"

curl -s -X POST ^
    -H "Authorization: token !GITHUB_TOKEN!" ^
    -H "Content-Type: application/json" ^
    -d "{\"tag_name\":\"!TAG_VERSION!\",\"name\":\"EasyAgent !TAG_VERSION!\",\"body\":\"See CHANGELOG.md\",\"draft\":false,\"prerelease\":false}" ^
    "https://api.github.com/repos/ht182400-creator/easyagent/releases" > release_response.json

rem Get upload_url
type release_response.json | findstr "upload_url" >nul
if %errorlevel% neq 0 (
    echo   [FAIL] Release creation failed. Response:
    type release_response.json
    del release_response.json 2>nul
    goto :UPLOAD_MANUAL
)

echo   [OK] Release created

rem Step 2: Upload files
echo   (2) Uploading artifacts ...

rem Find EXE and blockmap files
for %%F in ("packages\desktop\release\EasyAgent-*.exe") do set EXE_PATH=%%F
for %%F in ("packages\desktop\release\EasyAgent-*.exe.blockmap") do set BLOCKMAP_PATH=%%F

if defined EXE_PATH (
    echo      Uploading: !EXE_PATH!
    rem Extract upload_url from response
    findstr "upload_url" release_response.json > "%TEMP%\_rel_upload_url.tmp" 2>nul
    for /f tokens^=2^ delims^=^" %%a in ('type "%TEMP%\_rel_upload_url.tmp"') do (
        for /f "tokens=1 delims={" %%u in ("%%a") do set UPLOAD_URL=%%u
    )
    del "%TEMP%\_rel_upload_url.tmp" 2>nul
    
    rem Upload EXE
    for %%F in ("!EXE_PATH!") do (
        curl -s -X POST ^
            -H "Authorization: token !GITHUB_TOKEN!" ^
            -H "Content-Type: application/octet-stream" ^
            --data-binary @"%%F" ^
            "!UPLOAD_URL!?name=%%~nxF"
    )
    
    rem Upload blockmap
    for %%F in ("!BLOCKMAP_PATH!") do (
        curl -s -X POST ^
            -H "Authorization: token !GITHUB_TOKEN!" ^
            -H "Content-Type: application/octet-stream" ^
            --data-binary @"%%F" ^
            "!UPLOAD_URL!?name=%%~nxF"
    )
    
    rem Upload latest.yml
    curl -s -X POST ^
        -H "Authorization: token !GITHUB_TOKEN!" ^
        -H "Content-Type: application/octet-stream" ^
        --data-binary @"packages\desktop\release\latest.yml" ^
        "!UPLOAD_URL!?name=latest.yml"
    
    echo   [OK] Files uploaded
) else (
    echo   [WARN] Build artifacts not found. Build first.
)

del release_response.json 2>nul
goto :DONE

rem --- Method 3: Manual upload ---
:UPLOAD_MANUAL
echo.
echo   --- Manual Upload Guide ---
echo.
rem Get version
for /f "tokens=2 delims=:," %%a in ('type version.json ^| findstr "version"') do set TAG_VERSION=v%%~a
echo   (1) Open browser to:
echo       https://github.com/ht182400-creator/easyagent/releases/new?tag=!TAG_VERSION!
echo.
echo   (2) Drag & drop these files:
echo       packages\desktop\release\EasyAgent-*-win-x64.exe
echo       packages\desktop\release\EasyAgent-*-win-x64.exe.blockmap
echo       packages\desktop\release\latest.yml
echo.
echo   (3) Click "Publish release"
echo.
echo   Press any key to continue...
pause >nul
goto :DONE

rem --- Skip upload ---
:SKIP_UPLOAD
echo   Skipped GitHub Release. Please create it manually later.

rem ============================================================
rem Done
rem ============================================================
:DONE
echo.
echo ============================================================
echo           Release Pipeline Complete
echo ============================================================
echo.

rem Show version info
for /f "tokens=2 delims=:," %%a in ('type version.json ^| findstr "version"') do set FINAL_VERSION=%%~a
echo   Version: v!FINAL_VERSION!
echo   Repository: https://github.com/ht182400-creator/easyagent
echo   Releases: https://github.com/ht182400-creator/easyagent/releases

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
echo   Next steps:
echo   - Verify files are uploaded on GitHub Release page
echo   - Launch old EasyAgent Desktop to test auto-update
echo   - If auto-update works, release is successful
echo -----------------------------------------------------------
echo.
pause
exit /b 0

rem ============================================================
rem Help
rem ============================================================
:HELP
echo.
echo EasyAgent Release Publisher - Usage
echo ------------------------------------
echo.
echo Usage:
echo   release-publish.bat            Interactive mode (recommended)
echo   release-publish.bat --auto      Auto mode (patch, fewer prompts)
echo   release-publish.bat --help      Show this help
echo.
echo Pipeline:
echo   1. Select version bump type (patch/minor/major/custom)
echo   2. Pre-checks (git status, remote connectivity)
echo   3. Version bump (version.json + package.json + CHANGELOG + git push)
echo   4. Build EXE (build.bat --release)
echo   5. Upload to GitHub Release (gh CLI / Token / manual)
echo.
echo Prerequisites:
echo   - Git installed and configured
echo   - Node.js ^>= 18.0.0
echo   - pnpm installed
echo   - GitHub repo connected
echo.
pause
exit /b 0
