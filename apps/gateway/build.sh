#!/bin/bash
set -e

GATEWAY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$GATEWAY_DIR/../.." && pwd)"
DIST="$GATEWAY_DIR/dist"

# Clean
rm -rf "$DIST"
mkdir -p "$DIST"

# Build each app with its base path
for app in no-cheat versus list-builder game-tracker tournament new-meta data-import admin; do
  echo "Building $app..."
  cd "$REPO_ROOT/apps/$app/client"
  pnpm build
  cp -r dist "$DIST/$app"
done

# Copy landing page with version injection
VERSION=$(cd "$REPO_ROOT" && node -p "require('./package.json').version")
sed "s/<!--VERSION-->/v${VERSION} \&middot; /g" "$GATEWAY_DIR/landing/index.html" > "$DIST/index.html"

# Copy SPA redirects
cp "$GATEWAY_DIR/_redirects" "$DIST/_redirects"

# Validate all outputs exist before declaring success
echo "Validating build outputs..."
for app in no-cheat versus list-builder game-tracker tournament new-meta data-import admin; do
  if [ ! -f "$DIST/$app/index.html" ]; then
    echo "ERROR: $DIST/$app/index.html missing — build failed for $app"
    exit 1
  fi
done

if [ ! -f "$DIST/index.html" ]; then
  echo "ERROR: $DIST/index.html missing — landing page not copied"
  exit 1
fi

echo "Gateway build complete: $DIST (all 8 apps validated)"
