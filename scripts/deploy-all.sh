#!/bin/bash
set -e

# Full deployment: Workers + Auth + Gateway
# Run from repo root: bash scripts/deploy-all.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "============================================"
echo " Tabletop Tools — Full Deployment"
echo "============================================"
echo ""

# Step 1: Build everything
echo "=== Step 1: Build all packages ==="
cd "$REPO_ROOT"
pnpm -r build

echo ""

# Step 2: Run database migrations
echo "=== Step 2: Database migrations ==="
if [ -f "$REPO_ROOT/packages/db/.env" ]; then
  cd "$REPO_ROOT/packages/db"
  pnpm exec drizzle-kit migrate
  echo "Migrations applied."
else
  echo "WARNING: packages/db/.env not found — skipping migrations."
  echo "Auth will fail without database tables. See docs/deployment.md Step 4."
fi

echo ""

# Step 3: Deploy app server Workers
echo "=== Step 3: Deploy app server Workers ==="
bash "$REPO_ROOT/scripts/deploy-workers.sh"

# Step 4: Deploy auth-server Worker
echo "=== Step 4: Deploy auth-server Worker ==="
bash "$REPO_ROOT/scripts/deploy-auth.sh"

# Step 5: Build and deploy gateway
echo "=== Step 5: Build and deploy gateway ==="
bash "$REPO_ROOT/scripts/deploy-gateway.sh"

echo ""
echo "============================================"
echo " Deployment complete!"
echo "============================================"
echo ""
echo "Verify:"
echo "  bash scripts/verify-deployment.sh"
echo "  cd e2e && BASE_URL=https://tabletop-tools.net pnpm test"
