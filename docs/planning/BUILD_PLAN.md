# Build Plan — Audio-Dev Freelance Acquisition System

## Architecture

```
FastAPI Server (standalone)
  └── LangGraph Pipeline DAG
        ├── search/tier{1,2,3,4}.py   → web search (Tavily→Serper→Firecrawl fallback)
        ├── leads/store.py            → ChromaDB dedup (nomic-embed-text via Ollama)
        ├── scoring/score.py          → signal extraction + weighted scoring + verdict
        ├── generate/{translate,outreach,proposal,rate}.py   → text generation (Phase 2)
        └── debug/diagnostics.py      → pipeline health checks (Phase 4)
```

## Config: Permanent Exclusions

| Source | Reason |
|--------|--------|
| **Upwork** | Lifetime ban — removed from Tier 2 permanently |

## Phase 1 — Foundation + Search + Score (Tiers 1-3) ✅

### Step 1.1: Python Project Setup
- [x] `pyproject.toml`
- [x] `.env`
- [x] `README.md`
- [x] `leads/__init__.py` — public API exports

### Step 1.2: Data Layer (Tier 1)
- [x] `leads/schema.py` — `Lead` model, `RawCandidate` dataclass, `LeadStatus` enum, niche validation
- [x] `leads/store.py` — ChromaDB CRUD, dedup via embeddings, `check_ollama_available()`, `ensure_collections_initialized()`, outreach logging
- [x] `leads/__init__.py` — Clean exports

### Step 1.3: Search Layer (Tiers 1-4)
- [x] `search/__init__.py`
- [x] `search/base.py` — `web_search()` with Tavily→Serper→Firecrawl fallback, `fetch_url()`, `is_block_page()`, retry/backoff
- [x] `search/tier1.py` — Daily: KVR Audio, JUCE Forum, Reddit (audio_programming, REAPER)
- [x] `search/tier2.py` — Weekly: We Work Remotely, RemoteOK, Wellfound, HN Algolia. **No Upwork.**
- [x] `search/tier3.py` — Niche: Audio Programmer, ADC, GitHub bounties, music-tech boards
- [x] `search/tier4.py` — Outbound: 15 plugin companies, YC audio startups, AI-audio, game audio middleware

### Step 1.4: Scoring Layer
- [x] `scoring/__init__.py`
- [x] `scoring/score.py` — `score_candidate()`: hard-skip → signal extraction → budget parse → verdict
- [x] `scoring/signals.py` — Regex patterns: POSITIVE (real-time C++/Rust +5, plugin format +5, ML/neural +8, Rust audio +6, REAPER +5, edge inference +5, low-latency +4, budget above floor +10, remote/PNW +3), NEGATIVE (budget below floor -15, GUI-only -3, Mac-only/Dante -10), HARD SKIP (revenue-share, equity-only, unpaid, etc). Verdict: ≥10 HOT, ≥5 WARM, <5 COLD, SKIP.

### Step 1.5: LangGraph Pipeline
- [x] `graph/__init__.py`
- [x] `graph/state.py` — `PipelineState` TypedDict
- [x] `graph/pipeline.py` — `run_pipeline()` async orchestration; `build_pipeline()` LangGraph wrapper; `search_all()`/`route_by_verdict()` node functions

### Step 1.6: FastAPI Server
- [x] `api/__init__.py`
- [x] `api/routes.py` — `GET /health`, `GET /status`, `GET /leads`, `GET /leads/{id}`, `POST /prospect/{niche}`, `POST /score`, `POST /translate`, `POST /rate`, `POST /debug`
- [x] `main.py` — uvicorn entry point with CORS

### Step 1.7: Tests
- [x] `tests/test_schema.py`
- [x] `tests/test_store.py`
- [x] `tests/test_search.py`
- [x] `tests/test_score.py`
- [x] `tests/test_signals.py`
- [x] `tests/test_pipeline.py`

---

## Phase 2 — Generation + Outreach (Tier 4) ✅

- [x] `assets/registry.py` — `AssetRegistry` YAML loader, `verify_draft_claims()` pre-flight validation
- [x] `generate/translate.py` — Tech capability → client-facing value proposition with asset registry check
- [x] `generate/outreach.py` — Templates A-D; asset claim validation; logs to `CHROMA_COLLECTION_OUTREACH`
- [x] `generate/proposal.py` — Structured proposal markdown with pricing tiers and IP licensing note
- [x] `generate/rate.py` — Rate tiers (premium/standard/mvp) with minimum-rate floor check

---

## Phase 3 — Full Orchestration + Integrations (Tier 5)

