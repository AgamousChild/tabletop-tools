#!/bin/bash
set -e

# Deploy the unified gateway (all 7 client SPAs + landing page)
# Run from repo root: bash scripts/deploy-gateway.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY_DIR="$REPO_ROOT/apps/gateway"

echo "=== Step 1: Build all client SPAs ==="
cd "$GATEWAY_DIR"
bash build.sh

echo ""
echo "=== Step 2: Deploy to Cloudflare Pages ==="
cd "$GATEWAY_DIR"
wrangler pages deploy dist --project-name tabletop-tools

echo ""
echo "=== Done ==="
echo "Verify: https://tabletop-tools.net/"
echo "Verify: https://tabletop-tools.net/versus/"
echo "Verify: https://tabletop-tools.net/no-cheat/"
