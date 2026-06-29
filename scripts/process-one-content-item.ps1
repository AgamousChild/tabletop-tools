# Process exactly one community content item end-to-end.
#
# Runs from Windows Task Scheduler (every 2 hours by default — see
# register-content-item-task.ps1 to install the schedule).
#
# Steps (each is idempotent and importable per Rule 4):
#   1. queue-newest 1   — promote one newest 'discovered' → 'queued' if queue is dry
#   2. process-queue 1  — fetch transcript/article, run Ollama extraction → drafts
#   3. auto-review-all  — Ollama-reviews any new drafts, marks approved/rejected
#   4. commit-process-queue — appends approved drafts to community.json
#
# Ollama dependency: this requires a local Ollama daemon. If Ollama is not
# running the process/review steps fail and the script exits non-zero. The
# Task Scheduler will simply try again in 2 hours.
#
# Log file: .local/logs/process-one-content-item.log (append).
# Lock file: .local/locks/process-one-content-item.lock — skip if already running.

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$IngestorDir = Join-Path $RepoRoot 'apps/content-ingestor'
$LogDir = Join-Path $RepoRoot '.local/logs'
$LockDir = Join-Path $RepoRoot '.local/locks'
$LogFile = Join-Path $LogDir 'process-one-content-item.log'
$LockFile = Join-Path $LockDir 'process-one-content-item.lock'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $LockDir | Out-Null

function Write-Log($msg) {
  $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "[$stamp] $msg"
  $line | Out-File -FilePath $LogFile -Append -Encoding utf8
  Write-Host $line
}

# Lock acquisition: prevent overlap if a prior run is still going.
if (Test-Path $LockFile) {
  $lockAge = (Get-Date) - (Get-Item $LockFile).LastWriteTime
  if ($lockAge.TotalHours -lt 3) {
    Write-Log "SKIP: lock file present (age $([int]$lockAge.TotalMinutes) min). Prior run still in flight."
    exit 0
  } else {
    Write-Log "WARN: stale lock file (age $([int]$lockAge.TotalHours)h), removing."
    Remove-Item $LockFile -Force
  }
}

(Get-Date).ToString('o') | Out-File -FilePath $LockFile -Encoding utf8

try {
  Write-Log "=== Run start ==="
  Set-Location $IngestorDir

  function Run-Step($label, $args) {
    Write-Log "Step: $label"
    $output = & npx --no-install tsx @args 2>&1
    $exit = $LASTEXITCODE
    $output | Out-File -FilePath $LogFile -Append -Encoding utf8
    if ($exit -ne 0) {
      Write-Log "Step '$label' exited $exit — aborting run."
      throw "$label failed (exit $exit)"
    }
    Write-Log "Step '$label' OK"
  }

  Run-Step 'queue-newest 1'         @('src/queue-newest.ts', '1')
  Run-Step 'process-queue 1'        @('src/process-queue.ts', '1')
  Run-Step 'auto-review-all'        @('src/auto-review-all.ts')
  Run-Step 'commit-process-queue'   @('src/commit-process-queue.ts')

  Write-Log "=== Run complete ==="
} catch {
  Write-Log "ERROR: $_"
  exit 1
} finally {
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
