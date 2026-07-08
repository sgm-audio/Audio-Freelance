#!/usr/bin/env bash
# Weekly Friday: batch WARM review, /debug health check, asset registry update, market trends review
set -euo pipefail
API="http://localhost:8080/api/v1"

echo "=== Friday Weekly Review ==="
echo ""

# 1. Health check
echo "1. System health..."
HEALTH=$(curl -s "$API/health" 2>/dev/null || echo '{"status":"down"}')
STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','down'))" 2>/dev/null || echo "down")
if [ "$STATUS" != "ok" ]; then
  echo "   Backend down. Start with: ./run.sh"
  exit 1
fi
echo "   Backend: OK"

# 2. Full diagnostics
echo ""
echo "2. Diagnostics..."
curl -s -X POST "$API/debug" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"   Status: {d['status']}\")
print(f\"   Ollama: {'OK' if d.get('ollama_available') else 'DOWN'}\")
print(f\"   ChromaDB: {'OK' if d.get('chroma_healthy') else 'DOWN'}\")
print(f\"   Tavily: {'OK' if d.get('tavily_reachable') else 'DOWN'}\")
print(f\"   Serper: {'OK' if d.get('serper_reachable') else 'DOWN'}\")
print(f\"   Firecrawl: {'OK' if d.get('firecrawl_reachable') else 'DOWN'}\")
print(f\"   Leads in store: {d.get('chroma_stats',{}).get('leads',0)}\")
errors = d.get('errors', [])
if errors:
    for e in errors:
        print(f'   ERROR: {e}')
" 2>/dev/null

# 3. Pipeline summary
echo ""
echo "3. Weekly pipeline..."
curl -s "$API/status" | python3 -c "
import sys, json
d = json.load(sys.stdin)
counts = d.get('lead_counts', {})
total = sum(counts.values())
print(f'   Total leads: {total}')
print(f'   HOT: {counts.get(\"HOT\",0)}')
print(f'   WARM: {counts.get(\"WARM\",0)} — REVIEW THESE')
print(f'   PURSUING: {counts.get(\"CONTACTED\",0)+counts.get(\"REPLIED\",0)+counts.get(\"PROPOSAL_SENT\",0)}')
print(f'   WON: {counts.get(\"WON\",0)}')
print(f'   LOST: {counts.get(\"LOST\",0)}')
" 2>/dev/null

# 4. Win/loss rates
echo ""
echo "4. Win/loss..."
curl -s "$API/tracking/won-lost" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   Win rate: {d[\"win_rate\"]}%')
print(f'   Won: {d[\"won\"]} | Lost: {d[\"lost\"]} | Active: {d[\"active_pursuits\"]}')
bys = d.get('by_niche', {})
niche_won = bys.get('won', {})
niche_lost = bys.get('lost', {})
if niche_won or niche_lost:
    print('   By niche:')
    for niche in set(list(niche_won.keys()) + list(niche_lost.keys())):
        w = niche_won.get(niche, 0)
        l = niche_lost.get(niche, 0)
        total_n = w + l
        rate = round(w/max(total_n,1)*100)
        print(f'     {niche.replace(\"_\",\" \")}: {w}W/{l}L ({rate}%)')
" 2>/dev/null

# 5. WARM batch review
echo ""
echo "5. WARM leads to review:"
curl -s "$API/leads?status=WARM" | python3 -c "
import sys, json
d = json.load(sys.stdin)
leads = d.get('leads', [])
if leads:
    for lead in leads:
        company = lead.get('company', '?')
        print(f'   [{lead.get(\"score\",\"?\")}] {lead.get(\"title\",\"?\")} — {company}')
        print(f'     {lead.get(\"url\",\"?\")}')
else:
    print('   No WARM leads.')
" 2>/dev/null

# 6. Market trends
echo ""
echo "6. Market trends..."
curl -s "$API/market/trends" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
trends = d.get('tech_trends', [])
rising = [t for t in trends if t.get('direction') == 'rising']
declining = [t for t in trends if t.get('direction') == 'declining']
print(f'   Rising ({len(rising)}): ', ', '.join(t['technology'] for t in rising[:5]))
print(f'   Declining ({len(declining)}): ', ', '.join(t['technology'] for t in declining[:3]))
" 2>/dev/null || echo "   Market scan not available"

# 7. Rotation status
echo ""
echo "7. Cold lead rotation..."
curl -s "$API/leads/rotation-status" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   Last rotated: {d.get(\"last_rotation\",\"never\")}')
hrs = d.get('hours_ago')
if hrs and hrs > d.get('rotation_due_days', 3) * 24:
    print(f'   ⚡ Rotation overdue ({hrs}h ago) — run: make rotate')
else:
    print(f'   Next rotation due in ~{max(0, d.get(\"rotation_due_days\",3)*24 - (hrs or 0))}h')
" 2>/dev/null || echo "   Unknown"

# 8. Overdue follow-ups
echo ""
echo "8. Overdue follow-ups..."
bash scripts/check_followups.sh 2>/dev/null || echo "   Could not check."

echo ""
echo "=== Friday Review Complete ==="
echo "Actions:"
echo "  □ Review WARM leads above — re-score or archive"
echo "  □ Update asset_registry.yml with new work"
echo "  □ Rotate cold leads if overdue"
echo "  □ Review market trends — adjust search queries"
