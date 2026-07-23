# SGM OUTREACH ENGINE — BUILD SPEC v1.0
Drop this file in the repo root. Point Cursor agents at it. It is the source of truth.

## 0. MISSION
Automated pipeline: **source → enrich → score → draft → approve → send → follow-up**, targeting music-tech / iOS-audio / plugin / AI-audio companies with the locked offer:

> "I build real-time audio DSP engines — C++/Rust — for iOS apps, plugins, and embedded hardware. On-device ML inference included. Fixed-scope builds or monthly retainer."

**Numbers:** 30 targets loaded week 1. 10 outreach units/day sustained. Human time budget: ≤15 min/day (one approval pass).

## 1. HARD CONSTRAINTS (non-negotiable)
1. **Channel rules — bake into architecture, not policy docs:**
   - **Email:** fully automated send via **Resend** API. Every message carries CASL block: real name, SGM Studios, business contact, working unsubscribe link honored in-pipeline. B2B addresses scraped only from publicly posted business contact pages.
   - **LinkedIn / Sales Navigator:** NO automated sending, NO headless scraping of SN. Automation on SN = account termination and it's the highest-value asset in the stack. SN is a **source** (native CSV lead exports → ingest) and a **surface** (pipeline outputs ready-to-paste messages + deep links; human clicks send). Drafting 100% automated, transmission manual.
   - **Upwork:** proposals drafted by pipeline, submitted manually. Job feed ingested via RSS/saved-search URLs.
2. **Stack:** TypeScript, pnpm monorepo, Node 22, SQLite (better-sqlite3), Playwright for scraping, Zod everywhere, DeepSeek API for drafting (prod), Ollama fallback (local). n8n only for cron triggers + approval webhooks — all logic lives in this repo, not in n8n nodes.
3. **No stubs. No placeholders. No mock data outside tests.** Every milestone ends runnable.
4. Dev environment: Bazzite host — everything runs in **distrobox/Docker**. No dnf/rpm on host. Compose file required.

## 2. ARCHITECTURE (12-factor agent mapping)
Pipeline is a **stateless reducer over a persistent lead state machine** (Factors 5, 6, 12). Control flow is explicit code (Factor 8). LLM only does two jobs: extract structured facts from scraped pages, and draft copy — both return **Zod-validated JSON** (Factor 4). Human approval is a first-class pipeline step (Factor 7), not a side channel.

```
packages/
  core/        # domain types, Zod schemas, state machine, SQLite repo
  ingest/      # sources: appstore-auv3, salesnav-csv, upwork-rss, jobboards
  enrich/      # playwright site scraper → LLM fact extractor → contact finder
  score/       # deterministic scoring (no LLM)
  draft/       # LLM copywriter, per-channel templates
  approve/     # digest generator + n8n webhook receiver (approve/reject/edit)
  send/        # resend-email (auto), linkedin-queue (manual surface), upwork-queue
  followup/    # scheduler: day-4, day-10, day-60 cadence
  cli/         # single entrypoint: sgm-outreach <command>
docker-compose.yml   # app + n8n
```

### Lead state machine (core/)
```
NEW → ENRICHED → SCORED → DRAFTED → PENDING_APPROVAL
    → APPROVED → SENT → { REPLIED | NO_REPLY }
NO_REPLY → FOLLOWUP_1(+4d) → FOLLOWUP_2(+10d) → NURTURE(+60d)
REPLIED → HUMAN (pipeline stops touching it)
Any state → REJECTED | BOUNCED | UNSUBSCRIBED (terminal, never re-contact)
```
Every transition is a row in `events` (append-only). Pipeline is resumable from DB alone — kill it anytime, restart, nothing lost (Factor 6).

### Data model (SQLite)
```sql
companies(id, name, domain, tier INT, segment TEXT, source TEXT, created_at)
contacts(id, company_id, name, role, email, linkedin_url, email_source TEXT)
facts(id, company_id, fact TEXT, evidence_url, extracted_at)  -- for personalization
leads(id, company_id, contact_id, channel TEXT, state TEXT, score INT, updated_at)
drafts(id, lead_id, subject, body, personalization_fact_id, model, created_at)
events(id, lead_id, from_state, to_state, meta JSON, at)
suppressions(email TEXT PRIMARY KEY, reason TEXT, at)  -- unsubscribes/bounces, checked before EVERY send
```

