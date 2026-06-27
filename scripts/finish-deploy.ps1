# finish-deploy.ps1 — run everything *after* SYNC_SECRET rotation to land
# today's data-import + brain changes in production.
#
# Steps:
#   1. Trigger the deploy-data-import workflow (force=true) and wait for it.
#      This is the path the auto-deploy CI takes; we just kick it manually so
#      R2 picks up the new MFM / blank-keyword / repeat-cost outputs now.
#   2. Rebuild the brain graph locally (build-graph.ts reads GW markdown and
#      Wahapedia JSON from disk — can't run in CI).
#   3. Upload the rebuilt brain graph to R2 (upload-graph.ts).
#   4. Deploy the brain Worker with a fresh BUILD_VERSION.
#   5. Re-index brain vectors — node content changed (CSM cult tagging,
#      blank-keyword cleanup), so embeddings need a refresh.
#   6. Print verification commands.
#
# Prerequisites:
#   - wrangler authenticated (wrangler login)
#   - gh authenticated (gh auth login)
#   - GW markdown present at C:/R/sync-data/tools/gw-sync/.local/gw/markdown/
#   - $env:BRAIN_SYNC_SECRET set, or you'll be prompted (this is the brain
#     Worker's /index-vectors secret, NOT the data-import SYNC_SECRET you
#     just rotated)
#
# Run from the repo root:
#   pwsh scripts\finish-deploy.ps1

$ErrorActionPreference = 'Stop'

# ── prerequisites ──────────────────────────────────────────────────────────────
$repoRoot = Split-Path -Parent $PSScriptRoot
foreach ($cmd in 'wrangler', 'gh', 'pnpm', 'curl', 'npx') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd not found on PATH"
    }
}

$gwMarkdownDir = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown/'
if (-not (Test-Path $gwMarkdownDir)) {
    throw "Brain source not found at $gwMarkdownDir — rebuild needs GW markdown"
}

if (-not $env:BRAIN_SYNC_SECRET) {
    $secure = Read-Host 'Enter BRAIN_SYNC_SECRET (brain Worker /index-vectors token)' -AsSecureString
    $env:BRAIN_SYNC_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

$buildVersion = Get-Date -Format 'yyyyMMdd-HHmmss'
Write-Host "Build version: $buildVersion" -ForegroundColor Cyan

# ── 1. trigger data-import workflow and wait ──────────────────────────────────
Write-Host ''
Write-Host '═══ 1/5  Trigger data-import workflow (force=true) ═══' -ForegroundColor Yellow
gh workflow run deploy-data-import.yml --ref main -f force_sync=true
if ($LASTEXITCODE -ne 0) { throw 'gh workflow run failed' }

Start-Sleep -Seconds 5
$runId = (gh run list --workflow=deploy-data-import.yml --limit 1 --json databaseId -q '.[0].databaseId').Trim()
Write-Host "Watching run $runId..." -ForegroundColor Cyan
gh run watch $runId --exit-status
if ($LASTEXITCODE -ne 0) { throw "deploy-data-import workflow failed — gh run view $runId" }

# ── 2. rebuild brain graph ────────────────────────────────────────────────────
Write-Host ''
Write-Host '═══ 2/5  Rebuild brain graph ═══' -ForegroundColor Yellow
Push-Location (Join-Path $repoRoot 'apps\brain\server')
try {
    npx tsx src/build-graph.ts
    if ($LASTEXITCODE -ne 0) { throw 'build-graph.ts failed' }
} finally {
    Pop-Location
}

# ── 3. upload brain graph to R2 ───────────────────────────────────────────────
Write-Host ''
Write-Host '═══ 3/5  Upload brain graph to R2 ═══' -ForegroundColor Yellow
Push-Location (Join-Path $repoRoot 'apps\brain\server')
try {
    npx tsx src/upload-graph.ts
    if ($LASTEXITCODE -ne 0) { throw 'upload-graph.ts failed' }
} finally {
    Pop-Location
}

# ── 4. deploy brain Worker ────────────────────────────────────────────────────
Write-Host ''
Write-Host '═══ 4/5  Deploy brain Worker ═══' -ForegroundColor Yellow
Push-Location (Join-Path $repoRoot 'apps\brain\server')
try {
    npx wrangler deploy --var "BUILD_VERSION:$buildVersion"
    if ($LASTEXITCODE -ne 0) { throw 'brain wrangler deploy failed' }
} finally {
    Pop-Location
}

# ── 5. re-index brain vectors ─────────────────────────────────────────────────
Write-Host ''
Write-Host '═══ 5/5  Re-index brain vectors ═══' -ForegroundColor Yellow
$brainUrl = 'https://tabletop-tools-brain.micah-ec2.workers.dev/index-vectors'
$baseFiles = @('nodes/core.json', 'nodes/errata.json', 'nodes/balance.json', 'nodes/community.json')
$factions = @(
    'adepta-sororitas', 'adeptus-custodes', 'adeptus-mechanicus', 'adeptus-titanicus',
    'aeldari', 'astra-militarum', 'black-templars', 'blood-angels', 'chaos-daemons',
    'chaos-knights', 'chaos-space-marines', 'dark-angels', 'death-guard', 'deathwatch',
    'drukhari', 'emperors-children', 'genestealer-cults', 'grey-knights',
    'imperial-agents', 'imperial-knights', 'leagues-of-votann', 'necrons', 'orks',
    'space-marines', 'space-wolves', 't-au-empire', 'thousand-sons', 'tyranids',
    'world-eaters'
)
$failedReindex = @()
foreach ($file in ($baseFiles + ($factions | ForEach-Object { "nodes/faction-$_.json" }))) {
    Write-Host "  → $file"
    curl -sf -X POST "${brainUrl}?file=$file" -H "Authorization: Bearer $env:BRAIN_SYNC_SECRET" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    (failed)" -ForegroundColor Red
        $failedReindex += $file
    }
}
if ($failedReindex.Count -gt 0) {
    Write-Host ''
    Write-Host "⚠ $($failedReindex.Count) reindex calls failed:" -ForegroundColor Yellow
    $failedReindex | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
}

# ── verify ────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '═══ Verify ═══' -ForegroundColor Yellow

Write-Host ''
Write-Host 'data-import manifest:'
curl -s 'https://tabletop-tools-data-import.micah-ec2.workers.dev/manifest.json' |
    jq '{version, updatedAt, mfm, bsdataUnits: .bsdata.unitCount, wahapediaCounts: (.wahapedia.recordCounts | length)}'

Write-Host ''
Write-Host 'brain build version:'
$liveVersion = (curl -s 'https://tabletop-tools-brain.micah-ec2.workers.dev/version').Trim()
Write-Host "  live:     $liveVersion"
Write-Host "  expected: $buildVersion"
if ($liveVersion -ne $buildVersion) {
    Write-Host '  ⚠ version mismatch — Worker may not have rolled yet' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '✓ Deploy complete.' -ForegroundColor Green
Write-Host ''
Write-Host 'Spot-check via MCP:' -ForegroundColor Cyan
Write-Host '  brain_get_unit Plague Marines        → subfaction: death guard'
Write-Host '  brain_get_unit Rubric Marines        → subfaction: thousand sons'
Write-Host '  brain_get_unit Wraithguard           → faction keywords: Asuryani (no trailing blank)'
Write-Host ''
