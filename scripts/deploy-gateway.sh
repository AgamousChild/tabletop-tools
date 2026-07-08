#!/bin/bash
set -e

# Deploy the unified gateway (every client SPA in apps/gateway/apps.json + landing page)
# Run from repo root: bash scripts/deploy-gateway.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY_DIR="$REPO_ROOT/apps/gateway"

# Load .env for CF_ZONE_ID and CLOUDFLARE_API_TOKEN
if [ -f "$REPO_ROOT/.env" ]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

# Fail fast: a deploy without a CDN cache purge serves stale HTML/JS and has
# caused real incidents (root CLAUDE.md "Environment + Operational Gotchas").
# Refuse to start rather than silently skip the purge at the end.
if [ -z "$CF_ZONE_ID" ] || [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "ERROR: CF_ZONE_ID and CLOUDFLARE_API_TOKEN must be set (via env or $REPO_ROOT/.env)." >&2
  echo "       Deploying without a cache purge serves stale bundles — refusing to deploy." >&2
  exit 1
fi

echo "=== Step 1: Build all client SPAs ==="
cd "$GATEWAY_DIR"
bash build.sh

echo ""
echo "=== Step 2: Deploy to Cloudflare Pages ==="
cd "$GATEWAY_DIR"
wrangler pages deploy dist --project-name tabletop-tools --branch main --commit-dirty=true

echo ""
echo "=== Step 3: Purge CDN cache ==="
# Cloudflare Pages CDN caches HTML and assets aggressively.
# Without purging, users may get stale JS bundles even after a deploy.
# Env vars are guaranteed set by the fail-fast check at the top of this script.
echo "Purging cache for zone $CF_ZONE_ID..."
purge_response=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}')
if echo "$purge_response" | grep -q '"success": *true'; then
  echo "  Cache purged"
else
  echo "ERROR: cache purge failed — the deploy is live but the CDN may serve stale bundles." >&2
  echo "       Response: $purge_response" >&2
  exit 1
fi

echo ""
echo "=== Done ==="
echo "Verify: https://tabletop-tools.net/"
echo "Verify: https://tabletop-tools.net/brain/"
