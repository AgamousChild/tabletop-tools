#!/bin/bash
set -e

# Deploy every app server Worker (apps with hasBackend: true in the manifest)
# Run from repo root: bash scripts/deploy-workers.sh
#
# App roster comes from apps/gateway/apps.json (single source of truth —
# see D2-02, wargame/w2/decisions/D2-02-deploy-topology-roster-manifest.md).
# Do not hardcode the app list here again.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load env vars (Cloudflare API token, etc.)
if [ -f "$REPO_ROOT/.env" ]; then
  set -a && source "$REPO_ROOT/.env" && set +a
fi

APPS=$(jq -r '.apps[] | select(.hasBackend == true) | .slug' "$REPO_ROOT/apps/gateway/apps.json")

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
