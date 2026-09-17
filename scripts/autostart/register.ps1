# Registers a Scheduled Task that runs start.ps1 automatically whenever you log into Windows,
# so MachineWatch's backend + AI service come up without opening a terminal.
# Run once: .\register.ps1
# Usually works in a normal PowerShell window; on some machines Task Scheduler requires an
# elevated (Run as Administrator) PowerShell instead — if you see "Access is denied", retry that way.

$ErrorActionPreference = 'Stop'
$taskName = 'MachineWatch AutoStart'
$startScript = Join-Path $PSScriptRoot 'start.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = 'PT30S'  # give Wi-Fi/network a moment to come up first

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force -ErrorAction Stop | Out-Null
} catch {
    Write-Output "Failed to register the scheduled task: $($_.Exception.Message)"
    Write-Output 'Re-run this script from an elevated PowerShell (Run as Administrator) and try again.'
    exit 1
}

Write-Output "Registered scheduled task '$taskName' (runs at logon, ~30s delay)."
Write-Output 'Starting it once now so it is up immediately...'
& $startScript