- [ ] Complete LangGraph nodes: `generate_translate`, `generate_outreach`, `queue_for_review`, `notify_hot`, `await_human_send`
- [ ] `POST /translate`, `POST /outreach/{lead_id}`, `POST /proposal`, `POST /rate`, `GET /status` API routes
- [ ] Wire Gmail MCP server in opencode.jsonc
- [ ] Wire Slack MCP server for HOT notifications
- [ ] Wire Google Calendar MCP for scoping calls

---

## Phase 4 — Diagnostics + Monitoring (Tier 6)

- [ ] `debug/diagnostics.py` — `run_diagnostics()` → `DiagnosticReport`
  - Per-source connectivity check
  - Chroma collection health
  - Recent error log sweep
  - 6 failure modes with checks + remediation
- [ ] `POST /debug` API endpoint
- [ ] Wire `/debug` as opencode custom command

---

## Phase 5 — Market Research Layer ✅

- [x] `research/__init__.py` — Package exports
- [x] `research/market.py` — Market intelligence engine
  - [x] Funding signal queries (raised money → hiring soon)
  - [x] Technology trend queries (CLAP adoption, Rust audio, Mamba/SSM, on-device ML)
  - [x] Product launch queries (new plugins, DAW features, AI music tools)
  - [x] Pricing intelligence queries (rate data, budget ranges)
  - [x] Hiring signal queries (companies building audio teams, not just job posts)
  - [x] GitHub trending search (what's being built in audio open source)
  - [x] Trend extraction (14 tracked technologies, rising/stable/declining)
  - [x] Rate parsing (contract ranges, hourly rates, budget detection)
  - [x] Opportunity synthesis (actionable "what to pursue" recommendations)
- [x] `GET /api/v1/market` — Full market intelligence report
- [x] `GET /api/v1/market/trends` — Technology trends only
- [x] `GET /api/v1/market/pricing` — Pricing benchmarks by niche
- [x] `GET /api/v1/market/opportunities` — Actionable opportunities
- [x] 18 tests for all extraction/report functions

## Phase 6 — Ops & Refinement

- [ ] Session start summary: lead counts, last run timestamps, overdue follow-ups
- [ ] Morning 30min ritual: prospect + review HOT + check market
- [ ] Midday 20min: approve/send drafts
- [ ] Evening 15min: reply triage
- [ ] Weekly Friday: batch WARM review, `/debug` health check, asset registry update, market trends review
- [ ] Follow-up automation: detect overdue follow-ups, generate bump drafts
- [ ] Reply triage: classify + route (proposal / rate / decline / DEAD)
- [ ] Wire `/prospect`, `/translate`, `/outreach`, `/proposal`, `/rate` as opencode commands

---

## Complete File Inventory (when finished)

```
/var/home/sgm/Github Repo's/Audio Freelance Dev System/
├── BUILD_PLAN.md
├── README.md
├── pyproject.toml
├── .env
├── main.py                          # uvicorn entry point
├── leads/
│   ├── __init__.py
│   ├── schema.py                    # Lead model, RawCandidate, LeadStatus
│   └── store.py                     # ChromaDB: embed, dedup, upsert, query
├── search/
│   ├── __init__.py
│   ├── base.py                      # Shared search utilities + fallback chain
│   ├── tier1.py                     # KVR, JUCE, Reddit
│   ├── tier2.py                     # We Work Remotely, RemoteOK, Wellfound, HN
│   ├── tier3.py                     # Audio Programmer, ADC, GitHub, music-tech
│   └── tier4.py                     # Plugin companies, YC startups, AI-audio
├── scoring/
│   ├── __init__.py
│   ├── score.py                     # Main scoring pipeline
│   ├── signals.py                   # Signal detection patterns
├── graph/
│   ├── __init__.py
│   ├── state.py                     # Pipeline state TypedDict
│   └── pipeline.py                  # LangGraph DAG
├── api/
│   ├── __init__.py
│   └── routes.py                    # FastAPI endpoints
├── generate/
│   ├── __init__.py
│   ├── translate.py
│   ├── outreach.py
│   ├── proposal.py
│   └── rate.py
├── assets/
│   ├── __init__.py
│   └── registry.py
├── debug/
│   ├── __init__.py
│   └── diagnostics.py
└── tests/
    ├── test_schema.py
    ├── test_store.py
    ├── test_search.py
    ├── test_score.py
    ├── test_signals.py
    └── test_pipeline.py
```

## Verification Gate per Phase

| Phase | Verify |
|-------|--------|
| **Phase 1** | `pytest` passes; `POST /prospect/plugin_contract` returns scored leads with verdicts |
| **Phase 2** | `/translate` returns asset-registry-checked pitch; `/outreach/{id}` creates Gmail draft |
| **Phase 3** | Full pipeline runs end-to-end: search → dedup → score → draft → Gmail + Slack |
| **Phase 4** | `/debug` returns DiagnosticReport covering all 6 failure modes |
| **Phase 5** | Session start summary surfaces correct counts and overdue follow-ups |
