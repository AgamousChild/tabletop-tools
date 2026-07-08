# agent-worktree-init.ps1 — print the agent's worktree boundary so absolute
# paths in Edit/Write calls land in the right copy of the repo.
#
# Run this FIRST when an agent is dispatched with isolation: "worktree".
# Per CLAUDE.md Rule 10.
#
# Why: the Edit and Write tools accept absolute paths and write wherever told.
# Agents that mentally default to "C:\R\tabletop-tools\..." (the main checkout
# path) end up editing the wrong tree even when their git operations correctly
# target the worktree. Every agent in today's session caught this via
# `git status` showing a clean worktree — but only after the wrong files had
# already been written. This script makes the boundary explicit at startup.

$ErrorActionPreference = 'Stop'

try {
    $worktreeRoot = (git rev-parse --show-toplevel).Trim()
} catch {
    Write-Error 'Not inside a git repo. Run this from inside the agent worktree.'
    exit 1
}

# On a linked worktree git-dir is <common>/worktrees/<name>, which STARTS WITH
# git-common-dir — so a StartsWith check reports every worktree as the main
# checkout. Only exact equality means main checkout. --path-format=absolute
# keeps both sides comparable (git can otherwise mix relative and absolute).
$gitDir       = (git rev-parse --path-format=absolute --git-dir).Trim()
$gitCommonDir = (git rev-parse --path-format=absolute --git-common-dir).Trim()
$isWorktree   = $gitDir -ne $gitCommonDir

Write-Host ''
Write-Host '════════════════════════════════════════════════════════════════════════' -ForegroundColor Yellow
Write-Host '  AGENT WORKTREE BOUNDARY' -ForegroundColor Yellow
Write-Host '════════════════════════════════════════════════════════════════════════' -ForegroundColor Yellow
Write-Host "  WORKTREE_ROOT = $worktreeRoot" -ForegroundColor Cyan
if ($isWorktree) {
    Write-Host '  on worktree   = YES' -ForegroundColor Green
    Write-Host ''
    Write-Host '  Every Edit/Write absolute path must start with this WORKTREE_ROOT.'
    Write-Host '  Do NOT use C:\R\tabletop-tools\... (or similar main-checkout path).'
} else {
    Write-Host '  on worktree   = NO (this is the main checkout)' -ForegroundColor Red
    Write-Host ''
    Write-Host '  Heads up: you are NOT on an isolated worktree. If your task was' -ForegroundColor Yellow
    Write-Host "  dispatched with isolation: 'worktree', something went wrong." -ForegroundColor Yellow
}
Write-Host '════════════════════════════════════════════════════════════════════════' -ForegroundColor Yellow
Write-Host ''

$env:WORKTREE_ROOT = $worktreeRoot
