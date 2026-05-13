#!/bin/bash
set -e

# Deploy all 7 app server Workers
# Run from repo root: bash scripts/deploy-workers.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load env vars (Cloudflare API token, etc.)
if [ -f "$REPO_ROOT/.env" ]; then
  set -a && source "$REPO_ROOT/.env" && set +a
fi

APPS="no-cheat versus list-builder game-tracker tournament new-meta admin"

for app in $APPS; do
  echo "=== Deploying $app server Worker ==="
  cd "$REPO_ROOT/apps/$app/server"
  wrangler deploy
  echo ""
done

echo "=== All Workers deployed ==="
echo ""
echo "If first deploy, set secrets for each app:"
echo "  cd apps/<app>/server"
echo "  wrangler secret put TURSO_DB_URL"
echo "  wrangler secret put TURSO_AUTH_TOKEN"
