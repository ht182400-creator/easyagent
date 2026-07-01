# 列出 0.6.23 之前所有 Release 的 EXE 资产
$oldVersions = @("v0.6.22","v0.6.21","v0.6.20","v0.6.19","v0.6.18","v0.6.17","v0.6.15","v0.6.14","v0.6.13","v0.6.12")
$totalSize = 0

foreach ($v in $oldVersions) {
    $json = gh release view $v --repo ht182400-creator/easyagent --json assets 2>$null | ConvertFrom-Json
    if (-not $json -or -not $json.assets) {
        Write-Host "$v : 无资产或 Release 不存在"
        continue
    }
    $exeAssets = $json.assets | Where-Object { $_.name -like "*.exe" }
    if ($exeAssets) {
        $sizeMB = [math]::Round(($exeAssets | Measure-Object -Property size -Sum).Sum / 1MB, 1)
        $totalSize += $sizeMB
        $names = ($exeAssets | ForEach-Object { $_.name }) -join ", "
        Write-Host "$v : $($exeAssets.Count) EXE(s), $sizeMB MB - $names"
    } else {
        Write-Host "$v : 无 EXE 资产"
    }
}
Write-Host ""
Write-Host "总计 EXE 大小: $([math]::Round($totalSize, 1)) MB"
