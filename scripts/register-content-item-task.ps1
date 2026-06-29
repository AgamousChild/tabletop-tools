# Register the "process-one-content-item" Windows Scheduled Task.
#
# Runs `scripts/process-one-content-item.ps1` every 2 hours, starting at the
# next 2-hour boundary. Default duration 365 days repeating.
#
# Run as the current Windows user (no admin elevation needed; the task runs
# under the same account so it can reach the local Ollama daemon, the Turso
# DB via .env, and the workspace files).
#
# Usage:
#   pwsh scripts/register-content-item-task.ps1
#   pwsh scripts/register-content-item-task.ps1 -IntervalHours 4
#   pwsh scripts/register-content-item-task.ps1 -Uninstall

param(
  [int]$IntervalHours = 2,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$TaskName = 'TabletopTools-ProcessOneContentItem'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$ScriptPath = Join-Path $RepoRoot 'scripts/process-one-content-item.ps1'

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Unregistered scheduled task '$TaskName'."
  } else {
    Write-Host "No scheduled task named '$TaskName' found — nothing to do."
  }
  return
}

if (-not (Test-Path $ScriptPath)) {
  throw "Script not found: $ScriptPath"
}

# Run pwsh (PowerShell 7+). Falls back to powershell.exe if pwsh isn't on PATH.
$shell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $shell) {
  $shell = (Get-Command powershell -ErrorAction SilentlyContinue).Source
}
if (-not $shell) {
  throw 'No pwsh or powershell.exe on PATH.'
}

# -WindowStyle Hidden + Settings.Hidden + LogonType S4U together mean no window
# ever appears: S4U runs the task detached from the interactive desktop so
# console processes have nowhere to render.
$action = New-ScheduledTaskAction `
  -Execute $shell `
  -Argument "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`"" `
  -WorkingDirectory $RepoRoot

# Start at the next aligned interval boundary (so two runs don't pile up
# right after registration).
$now = Get-Date
$startTime = $now.AddMinutes(5)  # short delay so the first run isn't instant

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At $startTime `
  -RepetitionInterval (New-TimeSpan -Hours $IntervalHours)

# Run whether logged on or not, but using the current user account.
# Don't require elevated rights — the task should match an interactive run.
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType S4U `
  -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -Hidden

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host "Updating existing task '$TaskName'..."
  Set-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
} else {
  Write-Host "Registering task '$TaskName'..."
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Description "Process one Tabletop Tools community content item end-to-end every $IntervalHours hours." `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings | Out-Null
}

Write-Host "Done."
Write-Host "  Task:        $TaskName"
Write-Host "  Script:      $ScriptPath"
Write-Host "  First run:   $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "  Repeats:     every $IntervalHours hour(s)"
Write-Host "  Log file:    $RepoRoot\.local\logs\process-one-content-item.log"
Write-Host ""
Write-Host "Verify with: Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "Uninstall:   pwsh scripts/register-content-item-task.ps1 -Uninstall"
