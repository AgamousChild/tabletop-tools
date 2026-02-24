#!/bin/bash
set -e

# Deploy the auth-server Worker
# Run from repo root: bash scripts/deploy-auth.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Deploying auth-server Worker ==="
cd "$REPO_ROOT/apps/auth-server"
wrangler deploy

echo ""
echo "Workers Route: tabletop-tools.net/auth/*"
echo "Verify: curl -s https://tabletop-tools.net/auth/health"
echo ""
echo "If first deploy, set secrets:"
echo "  cd apps/auth-server"
echo "  wrangler secret put AUTH_SECRET"
echo "  wrangler secret put TURSO_DB_URL"
echo "  wrangler secret put TURSO_AUTH_TOKEN"
