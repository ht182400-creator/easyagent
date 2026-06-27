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

# 手动解析参数（不用 param() 自动绑定，防止 CMD chcp 输出污染导致的 stray arg 错误）
$Timeout = 600
$SkipCI = $false
if ($args -contains '--skip-ci' -or $args -contains '-SkipCI') {
    $SkipCI = $true
}
# 从 $args 中提取显式的 --timeout 值
for ($i = 0; $i -lt $args.Count; $i++) {
    if ($args[$i] -eq '--timeout' -and $i + 1 -lt $args.Count) {
        $val = [int]::TryParse($args[$i + 1], [ref]$Timeout)
    }
}

$ErrorActionPreference = "Continue"
# 设置控制台输出编码为 UTF-8，防止中文乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$WORKSPACE = "d:\Work_Area\AI\Claude Code  CN"
$PIPELINE_DIR = "$WORKSPACE\docs\pipeline"
$SERVER_PORT = 8899

Write-Host "========================================" -ForegroundColor Cyan
# 使用英文避免 CMD+PowerShell 编码不一致导致乱码
Write-Host "Pipeline Local Sync START: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ---- Step 1: Wait for CI + download vitest reports + git pull ----
if ($SkipCI) {
    Write-Host "`n[1/4] Skipping CI data fetch (--skip-ci)" -ForegroundColor Yellow
} else {
    Write-Host "`n[1/4] Waiting for CI to complete & fetching vitest reports..." -ForegroundColor Yellow
    Set-Location $WORKSPACE
    try {
        $ciResult = node scripts/fetch-ci-data.mjs --timeout $Timeout 2>&1
        $ciResult | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    [OK] CI data fetch complete" -ForegroundColor Green
        } else {
            Write-Host "    [WARN] CI fetch exit code: $LASTEXITCODE, continuing local sync..." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    [WARN] CI data fetch error: $_, using local fallback data" -ForegroundColor Yellow
    }
}

# ---- Step 2: Run local unified-sync ----
Write-Host "`n[2/4] Running unified-sync.mjs..." -ForegroundColor Yellow
try {
    node scripts/unified-sync.mjs 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    [OK] unified-sync complete" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] unified-sync exit code: $LASTEXITCODE" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    [FAIL] unified-sync error: $_" -ForegroundColor Red
}

# ---- Step 3: Restart pipeline server ----
Write-Host "`n[3/4] Restarting pipeline server (port $SERVER_PORT)..." -ForegroundColor Yellow

$existing = Get-NetTCPConnection -LocalPort $SERVER_PORT -ErrorAction SilentlyContinue
if ($existing) {
    $procId = $existing.OwningProcess
    try {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "    Stopped old process (PID: $procId)" -ForegroundColor Gray
    } catch {
        Write-Host "    [WARN] Cannot stop process PID:$procId" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 1
}

try {
    $proc = Start-Process -FilePath "node" -ArgumentList "docs/pipeline/server.mjs", $SERVER_PORT `
        -WorkingDirectory $WORKSPACE -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 2
    $check = Get-NetTCPConnection -LocalPort $SERVER_PORT -ErrorAction SilentlyContinue
    if ($check -and $check.State -eq "Listen") {
        Write-Host "    [OK] Server running (PID: $($proc.Id), port: $SERVER_PORT)" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] Port verification failed" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    [FAIL] Server start error: $_" -ForegroundColor Red
}

# ---- Step 4: Verify data consistency ----
Write-Host "`n[4/4] Verifying data consistency..." -ForegroundColor Yellow

try {
    # 必须指定 -Encoding UTF8，否则 PS 默认用 GBK 读取导致中文乱码破坏 JSON 语法
    $pd = Get-Content "$PIPELINE_DIR\pipeline-data.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    $mp = Get-Content "$PIPELINE_DIR\test-case-mapping.json" -Raw -Encoding UTF8 | ConvertFrom-Json

    $kpiCases = $pd.kpi.testCases
    $kpiPassed = $pd.kpi.testPassed
    $kpiFailed = $pd.kpi.testFailed
    $kpiScore = $pd.kpi.scoreTotal
    $mappingCases = $mp._meta.totalTestCases
    $mappingFiles = $mp._meta.totalTestFiles

    Write-Host "    pipeline-data KPI:  $kpiCases / $kpiPassed / $kpiFailed  score=$kpiScore" -ForegroundColor Gray
    Write-Host "    test-case-mapping:  $mappingCases cases, $mappingFiles files" -ForegroundColor Gray

    # KPI 与 mapping 必须一致（同源：源码解析）；_test_detail.json 来自 vitest 实际运行，允许 < KPI
    if ($kpiCases -eq $mappingCases) {
        Write-Host "    [OK] KPI & mapping consistent ($kpiCases cases)" -ForegroundColor Green
    } else {
        Write-Host "    [FAIL] KPI ($kpiCases) != mapping ($mappingCases) — source sync error!" -ForegroundColor Red
    }

    # _test_detail.json 独立验证：来自 vitest 实际执行，总是 ≤ 源码计数
    if (Test-Path "$PIPELINE_DIR\_test_detail.json") {
        try {
            $td = Get-Content "$PIPELINE_DIR\_test_detail.json" -Raw -Encoding UTF8 | ConvertFrom-Json
            $detailTotal = $td._meta.totalTests
            $detailPassed = $td._meta.totalPassed
            $detailFailed = $td._meta.totalFailed
            Write-Host "    _test_detail:       $detailTotal / $detailPassed / $detailFailed" -ForegroundColor Gray
            if ($SkipCI) {
                Write-Host "    [INFO] --skip-ci: _test_detail.json may be stale (no fresh vitest reports)" -ForegroundColor Yellow
            }
            if ($detailTotal -le $kpiCases) {
                Write-Host "    [OK] _test_detail ($detailTotal) <= KPI ($kpiCases) — expected (vitest <= source)" -ForegroundColor Green
            } else {
                Write-Host "    [WARN] _test_detail ($detailTotal) > KPI ($kpiCases) — possible stale KPI" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "    [WARN] _test_detail.json parse failed — may be stale or corrupted" -ForegroundColor Yellow
        }
    } else {
        Write-Host "    [WARN] _test_detail.json missing — run vitest (CI or local) to generate" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    [FAIL] Verification error: $_" -ForegroundColor Red
}

# File status
Write-Host "`nData files:" -ForegroundColor Yellow
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
Write-Host "Pipeline Local Sync DONE: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
