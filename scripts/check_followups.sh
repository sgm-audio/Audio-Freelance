#!/usr/bin/env bash
# Detect overdue follow-ups (no activity in >7 days for CONTACTED/PROPOSAL_SENT leads)
set -euo pipefail
API="http://localhost:8080/api/v1"

echo "=== Overdue Follow-ups ==="
echo ""

curl -s "$API/tracking/active" | python3 -c "
import sys, json
from datetime import UTC, datetime, timedelta
d = json.load(sys.stdin)
now = datetime.now(tz=UTC)
cutoff = now - timedelta(days=7)
overdue = []
for p in d.get('active', []):
    last = p.get('last_event')
    if last:
        ts = datetime.fromisoformat(last['at'].replace('Z','+00:00'))
        if ts < cutoff:
            lead = p.get('lead', {})
            overdue.append((lead.get('title','?'), lead.get('status','?'), ts.strftime('%Y-%m-%d')))
if overdue:
    print(f'  {len(overdue)} overdue:')
    for title, status, date in overdue:
        print(f'    [{status}] {title} — last contact {date}')
else:
    print('  All caught up.')
" 2>/dev/null

echo ""
echo "=== Done ==="
