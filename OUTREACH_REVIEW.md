# OUTREACH_REVIEW — red-team audit

**Date:** 2026-07-23  
**Scope:** `packages/*` vs `OUTREACH_BUILD_SPEC.md` §1 (hard constraints) and §8 (failure modes)  
**Verdict:** **FAIL for production outreach** — M0–M2 + partial M4/M5 exist; M3 draft/approve empty; LinkedIn/Upwork paste queues and follow-up missing. No LI auto-send or SN scrape found in tree.

---

## §1 HARD CONSTRAINTS

| Constraint | Status | Evidence |
|---|---|---|
| Email via Resend + CASL footer (real name, SGM Studios, contact, unsub) | **PARTIAL PASS** | `packages/send/src/email.ts`, `casl.ts`, `unsubscribe.ts`. Footer appended in send/, not LLM. |
| Suppression checked before every send (fail closed) | **PASS** (email path) | `isEmailSuppressed` on intended address before staging redirect; tests in `packages/send/tests/email.test.ts`. |
| Kill switch `settings.paused` | **PASS** | `core` `setPaused` / `isPaused`; CLI `pause`/`resume`; send drains abort when paused; ops dry-run proves pause gate. |
| Staging sink (`SGM_OUTREACH_STAGING` + sink email) | **PASS** | `loadSendConfig` + email send redirect; dry-run forces staging. |
| LinkedIn: **NO auto-send**, paste-only surface | **PASS (absence)** | Grep finds no LinkedIn API/post/automation. `sendApprovedLead` rejects non-email channels. UI `/outreach` is copy+deep-link only. |
| Sales Nav: **NO scrape** — CSV ingest only | **PASS** | `packages/ingest/src/sources/salesnav-csv.ts` parses inbox/fixtures CSV only. No Playwright against linkedin.com. |
| Upwork: draft auto / submit manual | **MISSING** | No upwork-queue package/CLI; ingest RSS exists. |
| Stack: TS / pnpm / SQLite / Zod / Playwright enrich | **PASS** (core path) | Monorepo packages present; enrich uses Playwright + robots. |
| No stubs / placeholders outside tests | **FAIL** | Empty `packages/draft`, `packages/approve` dirs; send index explicitly notes LI/Upwork queues “not implemented here”; no `followup` package. |

---

## §8 FAILURE MODES

| Failure | Mitigation present? | Notes |
|---|---|---|
| LLM invents credentials | **MISSING** | No draft package → no claims allowlist enforcement on copy yet. `config/claims.json` + `ClaimSchema` exist in core. |
| Duplicate outreach (contact, channel) | **PASS** | `UNIQUE (contact_id, channel)` in migrations; `ensureLead` lookup. |
| Send to unsubscribed/bounced | **PASS** (email) | Suppression at send-time; bounce webhook → suppression in `packages/ops`. |
| Scraper bans | **PASS** | Rate limit, honest UA, robots.txt, 3-page cap + tests. |
| Zod-invalid LLM output | **PARTIAL** | Enrich LLM path has Zod; draft path absent. |
| SN account risk | **PASS** | No SN automation in codebase (review gate). |
| Pipeline dies mid-run | **PASS** (architecture) | State machine + events table; stages idempotent by design. |
| Generic spam | **MISSING** | Draft ban-list / fact-required lint not implemented (no draft/). |

**Weekly eval metrics:** `packages/ops` + CLI `metrics` exist (sent/replies/bounces). Not a §1 blocker.

---

## BLOCKERS (must fix before live email volume)

1. **`packages/draft` and `packages/approve` are empty shells** — no sources, no package.json. Spec M3 (SCORED → PENDING_APPROVAL → APPROVED) cannot run. Without this, send has nothing legitimate to drain except hand-forced APPROVED rows.
2. **`packages/send` has no LinkedIn/Upwork paste queues** — M4 requires `sgm-outreach queue linkedin` + `queue upwork`. Frontend LinkedIn paste UI reads DB, but CLI queue surface is missing.
3. **`packages/followup` missing** — day-4 / 10 / 60 cadence not in tree.
4. **Live Resend blocked without `RESEND_API_KEY`** — CLI correctly refuses; not a code stub, but ops cannot ship without key + verified domain.
5. **Pipeline stuck at NEW** — live `data/outreach.sqlite` currently ~278 leads all in `NEW` (enrich/score not run at scale). Not a compliance bug; blocks “proud ops” funnel beyond ingest.

---

## RISKS (should fix)

1. **Kill-switch UI writes SQLite directly** from Next (`setOutreachPaused`) while CLI uses `@sgm-outreach/core` — two writers; fine for solo ops, race-y if concurrent.
2. **Turbopack NFT warning** on `outreach-db.ts` path resolution (`next build` still passes).
3. **Send `unsubSecret` falls back to `RESEND_API_KEY`** when unset — couples token secret to vendor key; prefer dedicated `SGM_OUTREACH_UNSUB_SECRET`.
4. **Empty draft/approve directories** invite agents to assume M3 exists — delete or implement soon.
5. **Jobboards Playwright** is live-capable (`--live`); keep default off (already is) so polite scraping stays intentional.
6. **No LI auto-send today ≠ forever** — add a CI grep gate for `linkedin.com` + automation keywords as §8 “code review gate” automation.

---

## Hunt results (explicit)

| Hunt | Result |
|---|---|
| LinkedIn auto-send | **Not found.** Email send rejects `channel !== "email"`. Test asserts LinkedIn APPROVED leads are not sent. |
| Sales Nav scrape | **Not found.** CSV-only ingest. |
| Missing suppressions | **Email path OK.** Core `isEmailSuppressed` + send pre-check + unsubscribe/bounce writers. Zero suppressions in live DB (expected pre-send). |
| Stubs / hollow packages | **Found:** empty draft/, approve/; missing followup/; send queues deferred by comment. |

---

## Package map (as audited)

| Package | Milestone | State |
|---|---|---|
| core | M0 | Present — schemas, SM, SQLite, suppressions, pause |
| ingest | M1 | Present — appstore, salesnav-csv, upwork-rss, jobboards |
| enrich | M2 | Present — Playwright + robots + LLM facts |
| score | M2 | Present — deterministic |
| draft | M3 | **Empty dir** |
| approve | M3 | **Empty dir** |
| send | M4 | Email path present; LI/Upwork queues **not here** |
| followup | M4 | **Missing** |
| ops | M5 | metrics, webhooks, dry-run present |
| cli | M0+ | status/pause/resume/ingest/enrich/score/send/metrics/dry-run/webhook |

---

## Acceptance vs §9.3 reviewer prompt

- Actively hunted LI auto-send / SN scrape → **clean**.
- Suppression on email send → **present**.
- Stubbed/dead surfaces → **BLOCKERS above**.
- **Overall:** architecture respects §1 channel law where code exists; **cannot PASS** milestone readiness until M3 + paste queues + followup land.
