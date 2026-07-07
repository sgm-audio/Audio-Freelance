#!/usr/bin/env bash
# Morning 30min ritual: prospect + review HOT + check market
set -euo pipefail
API="http://localhost:8080/api/v1"

echo "=== Morning Ritual ==="
echo ""

# 1. Check backend health
echo "1. Health check..."
HEALTH=$(curl -s "$API/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])" 2>/dev/null || echo "down")
if [ "$HEALTH" != "ok" ]; then
  echo "   Backend not running. Start with: ./run.sh"
  exit 1
fi
echo "   Backend: OK"

# 2. Run diagnostics
echo ""
echo "2. Diagnostics..."
curl -s -X POST "$API/debug" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"   Status: {d['status']}\")
print(f\"   Ollama: {'reachable' if d.get('ollama_available') else 'UNREACHABLE'}\")
print(f\"   ChromaDB: {'healthy' if d.get('chroma_healthy') else 'UNHEALTHY'}\")
print(f\"   Leads: {d.get('chroma_stats', {}).get('leads', 0)}\")
if d.get('errors'):
    print('   Errors:', ', '.join(d['errors'][:3]))
" 2>/dev/null || echo "   Diagnostics failed"

# 3. Prospect all niches
echo ""
echo "3. Prospecting all niches..."
NICHES="plugin_dev reaper_scripts rust_audio audio_ml game_audio_dev"
for niche in $NICHES; do
  echo -n "   $niche... "
  RESULT=$(curl -s -X POST "$API/prospect/$niche" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"{d.get('hot',0)} HOT, {d.get('warm',0)} WARM\")
" 2>/dev/null || echo "failed")
  echo "$RESULT"
done

# 4. Market scan
echo ""
echo "4. Market scan..."
MARKET=$(curl -s "$API/market/opportunities" 2>/dev/null)
OPPS=$(echo "$MARKET" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('opportunities',[])))" 2>/dev/null || echo "?")
echo "   Opportunities found: $OPPS"

# 5. Show HOT leads
echo ""
echo "5. Hot leads:"
curl -s "$API/leads?status=HOT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for lead in d.get('leads', []):
    print(f\"   [{lead.get('score','?')}] {lead.get('title','?')} — {lead.get('company','?')}\")
" 2>/dev/null || echo "   No hot leads"

# 6. Pipeline summary
echo ""
echo "6. Pipeline:"
curl -s "$API/status" | python3 -c "
import sys, json
d = json.load(sys.stdin)
counts = d.get('lead_counts', {})
print(f\"   Total: {sum(counts.values())} | HOT: {counts.get('HOT',0)} | PURSUING: {counts.get('CONTACTED',0)+counts.get('REPLIED',0)+counts.get('PROPOSAL_SENT',0)} | WON: {counts.get('WON',0)}\")
" 2>/dev/null

echo ""
echo "=== Ritual complete ==="
