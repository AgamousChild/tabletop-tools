#!/bin/bash
set -e

# Tear down old subdomain infrastructure
# Run ONLY after verifying the new gateway deployment works
# Run from repo root: bash scripts/teardown-subdomains.sh
#
# Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID env vars

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ] || [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ZONE_ID" ]; then
  echo "Error: Set these env vars first:"
  echo "  export CLOUDFLARE_ACCOUNT_ID=..."
  echo "  export CLOUDFLARE_API_TOKEN=..."
  echo "  export CLOUDFLARE_ZONE_ID=..."
  exit 1
fi

ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
TOKEN="$CLOUDFLARE_API_TOKEN"
ZONE_ID="$CLOUDFLARE_ZONE_ID"

APPS="no-cheat tournament versus list-builder game-tracker new-meta"

echo "=== Step 1: Remove custom domains from old Pages projects ==="
for app in $APPS; do
  echo "Processing tabletop-tools-$app..."

  # Get domain IDs
  domains=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/tabletop-tools-$app/domains" \
    -H "Authorization: Bearer $TOKEN")

  # Extract and delete each domain
  echo "$domains" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for d in data.get('result', []):
    print(d['id'], d['name'])
" 2>/dev/null | while read -r domain_id domain_name; do
    echo "  Removing domain: $domain_name ($domain_id)"
    curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/tabletop-tools-$app/domains/$domain_id" \
      -H "Authorization: Bearer $TOKEN" > /dev/null
  done
done

echo ""
echo "=== Step 2: Remove old CNAME DNS records ==="
for app in $APPS; do
  echo "Removing CNAME for $app.tabletop-tools.net..."

  record_id=$(curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=CNAME&name=$app.tabletop-tools.net" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('result', [])
if results:
    print(results[0]['id'])
" 2>/dev/null)

  if [ -n "$record_id" ]; then
    curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$record_id" \
      -H "Authorization: Bearer $TOKEN" > /dev/null
    echo "  Deleted: $record_id"
  else
    echo "  Not found (already removed?)"
  fi
done

# Also remove auth subdomain CNAME
echo "Removing CNAME for auth.tabletop-tools.net..."
record_id=$(curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=CNAME&name=auth.tabletop-tools.net" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('result', [])
if results:
    print(results[0]['id'])
" 2>/dev/null)

if [ -n "$record_id" ]; then
  curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$record_id" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "  Deleted: $record_id"
else
  echo "  Not found (already removed?)"
fi

echo ""
echo "=== Done ==="
echo ""
echo "Old subdomain CNAMEs and custom domains removed."
echo "Old Pages projects still exist — delete after grace period:"
echo ""
echo "  for app in $APPS; do"
echo "    wrangler pages project delete tabletop-tools-\$app"
echo "  done"
