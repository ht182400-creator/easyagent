# EasyAgent Release Upload via curl (same as release-publish.bat Option 2)
$ErrorActionPreference = "Stop"
Set-Location "d:\Work_Area\AI\Claude Code  CN"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EasyAgent Release Upload (curl)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Read version
$version = (Get-Content "version.json" | ConvertFrom-Json).version
$tag = "v$version"

# Step 1: Get GitHub Token
Write-Host "[1/3] Getting GitHub Token..." -ForegroundColor Yellow

$token = $null

# Try gh CLI config
$ghHosts = "$env:USERPROFILE\.config\gh\hosts.yml"
if (Test-Path $ghHosts) {
    $content = Get-Content $ghHosts -Raw
    if ($content -match 'oauth_token:\s*(\S+)') {
        $token = $Matches[1]
        Write-Host "  [OK] Token from gh CLI config" -ForegroundColor Green
    }
}

# Try Git Credential Manager
if (-not $token) {
    try {
        $gitCred = "protocol=https`nhost=github.com`n`n" | git credential-manager get 2>$null
        if ($gitCred -match 'password=(\S+)') {
            $token = $Matches[1]
            Write-Host "  [OK] Token from Git Credential Manager" -ForegroundColor Green
        }
    } catch { }
}

# Manual input (hidden)
if (-not $token) {
    Write-Host "  Token not found automatically." -ForegroundColor Yellow
    Write-Host "  Create: https://github.com/settings/tokens (scope: repo)" -ForegroundColor DarkGray
    $secureToken = Read-Host -Prompt "  GitHub Token" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
}

if (-not $token) {
    Write-Host "  [FAIL] No token provided" -ForegroundColor Red
    Read-Host "Press any key to exit"
    exit 1
}

# Step 2: Create GitHub Release
Write-Host "[2/3] Creating GitHub Release ($tag) ..." -ForegroundColor Yellow

$repo = "ht182400-creator/easyagent"
$apiUrl = "https://api.github.com/repos/$repo/releases"
$body = @{
    tag_name    = $tag
    name        = "EasyAgent $tag"
    body        = "EasyAgent $tag - Release notes: tool group auto-categorization + enable/disable persistence + tool toggle UI"
    draft       = $false
    prerelease  = $false
} | ConvertTo-Json

$response = curl.exe -s -X POST `
    -H "Authorization: token $token" `
    -H "Content-Type: application/json" `
    -d $body `
    $apiUrl 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] curl request failed" -ForegroundColor Red
    Write-Host $response
    Read-Host "Press any key to exit"
    exit 1
}

# Parse upload_url from response
if ($response -notmatch '"upload_url"\s*:\s*"([^"]+)"') {
    Write-Host "  [FAIL] Release creation failed. Response:" -ForegroundColor Red
    Write-Host $response
    Read-Host "Press any key to exit"
    exit 1
}
$uploadUrl = ($Matches[1] -replace '\{\?.*\}', '')
Write-Host "  [OK] Release created" -ForegroundColor Green

# Step 3: Upload files
Write-Host "[3/3] Uploading artifacts..." -ForegroundColor Yellow

$releaseDir = "packages\desktop\release"
$exeFile = Get-ChildItem "$releaseDir\EasyAgent-*-win-x64.exe" | Select-Object -First 1
$blockmapFile = Get-ChildItem "$releaseDir\EasyAgent-*-win-x64.exe.blockmap" | Select-Object -First 1
$ymlFile = "$releaseDir\latest.yml"

# Upload EXE
if ($exeFile) {
    $sizeMB = [math]::Round($exeFile.Length/1MB, 2)
    Write-Host "  Uploading: $($exeFile.Name) ($sizeMB MB) ..."
    curl.exe -s -X POST `
        -H "Authorization: token $token" `
        -H "Content-Type: application/octet-stream" `
        --data-binary "@$($exeFile.FullName)" `
        "$uploadUrl`?name=$($exeFile.Name)" > $null 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] EXE uploaded" -ForegroundColor Green }
    else { Write-Host "  [FAIL] EXE upload failed" -ForegroundColor Red }
} else {
    Write-Host "  [WARN] EXE file not found" -ForegroundColor Yellow
}

# Upload blockmap
if ($blockmapFile) {
    Write-Host "  Uploading: $($blockmapFile.Name) ..."
    curl.exe -s -X POST `
        -H "Authorization: token $token" `
        -H "Content-Type: application/octet-stream" `
        --data-binary "@$($blockmapFile.FullName)" `
        "$uploadUrl`?name=$($blockmapFile.Name)" > $null 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] blockmap uploaded" -ForegroundColor Green }
    else { Write-Host "  [FAIL] blockmap upload failed" -ForegroundColor Red }
}

# Upload latest.yml
if (Test-Path $ymlFile) {
    Write-Host "  Uploading: latest.yml ..."
    curl.exe -s -X POST `
        -H "Authorization: token $token" `
        -H "Content-Type: application/octet-stream" `
        --data-binary "@$ymlFile" `
        "$uploadUrl`?name=latest.yml" > $null 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] latest.yml uploaded" -ForegroundColor Green }
    else { Write-Host "  [FAIL] latest.yml upload failed" -ForegroundColor Red }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Upload complete!" -ForegroundColor Green
Write-Host "  https://github.com/ht182400-creator/easyagent/releases/tag/$tag" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green

Read-Host "`nPress any key to exit"
