#!/usr/bin/env sh
# agent-worktree-init.sh — print the agent's worktree boundary so absolute
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

set -e

WORKTREE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$WORKTREE_ROOT" ]; then
    echo "ERROR: not inside a git repo. Run this from inside the agent's worktree." >&2
    exit 1
fi

# Detect if we're on a worktree vs the main checkout.
GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null)"
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)"
case "$GIT_DIR" in
    "$GIT_COMMON_DIR"*) IS_WORKTREE=false ;;
    *)                  IS_WORKTREE=true ;;
esac

echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "  AGENT WORKTREE BOUNDARY"
echo "════════════════════════════════════════════════════════════════════════"
echo "  WORKTREE_ROOT = $WORKTREE_ROOT"
if [ "$IS_WORKTREE" = "true" ]; then
    echo "  on worktree   = YES"
    echo ""
    echo "  Every Edit/Write absolute path must start with this WORKTREE_ROOT."
    echo "  Do NOT use C:\\R\\tabletop-tools\\... (or similar main-checkout path)."
else
    echo "  on worktree   = NO (this is the main checkout)"
    echo ""
    echo "  Heads up: you are NOT on an isolated worktree. If your task was"
    echo "  dispatched with isolation: \"worktree\", something went wrong."
fi
echo "════════════════════════════════════════════════════════════════════════"
echo ""

export WORKTREE_ROOT
