#!/bin/bash
set -e

# Full brain deploy: rebuild graph → upload R2 → deploy Worker → re-index
# vectors → build + deploy client through the gateway → purge CDN cache.
#
# Run from repo root: bash scripts/deploy-brain.sh
#
# Optional: pass --skip-tests to skip the test suite.
# Optional: pass --skip-vectors to skip Vectorize re-indexing (use when only
#           the Worker code changed, not the node content).
#
# Required env vars (loaded from .env at repo root if present):
#   SYNC_SECRET              Bearer token for /index-vectors
# Optional env vars:
#   CF_ZONE_ID               Cloudflare zone for CDN purge
#   CLOUDFLARE_API_TOKEN     Used for CDN purge
#
# Card-image staging (cropping + R2 upload of deployment-zone and disposition
# card PNGs from local PDFs) is intentionally NOT part of this script — those
# only need to run when the source images change. See:
#   apps/brain/server/scripts/crop-deployment-zone-images.ts
#   apps/brain/server/scripts/upload-deployment-zone-images.ts
#   apps/brain/server/scripts/crop-disposition-card-images.ts
#   apps/brain/server/scripts/upload-disposition-card-images.ts

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRAIN_SERVER="$REPO_ROOT/apps/brain/server"
BRAIN_CLIENT="$REPO_ROOT/apps/brain/client"
GATEWAY_DIR="$REPO_ROOT/apps/gateway"

SKIP_TESTS=0
SKIP_VECTORS=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --skip-vectors) SKIP_VECTORS=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

if [ -f "$REPO_ROOT/.env" ]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

export BUILD_VERSION="$(date +%Y%m%d-%H%M%S)"
echo "=== Deploying brain version: $BUILD_VERSION ==="

if [ "$SKIP_TESTS" -eq 0 ]; then
  echo ""
  echo "=== Step 1: Test ==="
  pnpm --dir "$BRAIN_SERVER" test
else
  echo ""
  echo "=== Step 1: Test (SKIPPED via --skip-tests) ==="
fi

echo ""
echo "=== Step 2: Rebuild graph from local sources ==="
# Reads .local/ingest/ (community), gw-sync markdown, Wahapedia JSON,
# BSData XML cache, MFM costing/detachments, mission-card OCR, and the
# staged Chapter Approved card text. Re-includes whatever's on disk —
# does NOT re-crawl YouTube / news sites. Run content-ingestor first if
# you need fresh community content.
pnpm --dir "$BRAIN_SERVER" exec tsx src/build-graph.ts

echo ""
echo "=== Step 3: Upload graph to R2 (production) ==="
pnpm --dir "$BRAIN_SERVER" exec tsx src/upload-graph.ts

echo ""
echo "=== Step 4: Deploy Worker ==="
pnpm --dir "$BRAIN_SERVER" exec wrangler deploy --var BUILD_VERSION:"$BUILD_VERSION"

if [ "$SKIP_VECTORS" -eq 0 ]; then
  echo ""
  echo "=== Step 5: Re-index Vectorize ==="
  if [ -z "$SYNC_SECRET" ]; then
    echo "  WARN: SYNC_SECRET not set — skipping re-index"
    echo "  Set SYNC_SECRET in .env to enable"
  else
    BRAIN_URL="https://tabletop-tools-brain.micah-ec2.workers.dev"
    # Per-faction indexing takes long enough that a transient CF network hiccup
    # can drop the connection mid-response (seen: curl exit 56 on the
    # emperors-children batch during the 2026-07-24 deploy). --max-time gives
    # the Worker room to finish an embed batch; --retry recovers connection
    # drops without failing the whole script. set -e still aborts if a call
    # fails all retries — desired, because a persistent failure means half
    # the graph is unindexed.
    CURL_OPTS="-s --max-time 300 --retry 2 --retry-delay 3"
    # Top-level node files
    for file in nodes/core.json nodes/errata.json nodes/balance.json nodes/community.json; do
      echo "  indexing $file"
      curl $CURL_OPTS -X POST "$BRAIN_URL/index-vectors?file=$file" \
        -H "Authorization: Bearer $SYNC_SECRET" > /dev/null
    done
    # Per-faction files (these are big — one at a time)
    for faction in adepta-sororitas adeptus-custodes adeptus-mechanicus adeptus-titanicus aeldari astra-militarum black-templars blood-angels chaos-daemons chaos-knights chaos-space-marines chaos-titan-legions dark-angels death-guard deathwatch drukhari emperors-children genestealer-cults grey-knights imperial-agents imperial-knights leagues-of-votann necrons orks space-marines space-wolves t-au-empire thousand-sons titan-legions tyranids unaligned-forces world-eaters; do
      echo "  indexing faction-$faction"
      curl $CURL_OPTS -X POST "$BRAIN_URL/index-vectors?file=nodes/faction-${faction}.json" \
        -H "Authorization: Bearer $SYNC_SECRET" > /dev/null
    done
  fi
else
  echo ""
  echo "=== Step 5: Re-index Vectorize (SKIPPED via --skip-vectors) ==="
fi

echo ""
echo "=== Step 6: Build brain client ==="
# Clean tsc cache to avoid stale builds (per DEPLOY.md note).
rm -f "$BRAIN_CLIENT/tsconfig.tsbuildinfo"
rm -rf "$BRAIN_CLIENT/node_modules/.vite"
rm -rf "$BRAIN_CLIENT/dist"
pnpm --dir "$BRAIN_CLIENT" exec vite build

echo ""
echo "=== Step 7: Build + deploy gateway (bundles all client SPAs) ==="
rm -rf "$GATEWAY_DIR/dist"
bash "$GATEWAY_DIR/build.sh"
# apps/gateway has no package.json (not a pnpm workspace member), so
# `pnpm --dir apps/gateway exec` fails with ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE.
# Run wrangler directly from the gateway dir via a subshell — wrangler is
# resolved from the root node_modules.
(cd "$GATEWAY_DIR" && npx wrangler pages deploy dist --project-name tabletop-tools --branch main --commit-dirty=true)

echo ""
echo "=== Step 8: Purge CDN cache ==="
if [ -n "$CF_ZONE_ID" ] && [ -n "$CLOUDFLARE_API_TOKEN" ]; then
  echo "  Purging cache for zone $CF_ZONE_ID..."
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Cache purged' if d.get('success') else f'  Purge failed: {d}')" 2>/dev/null || echo "  Purge request sent (couldn't parse response)"
else
  echo "  SKIPPED: set CF_ZONE_ID and CLOUDFLARE_API_TOKEN to enable"
  echo "  Without purge, CDN may serve stale HTML/JS for up to 5 minutes"
fi

echo ""
echo "=== Step 9: Verify versions ==="
echo -n "  Worker:  "
curl -s https://tabletop-tools-brain.micah-ec2.workers.dev/version
echo ""
echo -n "  Public:  "
curl -s https://tabletop-tools.net/brain/api/version
echo ""

echo ""
echo "=== Done. Deployed: $BUILD_VERSION ==="
echo "  https://tabletop-tools.net/brain/"
