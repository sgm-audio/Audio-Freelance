#!/usr/bin/env bash
# Midday 20min: approve/send drafts
set -euo pipefail
API="http://localhost:8080/api/v1"

echo "=== Midday Check ==="
echo ""

echo "Recent activity:"
curl -s "$API/tracking?limit=10" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for e in d.get('events', [])[:5]:
    print(f\"  {e.get('at','?')[:10]} {e.get('type','?')}\")
" 2>/dev/null

echo ""
echo "Active pursuits:"
curl -s "$API/tracking/active" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for p in d.get('active', []):
    lead = p.get('lead', {})
    print(f\"  [{lead.get('verdict','?')}] {lead.get('title','?')} — {lead.get('status','?')}\")
" 2>/dev/null

echo ""
echo "Check outreach/READY_TO_SEND.md for drafts to approve."
echo "=== Done ==="
