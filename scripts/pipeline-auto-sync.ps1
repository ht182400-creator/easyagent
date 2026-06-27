# ============================================================
# 管线数据本地同步脚本 (v3.0, 2026-06-26)
# 用途: 等待 CI 完成 → 回取 vitest 报告 → 本地 unified-sync → 重启服务器
# 流程:
#   [1] fetch-ci-data.mjs: 等待 CI 完成 + 下载 vitest artifacts + git pull
#   [2] unified-sync.mjs: 用 CI 报告再生成本地管线数据
#   [3] 重启管线服务器
#   [4] 验证数据一致性
# 使用: powershell -File scripts/pipeline-auto-sync.ps1
#       powershell -File scripts/pipeline-auto-sync.ps1 --skip-ci // 跳过 CI 回取
# ============================================================

# 确保 PowerShell 输出 UTF-8，防止在 CMD 子进程中乱码
[Console]::OutputEncoding = [Text.Encoding]::UTF8

param(
    [switch]$SkipCI,    # 跳过 CI 数据回取（使用本地已有数据）
    [int]$Timeout = 600 # CI 等待超时秒数
)
$ErrorActionPreference = "Continue"
# 设置控制台输出编码为 UTF-8，防止中文乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$WORKSPACE = "d:\Work_Area\AI\Claude Code  CN"
$PIPELINE_DIR = "$WORKSPACE\docs\pipeline"
$SERVER_PORT = 8899

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "管线本地同步开始: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ---- 第 1 步：等待 CI + 回取 vitest 报告 + git pull ----
if ($SkipCI) {
    Write-Host "`n[1/4] 跳过 CI 数据回取 (--skip-ci)" -ForegroundColor Yellow
} else {
    Write-Host "`n[1/4] 等待 CI 完成并回取 vitest 报告..." -ForegroundColor Yellow
    Set-Location $WORKSPACE
    try {
        $ciResult = node scripts/fetch-ci-data.mjs --timeout $Timeout 2>&1
        $ciResult | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    ✅ CI 数据回取完成" -ForegroundColor Green
        } else {
            Write-Host "    ⚠️ CI 回取退出码: $LASTEXITCODE，继续本地同步..." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    ⚠️ CI 数据回取异常: $_，将使用本地 fallback 数据" -ForegroundColor Yellow
    }
}

# ---- 第 2 步：本地运行 unified-sync（用 CI vitest 报告 / 本地 fallback）----
Write-Host "`n[2/4] 运行 unified-sync.mjs 同步本地数据..." -ForegroundColor Yellow
try {
    node scripts/unified-sync.mjs 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    ✅ unified-sync 完成" -ForegroundColor Green
    } else {
        Write-Host "    ⚠️ unified-sync 退出码: $LASTEXITCODE" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    ❌ unified-sync 失败: $_" -ForegroundColor Red
}

# ---- 第 3 步：重启本地管线服务器 ----
Write-Host "`n[3/4] 重启管线服务器 (端口 $SERVER_PORT)..." -ForegroundColor Yellow

$existing = Get-NetTCPConnection -LocalPort $SERVER_PORT -ErrorAction SilentlyContinue
if ($existing) {
    $procId = $existing.OwningProcess
    try {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "    已停止旧进程 (PID: $procId)" -ForegroundColor Gray
    } catch {
        Write-Host "    ⚠️ 无法停止进程 PID:$procId" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 1
}

try {
    $proc = Start-Process -FilePath "node" -ArgumentList "docs/pipeline/server.mjs", $SERVER_PORT `
        -WorkingDirectory $WORKSPACE -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 2
    $check = Get-NetTCPConnection -LocalPort $SERVER_PORT -ErrorAction SilentlyContinue
    if ($check -and $check.State -eq "Listen") {
        Write-Host "    ✅ 服务器运行中 (PID: $($proc.Id), 端口: $SERVER_PORT)" -ForegroundColor Green
    } else {
        Write-Host "    ⚠️ 端口验证未通过" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    ❌ 启动服务器失败: $_" -ForegroundColor Red
}

# ---- 第 4 步：验证数据一致性 ----
Write-Host "`n[4/4] 验证数据一致性..." -ForegroundColor Yellow

try {
    $pd = Get-Content "$PIPELINE_DIR\pipeline-data.json" -Raw | ConvertFrom-Json
    $td = Get-Content "$PIPELINE_DIR\_test_detail.json" -Raw | ConvertFrom-Json
    $mp = Get-Content "$PIPELINE_DIR\test-case-mapping.json" -Raw | ConvertFrom-Json

    $kpiCases = $pd.kpi.testCases
    $kpiPassed = $pd.kpi.testPassed
    $kpiFailed = $pd.kpi.testFailed
    $kpiScore = $pd.kpi.scoreTotal
    $detailTotal = $td._meta.totalTests
    $mappingCases = $mp._meta.totalTestCases
    $mappingFiles = $mp._meta.totalTestFiles

    Write-Host "    pipeline-data KPI:  $kpiCases / $kpiPassed / $kpiFailed  score=$kpiScore" -ForegroundColor Gray
    Write-Host "    _test_detail:       $detailTotal" -ForegroundColor Gray
    Write-Host "    test-case-mapping:  $mappingCases 用例, $mappingFiles 文件" -ForegroundColor Gray

    $match1 = ($kpiCases -eq $detailTotal)
    $match2 = ($kpiCases -eq $mappingCases)
    if ($match1 -and $match2) {
        Write-Host "    ✅ 数据一致性: ALL MATCH ($kpiCases 用例)" -ForegroundColor Green
    } else {
        Write-Host "    ❌ 数据不一致! KPI=$kpiCases detail=$detailTotal mapping=$mappingCases" -ForegroundColor Red
    }
} catch {
    Write-Host "    ❌ 验证失败: $_" -ForegroundColor Red
}

# 文件状态
Write-Host "`n数据文件:" -ForegroundColor Yellow
@("pipeline-data.json", "_test_detail.json", "test-case-mapping.json", 
  "issue-data.json", "project-progress-data.json") | ForEach-Object {
    $p = "$PIPELINE_DIR\$_"
    if (Test-Path $p) {
        $i = Get-Item $p
        Write-Host "    $_ : $([math]::Round($i.Length/1024,1)) KB ($($i.LastWriteTime.ToString('HH:mm:ss')))" -ForegroundColor Gray
    } else {
        Write-Host "    $_ : MISSING" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "管线本地同步完成: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
