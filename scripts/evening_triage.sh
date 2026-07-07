#!/usr/bin/env bash
# Evening 15min: reply triage
set -euo pipefail
API="http://localhost:8080/api/v1"

echo "=== Evening Triage ==="
echo ""

echo "Win rate:"
curl -s "$API/tracking/won-lost" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  Won: {d['won']} | Lost: {d['lost']} | Active: {d['active_pursuits']} | Rate: {d['win_rate']}%\")
" 2>/dev/null

echo ""
echo "Rotation status:"
curl -s "$API/leads/rotation-status" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  Last: {d.get('last_rotation','never')} | Due days: {d.get('rotation_due_days','?')}\")
" 2>/dev/null

echo ""
echo "=== Done ==="
