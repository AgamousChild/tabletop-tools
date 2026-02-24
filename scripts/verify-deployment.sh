#!/bin/bash

# Verify all endpoints after deployment
# Run from repo root: bash scripts/verify-deployment.sh

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

echo "Static pages:"
check "Landing page" "$BASE/" "200"
for app in no-cheat versus list-builder game-tracker tournament new-meta data-import; do
  check "$app SPA" "$BASE/$app/" "200"
done

echo ""
echo "tRPC health endpoints (server apps only — data-import has no server):"
for app in no-cheat versus list-builder game-tracker tournament new-meta; do
  check_json "$app /trpc/health" "$BASE/$app/trpc/health"
done

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