### Scoring (deterministic, no LLM)
+30 segment match (iOS audio/AI-audio/plugin/hardware) · +20 team size ≤15 · +20 evidence of shipping (App Store updates <90d, active blog/repo) · +15 named technical contact found · +15 explicit hiring/contract signal · −50 no contact path. Threshold ≥60 to draft.

## 3. SOURCES (ingest/)
1. **appstore-auv3:** iTunes Search API (`media=software`, music category) + AUv3 keyword set → filter small devs → emit companies. No scraping needed for v1; API is public JSON.
2. **salesnav-csv:** watch `./inbox/*.csv` (manual SN lead-list exports), parse, dedupe by domain.
3. **upwork-rss:** poll saved-search RSS URLs (config), keyword-filter (DSP, audio, C++, real-time, VST, AUv3), emit as `channel=upwork` leads.
4. **jobboards:** Soundlister + The Audio Programmer job posts (Playwright, polite rate limits, robots-aware) — contract/freelance flags only.

## 4. DRAFTING RULES (draft/)
- Input: contact + top-scored `fact` + channel. Output schema: `{subject?, body, fact_used, risk_flags[]}`.
- Body ≤120 words email, ≤80 words LinkedIn, Upwork proposal ≤200.
- Must reference exactly one concrete fact with its evidence URL logged. **If no fact scores high enough, the lead does NOT get drafted — it gets flagged for manual research.** Generic spray is a fail state.
- Template skeleton (email): observation → one-line credibility ("currently shipping a portamento engine for an iOS synth client") → offer sentence → 20-min call CTA. CASL footer appended by send/, not by the LLM.
- Temperature 0.4. Ban list: "I hope this finds you well", "I came across", "synergy", em-dash chains, any claim about SGM projects not in `config/claims.json` (allowlist of true, verifiable claims — **this is the anti-drift mechanism; the LLM cannot invent credentials**).

## 5. APPROVAL LOOP (approve/)
- 8:00 daily: digest of PENDING_APPROVAL drafts → n8n webhook → Telegram/email with per-draft `approve|edit|reject` links.
- Approve → APPROVED → send/ picks up. Edit → returns diff to drafts table, re-queues. Reject → REJECTED + reason logged (feeds ban list).
- **Kill switch:** `sgm-outreach pause` halts all sends globally.

## 6. FOLLOW-UP (followup/)
Cron hourly. NO_REPLY leads past threshold get follow-up drafted (new fact if available, shorter), same approval loop. Day-4 bump, day-10 value-add (link to relevant SGM public repo), day-60 nurture. Reply detection: Resend inbound webhook + IMAP poll; any reply → HUMAN state instantly.

## 7. MILESTONES — build in this order, each ends GREEN
- **M0 scaffold:** monorepo, core types, state machine, SQLite migrations, CLI skeleton, compose file. ✅ `pnpm test` green; `sgm-outreach status` prints empty pipeline.
- **M1 ingest:** all 4 sources + manual `add-company`. ✅ 30 real companies loaded, deduped; fixture-based tests per parser.
- **M2 enrich+score:** Playwright scraper (homepage/about/contact/blog, 3-page cap, 1 req/s/domain), LLM fact extraction w/ Zod retry-on-invalid (Factor 9: validation errors fed back into retry context), contact finder, deterministic scorer. ✅ 10 leads reach SCORED with ≥2 facts each; scraper respects robots.txt in tests.
- **M3 draft+approve:** DeepSeek drafter, claims allowlist enforcement, digest, n8n webhook receiver. ✅ end-to-end: SCORED lead → draft in Telegram digest → approve → APPROVED in DB.
- **M4 send+followup:** Resend integration + CASL footer + suppression check + unsubscribe endpoint, LinkedIn paste-queue view (`sgm-outreach queue linkedin`), Upwork proposal queue, follow-up scheduler. ✅ test email delivered to own address w/ working unsubscribe; suppressed address provably blocked; follow-up fires on time-mocked clock.
- **M5 ops:** metrics (`sent/replies/bounces by day/segment`), reply webhook, pause/resume, README runbook. ✅ full dry-run of 10 leads in staging mode (sends to sink address).

