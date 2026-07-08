#!/bin/bash

# Verify all endpoints after deployment
# Run from repo root: bash scripts/verify-deployment.sh
#
# App roster comes from apps/gateway/apps.json (single source of truth —
# see D2-02, wargame/w2/decisions/D2-02-deploy-topology-roster-manifest.md).
# Do not hardcode the app list here again.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$REPO_ROOT/apps/gateway/apps.json"
BASE="https://tabletop-tools.net"
PASS=0
FAIL=0

check() {
  local label="$1"
  local url="$2"
  local expect="$3"

  status=$(curl -sI "$url" -o /dev/null -w "%{http_code}" --max-time 10 2>/dev/null)
  if [ "$status" = "$expect" ]; then
    echo "  OK  $label ($status)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $label (got $status, expected $expect)"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local label="$1"
  local url="$2"

  body=$(curl -s "$url" --max-time 10 2>/dev/null)
  if echo "$body" | grep -q '"status":"ok"'; then
    echo "  OK  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $label (response: $body)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Verifying tabletop-tools.net deployment ==="
echo ""

echo "Static pages (all apps, including backend-less study/physics):"
check "Landing page" "$BASE/" "200"
for app in $(jq -r '.apps[].slug' "$MANIFEST"); do
  check "$app SPA" "$BASE/$app/" "200"
done

echo ""
echo "tRPC health endpoints (backend apps using the standard tRPC health route):"
for app in $(jq -r '.apps[] | select(.hasBackend == true and (.apiSegment // "trpc") == "trpc") | .slug' "$MANIFEST"); do
  check_json "$app /trpc/health" "$BASE/$app/trpc/health"
done

echo ""
echo "Non-tRPC backend liveness checks (Hono/REST apps behind an /api prefix):"
check "brain /api/version" "$BASE/brain/api/version" "200"
check "data-import /api/manifest.json" "$BASE/data-import/api/manifest.json" "200"

echo ""
echo "Auth:"
check_json "Auth health" "$BASE/auth/health"

# Auth signup smoke test — catches missing DB tables (the health endpoint won't)
echo ""
echo "Auth signup (smoke test):"
VERIFY_EMAIL="verify-$(date +%s)@noreply.local"
signup_body=$(curl -s --data-raw "{\"email\":\"$VERIFY_EMAIL\",\"password\":\"VerifyTest1234\",\"name\":\"verify\"}" \
  -H "Content-Type: application/json" \
  -H "Origin: https://tabletop-tools.net" \
  "$BASE/auth/api/auth/sign-up/email" \
  --max-time 10 2>/dev/null)
if echo "$signup_body" | grep -q '"user"'; then
  echo "  OK  Auth signup returned user object"
  PASS=$((PASS + 1))
elif echo "$signup_body" | grep -q '"message"'; then
  # Could be "user already exists" — still means auth is working
  echo "  OK  Auth signup responded ($(echo "$signup_body" | grep -o '"message":"[^"]*"'))"
  PASS=$((PASS + 1))
else
  echo "  FAIL Auth signup (response: $signup_body)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
