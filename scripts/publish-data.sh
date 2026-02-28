#!/usr/bin/env bash
# publish-data.sh — Export Wahapedia data and publish to a GitHub data repo.
#
# This script:
#   1. Runs export-wahapedia.ts to generate JSON from Wahapedia SQLite
#   2. Copies JSON files to a separate data repo
#   3. Commits and pushes the updated data
#
# Prerequisites:
#   - Wahapedia SQLite DB available (run sync first or use setup-data.sh)
#   - Data repo cloned at DATA_REPO_DIR (default: ../tabletop-tools-data)
#   - Git configured with push credentials for the data repo
#
# Usage:
#   ./scripts/publish-data.sh                    # Export + publish
#   ./scripts/publish-data.sh --export-only      # Export only, don't push
#   DATA_REPO_DIR=/path/to/repo ./scripts/publish-data.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_REPO_DIR="${DATA_REPO_DIR:-$(dirname "$ROOT_DIR")/tabletop-tools-data}"
WAHAPEDIA_DB="${WAHAPEDIA_DB:-/c/R/sync-data/tools/wahapedia-sync/.local/wahapedia/data.db}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[publish-data]${NC} $*"; }
warn() { echo -e "${YELLOW}[publish-data]${NC} $*"; }
err()  { echo -e "${RED}[publish-data]${NC} $*" >&2; }

EXPORT_ONLY=false
if [[ "${1:-}" == "--export-only" ]]; then
  EXPORT_ONLY=true
fi

# ── Step 1: Verify Wahapedia DB exists ──────────────────────────────────

if [[ ! -f "$WAHAPEDIA_DB" ]]; then
  err "Wahapedia DB not found at $WAHAPEDIA_DB"
  err "Run sync first: cd /c/R/sync-data/tools/wahapedia-sync && pnpm start"
  err "Or set WAHAPEDIA_DB env var to the correct path."
  exit 1
fi

log "Using Wahapedia DB: $WAHAPEDIA_DB"

# ── Step 2: Export Wahapedia to JSON ────────────────────────────────────

log "Exporting Wahapedia data to JSON..."
(cd "$ROOT_DIR" && npx tsx scripts/export-wahapedia.ts "$WAHAPEDIA_DB")

SOURCE_DIR="$ROOT_DIR/apps/data-import/client/public/wahapedia"
FILE_COUNT=$(ls -1 "$SOURCE_DIR"/*.json 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$SOURCE_DIR" 2>/dev/null | cut -f1)
log "Exported $FILE_COUNT JSON files ($TOTAL_SIZE)"

if [[ "$EXPORT_ONLY" == "true" ]]; then
  log "Export complete (--export-only). Files at: $SOURCE_DIR"
  exit 0
fi

# ── Step 3: Copy to data repo ──────────────────────────────────────────

if [[ ! -d "$DATA_REPO_DIR" ]]; then
  warn "Data repo not found at $DATA_REPO_DIR"
  warn "Creating it now..."
  mkdir -p "$DATA_REPO_DIR"
  (cd "$DATA_REPO_DIR" && git init)
fi

DATA_DEST="$DATA_REPO_DIR/wahapedia"
mkdir -p "$DATA_DEST"

log "Copying JSON files to $DATA_DEST..."
cp "$SOURCE_DIR"/*.json "$DATA_DEST/"

# Write a manifest with timestamps and record counts
MANIFEST="$DATA_REPO_DIR/manifest.json"
echo "{" > "$MANIFEST"
echo "  \"exportedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$MANIFEST"
echo "  \"fileCount\": $FILE_COUNT," >> "$MANIFEST"
echo "  \"files\": {" >> "$MANIFEST"

FIRST=true
for f in "$DATA_DEST"/*.json; do
  FNAME=$(basename "$f")
  RECORDS=$(python3 -c "import json; d=json.load(open('$f')); print(len(d) if isinstance(d, list) else 'N/A')" 2>/dev/null || echo "?")
  SIZE=$(du -h "$f" | cut -f1)
  if [[ "$FIRST" != "true" ]]; then echo "," >> "$MANIFEST"; fi
  FIRST=false
  printf "    \"%s\": { \"records\": \"%s\", \"size\": \"%s\" }" "$FNAME" "$RECORDS" "$SIZE" >> "$MANIFEST"
done

echo "" >> "$MANIFEST"
echo "  }" >> "$MANIFEST"
echo "}" >> "$MANIFEST"

log "Manifest written to $MANIFEST"

# ── Step 4: Commit and push ────────────────────────────────────────────

(cd "$DATA_REPO_DIR" && {
  git add -A
  if git diff --staged --quiet; then
    log "No changes to commit — data is already up to date."
  else
    COMMIT_MSG="Update game data $(date -u +%Y-%m-%d)"
    git commit -m "$COMMIT_MSG"
    log "Committed: $COMMIT_MSG"

    if git remote | grep -q origin; then
      git push origin main 2>&1 || warn "Push failed — check credentials."
    else
      warn "No 'origin' remote configured — skipping push."
      warn "Set up the remote: cd $DATA_REPO_DIR && git remote add origin <url>"
    fi
  fi
})

log "Done!"
echo ""
echo "  Data repo: $DATA_REPO_DIR"
echo "  Files:     $DATA_DEST/"
echo "  Manifest:  $MANIFEST"
echo ""
