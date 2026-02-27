#!/usr/bin/env bash
# setup-data.sh — Generate all game data sources for the tabletop-tools platform.
#
# This script orchestrates the data pipeline:
#   1. Run sync tools (in ../sync-data) to fetch source databases
#   2. Export Wahapedia data to JSON for the data-import app
#   3. Optionally run BSData sync and create the master cross-reference DB
#
# Prerequisites:
#   - Node.js 18+ and pnpm installed
#   - /c/R/sync-data repo cloned alongside tabletop-tools
#
# Usage:
#   ./scripts/setup-data.sh              # Full pipeline
#   ./scripts/setup-data.sh --export     # Only re-export (skip sync)
#   ./scripts/setup-data.sh --validate   # Export + create master DB for validation
#
# The output JSON files are gitignored (GW IP). They must be regenerated
# locally before running the data-import app.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SYNC_DATA_DIR="${SYNC_DATA_DIR:-/c/R/sync-data}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup-data]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup-data]${NC} $*"; }
err()  { echo -e "${RED}[setup-data]${NC} $*" >&2; }

MODE="full"
if [[ "${1:-}" == "--export" ]]; then
  MODE="export"
elif [[ "${1:-}" == "--validate" ]]; then
  MODE="validate"
fi

# ── Step 1: Verify sync-data repo ────────────────────────────────────────

if [[ ! -d "$SYNC_DATA_DIR" ]]; then
  err "sync-data repo not found at $SYNC_DATA_DIR"
  err "Set SYNC_DATA_DIR env var or clone it: git clone <repo> $SYNC_DATA_DIR"
  exit 1
fi

# ── Step 2: Run sync tools (skip if --export) ────────────────────────────

if [[ "$MODE" == "full" || "$MODE" == "validate" ]]; then
  # Wahapedia sync
  WAHAPEDIA_TOOL="$SYNC_DATA_DIR/tools/wahapedia-sync"
  if [[ -d "$WAHAPEDIA_TOOL" ]]; then
    log "Running Wahapedia sync..."
    (cd "$WAHAPEDIA_TOOL" && pnpm start)
    WAHAPEDIA_DB="$WAHAPEDIA_TOOL/.local/wahapedia/data.db"
    if [[ -f "$WAHAPEDIA_DB" ]]; then
      log "Wahapedia DB ready: $(du -h "$WAHAPEDIA_DB" | cut -f1)"
    else
      err "Wahapedia sync did not produce data.db"
      exit 1
    fi
  else
    warn "Wahapedia sync tool not found at $WAHAPEDIA_TOOL — skipping"
  fi

  # BSData sync
  BSDATA_TOOL="$SYNC_DATA_DIR/tools/bsdata-sync"
  if [[ -d "$BSDATA_TOOL" ]]; then
    log "Running BSData sync..."
    mkdir -p "$BSDATA_TOOL/.local/bsdata"
    (cd "$BSDATA_TOOL" && pnpm start)
    BSDATA_DB="$BSDATA_TOOL/.local/bsdata/data.db"
    if [[ -f "$BSDATA_DB" ]]; then
      log "BSData DB ready: $(du -h "$BSDATA_DB" | cut -f1)"
    else
      err "BSData sync did not produce data.db"
      exit 1
    fi
  else
    warn "BSData sync tool not found at $BSDATA_TOOL — skipping"
  fi

  # Chapter Approved sync
  CA_TOOL="$SYNC_DATA_DIR/tools/chapter-approved-sync"
  if [[ -d "$CA_TOOL" ]]; then
    log "Running Chapter Approved sync..."
    (cd "$CA_TOOL" && pnpm start) || warn "Chapter Approved sync failed (non-fatal)"
  fi
fi

# ── Step 3: Export Wahapedia to JSON ──────────────────────────────────────

log "Exporting Wahapedia data to JSON..."
WAHAPEDIA_DB="${WAHAPEDIA_DB:-$SYNC_DATA_DIR/tools/wahapedia-sync/.local/wahapedia/data.db}"

if [[ ! -f "$WAHAPEDIA_DB" ]]; then
  err "Wahapedia DB not found at $WAHAPEDIA_DB"
  err "Run the Wahapedia sync first: cd $SYNC_DATA_DIR/tools/wahapedia-sync && pnpm start"
  exit 1
fi

(cd "$ROOT_DIR" && npx tsx scripts/export-wahapedia.ts "$WAHAPEDIA_DB")

OUTPUT_DIR="$ROOT_DIR/apps/data-import/client/public/wahapedia"
FILE_COUNT=$(ls -1 "$OUTPUT_DIR"/*.json 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)
log "Exported $FILE_COUNT JSON files ($TOTAL_SIZE) to apps/data-import/client/public/wahapedia/"

# ── Step 4: Create master DB for validation (if --validate) ──────────────

if [[ "$MODE" == "validate" ]]; then
  log "Creating master cross-reference database..."
  (cd "$ROOT_DIR" && npx tsx scripts/create-master-db.ts)
  MASTER_DB="$SCRIPT_DIR/.local/master.db"
  if [[ -f "$MASTER_DB" ]]; then
    log "Master DB ready: $(du -h "$MASTER_DB" | cut -f1)"
  else
    warn "Master DB was not created"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────

echo ""
log "Data setup complete!"
echo ""
echo "  Wahapedia JSON: apps/data-import/client/public/wahapedia/"
echo "  BSData:         Imported at runtime via data-import app (GitHub API)"
echo ""
echo "  To run the app:  pnpm dev"
echo "  To validate:     ./scripts/setup-data.sh --validate"
echo ""
