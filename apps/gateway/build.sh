#!/bin/bash
set -e

GATEWAY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$GATEWAY_DIR/../.." && pwd)"
DIST="$GATEWAY_DIR/dist"

# App roster comes from apps.json (single source of truth — see D2-02,
# wargame/w2/decisions/D2-02-deploy-topology-roster-manifest.md). Do not
# hardcode the app list here again.
APPS=$(jq -r '.apps[].slug' "$GATEWAY_DIR/apps.json")
APP_COUNT=$(echo "$APPS" | wc -l)

# Drift check: wrangler.toml's [[services]] bindings can't be generated from
# the manifest (Wrangler has no include mechanism), so verify they at least
# agree in count with the manifest's hasBackend apps before building.
BACKEND_COUNT=$(jq -r '[.apps[] | select(.hasBackend == true)] | length' "$GATEWAY_DIR/apps.json")
BINDING_COUNT=$(grep -c '^\[\[services\]\]' "$GATEWAY_DIR/wrangler.toml")
if [ "$BACKEND_COUNT" != "$BINDING_COUNT" ]; then
  echo "ERROR: apps.json has $BACKEND_COUNT hasBackend apps but wrangler.toml has $BINDING_COUNT [[services]] bindings."
  echo "       Update apps/gateway/wrangler.toml (hand-maintained) to match the manifest."
  exit 1
fi

# Clean
rm -rf "$DIST"
mkdir -p "$DIST"

# Build each app with its base path
# Clean tsc incremental cache first to prevent stale builds
for app in $APPS; do
  echo "Building $app..."
  cd "$REPO_ROOT/apps/$app/client"
  rm -f tsconfig.tsbuildinfo
  rm -rf node_modules/.vite
  pnpm build
  cp -r dist "$DIST/$app"
done

# Render landing page (app cards from apps.json + version injection)
VERSION=$(cd "$REPO_ROOT" && node -p "require('./package.json').version")
node "$GATEWAY_DIR/render-landing.mjs" "$VERSION" "$DIST/index.html"

# Copy SPA redirects
cp "$GATEWAY_DIR/_redirects" "$DIST/_redirects"

# Validate all outputs exist before declaring success
echo "Validating build outputs..."
for app in $APPS; do
  if [ ! -f "$DIST/$app/index.html" ]; then
    echo "ERROR: $DIST/$app/index.html missing — build failed for $app"
    exit 1
  fi
done

if [ ! -f "$DIST/index.html" ]; then
  echo "ERROR: $DIST/index.html missing — landing page not copied"
  exit 1
fi

echo "Gateway build complete: $DIST (all $APP_COUNT apps validated)"
