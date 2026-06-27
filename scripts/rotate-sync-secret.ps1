# rotate-sync-secret.ps1 — generate a new SYNC_SECRET and set it in both places
#
# Aligns the data-import Worker's SYNC_SECRET with the GitHub repo secret of
# the same name. Both are used by:
#   - The deploy-data-import workflow's post-deploy /sync trigger.
#   - The weekly update-data workflow (Sunday 00:00 UTC).
#
# The script prints the new secret to the console BEFORE pushing it anywhere,
# so it can be saved to a password manager. Nothing is written to a file.
#
# Run from the repo root:
#   pwsh scripts\rotate-sync-secret.ps1

$ErrorActionPreference = 'Stop'

# ── prerequisites ──────────────────────────────────────────────────────────────
foreach ($cmd in 'wrangler', 'gh') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd not found on PATH"
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$wranglerConfig = Join-Path $repoRoot 'apps\data-import\server\wrangler.toml'
if (-not (Test-Path $wranglerConfig)) {
    throw "wrangler.toml not found at $wranglerConfig — run from repo root?"
}

# ── generate ───────────────────────────────────────────────────────────────────
$secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })

Write-Host ''
Write-Host '════════════════════════════════════════════════════════════════════════' -ForegroundColor Yellow
Write-Host '  NEW SYNC_SECRET — SAVE THIS NOW (it will not be shown again):' -ForegroundColor Yellow
Write-Host ''
Write-Host "  $secret" -ForegroundColor Cyan
Write-Host ''
Write-Host '════════════════════════════════════════════════════════════════════════' -ForegroundColor Yellow
Write-Host ''

$confirm = Read-Host 'Saved? Type "yes" to push it to Cloudflare + GitHub'
if ($confirm -ne 'yes') {
    Write-Host 'Aborted. Nothing was written.' -ForegroundColor Red
    exit 1
}

# ── set on Cloudflare Worker ───────────────────────────────────────────────────
Write-Host ''
Write-Host '→ Setting Worker secret (apps/data-import/server)...' -ForegroundColor Green
$secret | wrangler secret put SYNC_SECRET --config $wranglerConfig
if ($LASTEXITCODE -ne 0) { throw 'wrangler secret put failed' }

# ── set in GitHub ──────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '→ Setting GitHub repo secret...' -ForegroundColor Green
gh secret set SYNC_SECRET --body $secret
if ($LASTEXITCODE -ne 0) { throw 'gh secret set failed' }

Write-Host ''
Write-Host '✓ SYNC_SECRET rotated on both Cloudflare and GitHub.' -ForegroundColor Green
Write-Host ''
Write-Host 'Next step — trigger a sync to verify:' -ForegroundColor Yellow
Write-Host '  gh workflow run deploy-data-import.yml --ref main -f force_sync=true' -ForegroundColor Cyan
Write-Host ''
