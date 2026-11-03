# Product Requirements Document — Audio-Freelance

**Version:** 0.1.2
**Author:** SGM (scott@audio.dev)
**Status:** Active Development

---

## 1. Business Problem

Freelance audio DSP, plugin, and ML engineers spend 15–30 hours per week on lead generation: manually searching job boards, Reddit threads, startup funding announcements, and GitHub repositories. The signal-to-noise ratio is brutal — 90% of search results are irrelevant to the niche.

**The expensive problem:** A senior audio engineer's billable rate is $150–300/hr. Every hour spent hunting instead of building costs $150–300 in opportunity cost. At 20 hrs/week of manual prospecting, that's $3,000–6,000/week in lost revenue.

## 2. Target Users

- Solo freelance audio/DSP/plugin developers
- Audio ML engineers seeking contract work
- REAPER script developers monetizing extensions
- Audio tech startups scouting contract talent pools

## 3. Target Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to first qualified lead | ~4 hrs manual | <5 min automated |
| Leads discovered per session | 3–5 manual | 50+ parallel |
| Deduplication accuracy | 0% (manual) | 92%+ (embedding cosine) |
| Lead qualification accuracy | Gut feel | Profile-scored (HOT/WARM/COLD) |
| Outreach generation time | 20 min/email | <10 sec/lead |
| Market signal coverage | 1–2 sources | 6 categories, 14+ technologies |

## 4. Functional Requirements

### 4.1 Multi-Tier Search Pipeline

| Tier | Frequency | Sources | Purpose |
|------|-----------|---------|---------|
| Tier 1 | Daily | KVR Audio, JUCE Forum, Reddit (audio_programming, REAPER) | Niche communities |
| Tier 2 | Weekly | We Work Remotely, RemoteOK, Wellfound, HN Algolia | Job boards + startups |
| Tier 3 | Niche | Audio Programmer, GitHub bounties, music-tech forums | Specialized channels |
| Tier 4 | Outbound | Plugin companies, YC audio startups, AI-audio startups | Direct outreach |
| Tier 5 | On-demand | Greenhouse, Lever, Ashby ATS APIs | Structured job data |

### 4.2 Deduplication Engine

- **Within-run dedup:** URL canonicalization (strip UTM params, tracking keys, normalize scheme/www)
- **Semantic dedup:** Ollama `nomic-embed-text` embeddings → ChromaDB cosine similarity (threshold: 0.92)
- **Cross-source dedup:** ChromaDB store prevents re-discovering previously scored leads

### 4.3 Signal Scoring

- Profile-based scoring against user-defined preferences (languages, frameworks, niches, rate floors, dealbreakers)
- Verdict classification: HOT (score ≥10), WARM (score ≥5), COLD, SKIP
- HOT/WARM leads persist in ChromaDB; COLD/SKIP archived to date-stamped JSONL

### 4.4 Market Intelligence

Six-category parallel scanner:

| Category | Signal Type |
|----------|-------------|
| Funding | VC rounds, seed/Series A (hiring signal) |
| Technology Trends | CLAP, Mamba/SSM, Rust Audio, ARA adoption |
| Product Launches | New plugins, DAW features, AI music tools |
| Pricing | Rate benchmarks from job posts + freelance platforms |
| Hiring Signals | Companies building audio teams |
| GitHub Trending | Open-source audio tooling activity |

Tracked technologies: CLAP, ARA 2, Mamba/SSM, Rust Audio, ONNX, LibTorch, REAPER, Web Audio, Neural Audio Codecs, Source Separation, FAUST, JUCE, RTNeural, MIR.

### 4.5 Outreach Generation

- Template-based drafts (A: plugin contract, B: consulting, C: retainer, D: partnership)
- Asset registry claim validation before sending
- Human-in-the-loop approval gate — no automated sending without review

### 4.6 API & Dashboard

- FastAPI backend on :8080 with OpenAPI docs at `/docs`
- Next.js 16 dark-mode dashboard on :3000
- 15+ REST endpoints: health, leads, prospect, score, outreach, proposal, market, triage, metrics

## 5. Non-Functional Requirements

| Constraint | Requirement |
|------------|-------------|
| Python version | ≥3.12 |
| Node.js version | ≥22 |
| Response time | Pipeline run <30s for 50 leads |
| Concurrency | 5 search tiers run in parallel (asyncio.gather) |
| Data integrity | Pydantic validation on all inputs; ChromaDB ACID transactions |
| Observability | Prometheus metrics, Sentry error tracking, structured JSON logging |
| Security | Bearer token auth, rate limiting (60 req/min), CORS allowlist |
| Deployment | Docker + Fly.io; CI via GitHub Actions (lint + test + build + docker) |
| Testing | 81+ unit tests (pytest-asyncio); ruff lint; mypy type checking |

## 6. Technical Constraints

- **Ollama dependency:** Embeddings require local Ollama server with `nomic-embed-text`. System degrades gracefully (dedup disabled) if unreachable.
- **Search API keys:** Tavily (primary), Serper (fallback), Firecrawl (final fallback). At least one required for search to function.
- **No automated sending:** Outreach drafts are queued for human review. No SMTP/email integration — intentional design decision.
- **Single-user architecture:** RBAC not in scope. API_KEY is optional (open access in dev).

## 7. Success Criteria

1. Pipeline discovers ≥20 qualified leads per niche run (vs. 3–5 manual)
2. Dedup eliminates ≥90% of duplicate results across search tiers
3. Scoring correctly classifies ≥80% of leads as HOT/WARM vs. COLD (validated against user feedback)
4. Market intelligence covers all 6 categories with ≥3 signals each
5. Total system runs locally with no cloud compute required (Ollama + ChromaDB)

## 8. Out of Scope

- Multi-user / SaaS billing
- Automated email sending
- CRM integration (Hubspot, Salesforce)
- Mobile app
- AI-generated cover letters (template-based outreach only)
