# Removes the auto-start scheduled task and stops any running instance.

$taskName = 'MachineWatch AutoStart'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Removed scheduled task '$taskName'."
} else {
    Write-Output "No scheduled task named '$taskName' found."
}
& (Join-Path $PSScriptRoot 'stop.ps1')
