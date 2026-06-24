$token = (Get-Content "$PSScriptRoot\scripts\.release_token" -Raw).Trim()
$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github.v3+json"
}

# Get #31 failed job details
$jobs = Invoke-RestMethod -Uri "https://api.github.com/repos/ht182400-creator/easyagent/actions/runs/28113846681/jobs" -Headers $headers
foreach ($job in $jobs.jobs) {
    if ($job.conclusion -eq "failure") {
        Write-Host "Failed Job: $($job.name)" -ForegroundColor Red
        $log = Invoke-RestMethod -Uri "$($job.url)/logs" -Headers $headers
        $lines = $log -split "`r`n"
        # Find error lines
        $startFound = $false
        foreach ($line in $lines) {
            if ($line -match "(ERR_|error|Error|ERROR|fail|Fail|FAIL)") {
                if (-not $startFound) {
                    Write-Host "" 
                    Write-Host "--- Error lines ---" -ForegroundColor Yellow
                    $startFound = $true
                }
                Write-Host $line -ForegroundColor Red
            }
        }
        Write-Host ""
        Write-Host "--- Last 20 lines ---" -ForegroundColor Yellow
        $lines | Select-Object -Last 20 | ForEach-Object { Write-Host $_ }
    }
}
