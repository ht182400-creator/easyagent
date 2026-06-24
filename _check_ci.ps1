$token = (Get-Content "$PSScriptRoot\scripts\.release_token" -Raw).Trim()
$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github.v3+json"
}
$runs = Invoke-RestMethod -Uri "https://api.github.com/repos/ht182400-creator/easyagent/actions/runs?per_page=1" -Headers $headers
$run = $runs.workflow_runs[0]
Write-Host "Latest run: #$($run.run_number) ID: $($run.id)"

$jobs = Invoke-RestMethod -Uri $run.jobs_url -Headers $headers
foreach ($j in $jobs.jobs) {
    if ($j.conclusion -eq "failure") {
        Write-Host "Getting log for: $($j.name)" -ForegroundColor Yellow
        $log = Invoke-RestMethod -Uri ($j.url + "/logs") -Headers $headers
        $lines = $log -split "`r`n"
        $inErr = $false
        foreach ($line in $lines) {
            if ($line -match "gyp ERR|GYP ERR|better-sqlite3.*install.*gyp") { $inErr = $true }
            if ($inErr) {
                Write-Host $line
                if ($line -match "ELIFECYCLE|##\[error\]") { 
                    Write-Host $line
                    break 
                }
            }
        }
    }
}
