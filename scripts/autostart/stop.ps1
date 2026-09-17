# Stops the ai-service and backend processes started by start.ps1.

$pidFile = Join-Path $PSScriptRoot 'run.pid.json'
if (-not (Test-Path $pidFile)) {
    Write-Output 'Nothing to stop (no run.pid.json).'
    return
}

$state = Get-Content $pidFile -Raw | ConvertFrom-Json
foreach ($p in @($state.aiPid, $state.backendPid, $state.webPid)) {
    if ($p -and (Get-Process -Id $p -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $p -Force
        Write-Output "Stopped pid $p"
    }
}
Remove-Item $pidFile -Force
