# Starts the AI service, backend (with its embedded MQTT broker) and the prebuilt web dashboard
# in the background, so the fleet keeps ingesting and serving the API/WebSocket/dashboard without
# a terminal open. Registered to run automatically at logon by register.ps1 — see
# scripts/autostart/README.md. The web dashboard is a static production build (`npm run build`
# in web/, baked with VITE_API_URL) served via `vite preview`; rebuild it manually after pulling
# web changes — this script does not rebuild it.
#
# -LanIp (or $env:MACHINEWATCH_LAN_IP) is this machine's LAN address. It is optional and only used to
# print the exact web build command when web/dist is missing; register.ps1 passes no arguments.

param(
    [string]$LanIp = $env:MACHINEWATCH_LAN_IP
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$pidFile = Join-Path $PSScriptRoot 'run.pid.json'

function Test-Alive($processId) {
    if (-not $processId) { return $false }
    return $null -ne (Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

$state = [PSCustomObject]@{ aiPid = $null; backendPid = $null; webPid = $null }
if (Test-Path $pidFile) {
    try { $state = Get-Content $pidFile -Raw | ConvertFrom-Json } catch { }
}

if ((Test-Alive $state.aiPid) -and (Test-Alive $state.backendPid) -and (Test-Alive $state.webPid)) {
    Write-Output "MachineWatch is already running (ai pid $($state.aiPid), backend pid $($state.backendPid), web pid $($state.webPid))."
    return
}

$venvPython = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
    throw "Python venv not found at $venvPython. Create it first: python -m venv .venv; .venv\Scripts\pip install -r ai-service\requirements-dev.txt"
}

$ai = Start-Process -FilePath $venvPython `
    -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000') `
    -WorkingDirectory (Join-Path $root 'ai-service') `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDir 'ai-service.log') `
    -RedirectStandardError (Join-Path $logDir 'ai-service.err.log')

# Same as `npm start` (node --env-file-if-exists=.env src/server.ts), invoked directly so the
# tracked pid is node.exe itself rather than an npm.cmd wrapper that Stop-Process can't reach.
$backend = Start-Process -FilePath 'node.exe' `
    -ArgumentList @('--env-file-if-exists=.env', 'src/server.ts') `
    -WorkingDirectory (Join-Path $root 'backend') `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDir 'backend.log') `
    -RedirectStandardError (Join-Path $logDir 'backend.err.log')

$webDist = Join-Path $root 'web\dist'
if (-not (Test-Path $webDist)) {
    $apiHost = if ($LanIp) { $LanIp } else { '<your-LAN-IP>' }
    $hint = "web/dist not found. Build it first: cd web; `$env:VITE_API_URL = 'http://${apiHost}:4000'; npm run build"
    if (-not $LanIp) {
        $hint += " (replace <your-LAN-IP> with this machine's LAN address from ipconfig, or set MACHINEWATCH_LAN_IP / pass -LanIp to fill it in)"
    }
    throw $hint
}

$web = Start-Process -FilePath 'node.exe' `
    -ArgumentList @('node_modules/vite/bin/vite.js', 'preview', '--host', '0.0.0.0', '--port', '5173', '--strictPort') `
    -WorkingDirectory (Join-Path $root 'web') `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDir 'web.log') `
    -RedirectStandardError (Join-Path $logDir 'web.err.log')

@{ aiPid = $ai.Id; backendPid = $backend.Id; webPid = $web.Id; startedAt = (Get-Date).ToString('o') } |
    ConvertTo-Json | Set-Content -Path $pidFile -Encoding utf8

Write-Output "Started ai-service (pid $($ai.Id)), backend (pid $($backend.Id)) and web (pid $($web.Id)). Logs in $logDir"
