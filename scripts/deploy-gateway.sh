#!/bin/bash
set -e

# Deploy the unified gateway (all 7 client SPAs + landing page)
# Run from repo root: bash scripts/deploy-gateway.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY_DIR="$REPO_ROOT/apps/gateway"

# Load .env for CF_ZONE_ID and CLOUDFLARE_API_TOKEN
if [ -f "$REPO_ROOT/.env" ]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

echo "=== Step 1: Build all client SPAs ==="
cd "$GATEWAY_DIR"
bash build.sh

echo ""
echo "=== Step 2: Deploy to Cloudflare Pages ==="
cd "$GATEWAY_DIR"
# Use `pnpm exec wrangler` so this works both locally (where wrangler may
# not be on PATH) and inside GH Actions runners (deploy-platform.yml —
# where the workflow container has no global wrangler binary). Matches
# how the workflow already deploys the workers/auth-server. Pass the
# absolute dist path — `pnpm exec` resolves relative paths from the
# workspace root, not the current directory, so `dist` alone becomes
# `<repo>/dist` and wrangler ENOENTs.
pnpm exec wrangler pages deploy "$GATEWAY_DIR/dist" --project-name tabletop-tools --branch main --commit-dirty=true

echo ""
echo "=== Step 3: Purge CDN cache ==="
# Cloudflare Pages CDN caches HTML and assets aggressively.
# Without purging, users may get stale JS bundles even after a deploy.
if [ -n "$CF_ZONE_ID" ] && [ -n "$CLOUDFLARE_API_TOKEN" ]; then
  echo "Purging cache for zone $CF_ZONE_ID..."
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Cache purged' if d.get('success') else f'  Purge failed: {d}')" 2>/dev/null || echo "  Purge request sent (couldn't parse response)"
else
  echo "  Skipping cache purge (set CF_ZONE_ID and CLOUDFLARE_API_TOKEN env vars to enable)"
  echo "  Without purge, CDN may serve stale HTML/JS for up to 5 minutes"
fi

echo ""
echo "=== Done ==="
echo "Verify: https://tabletop-tools.net/"
echo "Verify: https://tabletop-tools.net/brain/"
