$token = (Get-Content "$PSScriptRoot\scripts\.release_token" -Raw).Trim()
$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github.v3+json"
}

# Check if the workflow is enabled
Write-Host "========== Workflow State ==========" -ForegroundColor Cyan
$wfs = Invoke-RestMethod -Uri "https://api.github.com/repos/ht182400-creator/easyagent/actions/workflows" -Headers $headers
foreach ($wf in $wfs.workflows) {
    Write-Host "$($wf.name): state=$($wf.state) path=$($wf.path)"
}

# Try to trigger workflow dispatch (might need workflow_dispatch event)
Write-Host ""
Write-Host "========== Checking if workflow has workflow_dispatch ==========" -ForegroundColor Cyan

# Get the current ci.yml from repo
$content = Invoke-RestMethod -Uri "https://api.github.com/repos/ht182400-creator/easyagent/contents/.github/workflows/ci.yml" -Headers @{
    Authorization = "token $token"
    Accept = "application/vnd.github.v3+json"
}

Write-Host "ci.yml size: $($content.size) bytes"
Write-Host "ci.yml encoding: $($content.encoding)"

# Also check if there are any disabled actions for this repo
Write-Host ""
Write-Host "========== Repo Actions enabled? ==========" -ForegroundColor Cyan
$repo = Invoke-RestMethod -Uri "https://api.github.com/repos/ht182400-creator/easyagent" -Headers $headers
Write-Host "  Repo: $($repo.full_name)"
Write-Host "  Actions enabled: $($repo.has_actions)"
