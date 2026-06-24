$token = (Get-Content "$PSScriptRoot\scripts\.release_token" -Raw).Trim()
$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github.v3+json"
}
$runs = Invoke-RestMethod -Uri "https://api.github.com/repos/ht182400-creator/easyagent/actions/runs?per_page=1" -Headers $headers
$run = $runs.workflow_runs[0]
Write-Host "#$($run.run_number): status=$($run.status) conclusion=$($run.conclusion) sha=$($run.head_sha.Substring(0,7))"
Write-Host "  URL: $($run.html_url)"

try {
    $jobs = Invoke-RestMethod -Uri $run.jobs_url -Headers $headers
    Write-Host "  Jobs: $($jobs.jobs.Count)"
    foreach ($j in $jobs.jobs) {
        $c = if ($j.conclusion -eq "failure") { "Red" } elseif ($j.conclusion -eq "success") { "Green" } elseif ($j.status -eq "in_progress") { "Yellow" } else { "White" }
        Write-Host "    $($j.name): status=$($j.status) conclusion=$($j.conclusion)" -ForegroundColor $c
    }
} catch {
    Write-Host "  Error getting jobs: $_" -ForegroundColor Red
}
