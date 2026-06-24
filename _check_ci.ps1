$token = (Get-Content "$PSScriptRoot\scripts\.release_token" -Raw).Trim()
$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github.v3+json"
}
$runs = Invoke-RestMethod -Uri "https://api.github.com/repos/ht182400-creator/easyagent/actions/runs?per_page=2" -Headers $headers
foreach ($r in $runs.workflow_runs) {
    $jobs = Invoke-RestMethod -Uri $r.jobs_url -Headers $headers
    Write-Host "#$($r.run_number): $($r.name) | status=$($r.status) conclusion=$($r.conclusion) sha=$($r.head_sha.Substring(0,7))"
    Write-Host "  Jobs: $($jobs.jobs.Count)"
    foreach ($j in $jobs.jobs) {
        $color = if ($j.conclusion -eq "failure") { "Red" } elseif ($j.conclusion -eq "success") { "Green" } else { "Yellow" }
        Write-Host "    $($j.name): status=$($j.status) conclusion=$($j.conclusion)" -ForegroundColor $color
    }
    Write-Host "  URL: $($r.html_url)"
}