## 8. FAILURE MODES & EVAL (check every milestone)
| Failure | Mitigation | Test |
|---|---|---|
| LLM invents credentials (drift) | claims.json allowlist, draft rejected if claim not matched | unit: draft w/ fabricated claim → rejected |
| Duplicate outreach to same person | unique (contact_id, channel) + suppression table | unit + integration |
| Sending to unsubscribed/bounced | suppression checked at send-time, not draft-time | integration |
| Scraper bans | rate limit, UA honesty, robots.txt, 3-page cap | scraper test suite |
| Zod-invalid LLM output | 2 retries w/ error compacted into prompt, then flag manual | unit |
| SN account risk | architecture: no SN automation exists in codebase | code review gate |
| Pipeline dies mid-run | state machine + append-only events; idempotent stages | kill -9 mid-run test |
| Generic spam output | fact required, ban-list lint on every draft | draft lint test |

**Weekly eval:** reply rate ≥3% (below → rewrite templates, not more volume) · bounce <2% (above → fix contact finder) · approval-edit rate <30% (above → drafter prompt iteration).

## 9. CURSOR AGENT SYSTEM PROMPTS (verbatim)

### 9.1 ORCHESTRATOR (planning chat — never writes code)
```
You are the build orchestrator for SGM OUTREACH ENGINE. Source of truth: OUTREACH_BUILD_SPEC.md. You do not write implementation code. Your jobs: (1) break the current milestone into ordered tasks with explicit file paths and acceptance tests, (2) after BUILDER output, verify against the spec's milestone criteria and failure-mode table, (3) refuse scope creep — anything not in the spec goes to a BACKLOG.md, not into code. If required context is missing (API keys, CSV samples, config), STOP and list exactly what you need. Never assume a milestone passed without seeing test output.
```

### 9.2 BUILDER (implementation agent)
```
You are the implementation agent for SGM OUTREACH ENGINE. Source of truth: OUTREACH_BUILD_SPEC.md — read it fully before any task. Rules: TypeScript strict mode; Zod schemas for every LLM/tool boundary and every external input; no stubs, no TODOs, no mock data outside tests/fixtures; every function complete and typed; better-sqlite3 with migrations in core/; explicit control flow — no logic hidden in prompts or n8n; small focused modules per the package layout. Each task: implement + tests + run tests + report actual output. If a test fails, compact the error and fix it before reporting done. If you need a real credential or sample file, stop and ask — do not fabricate. Compliance constraints in §1 are architectural law: if a task would violate them, refuse and flag the ORCHESTRATOR.
```

### 9.3 REVIEWER (adversarial pass, run after each milestone)
```
You are the red-team reviewer for SGM OUTREACH ENGINE. Audit the diff against OUTREACH_BUILD_SPEC.md §1 (constraints), §8 (failure modes), and the milestone's acceptance tests. Actively hunt for: stubbed/dead code, untyped LLM boundaries, missing suppression checks, any code path that could auto-send to LinkedIn or scrape Sales Navigator, SQL injection in dynamic queries, unvalidated external input, race conditions in the state machine, secrets in code. Output: BLOCKERS (must fix), RISKS (should fix), PASS/FAIL verdict per acceptance test. Be blunt. A polite review that misses a blocker is a failed review.
```

## 10. YOU PROVIDE BEFORE M2/M3 (BUILDER will ask)
- DEEPSEEK_API_KEY, RESEND_API_KEY (+ verified domain sgmstudios.ca)
- One real Sales Navigator CSV export (fixture)
- Upwork saved-search RSS URLs
- `config/claims.json` — the honest claims list (start: TrackClear live on ReaPack; portamento engine contract in progress; makingmadi.com built & operating; 17y audio engineering)
- Telegram bot token or approval email address
