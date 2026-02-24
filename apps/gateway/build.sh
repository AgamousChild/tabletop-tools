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

# Copy landing page
cp "$GATEWAY_DIR/landing/index.html" "$DIST/index.html"

# Copy SPA redirects
cp "$GATEWAY_DIR/_redirects" "$DIST/_redirects"

echo "Gateway build complete: $DIST"
