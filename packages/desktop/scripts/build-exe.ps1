$ErrorActionPreference = "Continue"
$desktopDir = Resolve-Path "$PSScriptRoot\.."
Set-Location $desktopDir

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " EasyAgent Desktop - Building EXE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Working dir: $desktopDir"
Write-Host ""

# Run electron-builder and capture output
$output = & pnpm exec electron-builder --win --x64 2>&1
$output | ForEach-Object { Write-Host $_ }

# Check result
$setupExe = Get-ChildItem -Path "release\EasyAgent-*-win-x64.exe" -ErrorAction SilentlyContinue
if ($setupExe) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " BUILD SUCCESS!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "Setup: $($setupExe.FullName)" -ForegroundColor Green
    Write-Host "Size: $([math]::Round($setupExe.Length/1MB, 1)) MB" -ForegroundColor Green
    Write-Host ""
    
    # Also show unpacked
    $unpackedExe = Get-ChildItem -Path "release\win-unpacked\EasyAgent.exe" -ErrorAction SilentlyContinue
    if ($unpackedExe) {
        Write-Host "Unpacked: $($unpackedExe.FullName)" -ForegroundColor Yellow
        Write-Host "Size: $([math]::Round($unpackedExe.Length/1MB, 1)) MB" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host " BUILD FAILED" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
}
