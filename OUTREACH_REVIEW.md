# OUTREACH_REVIEW — red-team audit

**Date:** 2026-07-23 (post M3+M4)  
**Scope:** `packages/*` vs `OUTREACH_BUILD_SPEC.md` §1 (hard constraints) and §8 (failure modes)  
**Prior verdict:** FAIL — empty `packages/draft` + `packages/approve`  
**Current verdict:** **PASS on package completeness (M0–M5 code exists and unit-tests green).** Not a green light for unattended live volume — see BLOCKERS/RISKS.

Tests verified this pass: `@sgm-outreach/{draft,approve,followup,send}` — 29 tests, all green.

---

## Confirmed hard constraints (§1 / §8 hunt)

| Check | Result | Evidence |
|---|---|---|
| **No LinkedIn auto-send** | **PASS** | `sendApprovedLead` rejects `channel !== "email"`. CLI `queue linkedin` is paste+deep-link only (`packages/cli/src/queue.ts`). No LI post/API client in tree. |
| **No Sales Nav scrape** | **PASS** | `packages/ingest/src/sources/salesnav-csv.ts` — inbox/fixture CSV only. No Playwright against linkedin.com. |
| **Suppression before every send** | **PASS** | `isEmailSuppressed` on *intended* email before staging redirect (`packages/send/src/email.ts`). Fail-closed on check error. Tests cover block path. |
| **Claims allowlist** | **PASS (present)** | `config/claims.json` + `lintClaims` + `validateDraftOutput` in draft path. Fabricated markers rejected in unit tests. |
| **Pause kill switch** | **PASS** | `settings.paused` via `setPaused`/`isPaused`; CLI `pause`/`resume`; send aborts mid-batch; approve blocked while paused; ops dry-run proves gate. |

---

## §1 HARD CONSTRAINTS (detail)

| Constraint | Status | Evidence |
|---|---|---|
| Email via Resend + CASL footer | **PASS** | `email.ts`, `casl.ts`, `unsubscribe.ts`. Footer in send/, not LLM. |
| Suppression at send-time | **PASS** | As above. |
| Kill switch | **PASS** | core + CLI + send + approve. |
| Staging sink | **PASS** | `loadSendConfig` + dry-run forces staging. |
| LinkedIn paste-only | **PASS** | `sgm-outreach queue linkedin`. |
| SN CSV-only | **PASS** | ingest source. |
| Upwork draft auto / submit manual | **PASS** | `sgm-outreach queue upwork` paste surface; no submit API. |
| Stack TS/pnpm/SQLite/Zod/Playwright | **PASS** | Monorepo + compose `outreach` profile + n8n. |
| No stubs outside tests | **PASS** (packages) | draft/approve/followup now real sources + tests. `send` comment still says queues “not here” — outdated; queues live in CLI. |

---

## §8 FAILURE MODES

| Failure | Mitigation present? | Notes |
|---|---|---|
| LLM invents credentials | **PASS** | claims.json + lint + retries; unit rejects fabricated. Gaps: see RISKS (weak regex gate, edit/followup bypass). |
| Duplicate outreach | **PASS** | `UNIQUE (contact_id, channel)`. |
| Send to unsub/bounce | **PASS** | Suppression at send; bounce webhook → suppression. |
| Scraper bans | **PASS** | Rate limit, UA, robots, 3-page cap + tests. |
| Zod-invalid LLM output | **PASS** | Draft: 2 retries w/ error in prompt, then skip. Enrich path already had this. |
| SN account risk | **PASS** | No SN automation. |
| Pipeline dies mid-run | **PASS** | State machine + events; stages resumable. |
| Generic spam | **PASS** | Fact required or `no_fact_manual_research`; ban-list lint. |

---

## BLOCKERS (must fix before live email volume)

1. **Approval webhook has zero auth** (`packages/approve/src/webhook.ts`). POST JSON `{action, draft_id}` → approve. Default bind is `127.0.0.1` (good), but if you ever expose `:8788` or tunnel it for Telegram/n8n without a shared secret, anyone who can hit it can approve and arm the send drain. **Add a shared secret header before non-loopback use.**
2. **Live Resend still needs ops keys** — `RESEND_API_KEY` + verified domain (`sgmstudios.ca`). CLI correctly refuses without key. Code is ready; volume is not until keys + a real staging send to your own inbox.
3. **Do not treat “PASS packages” as “Telegram digest e2e proven.”** Digest + optional `N8N_APPROVAL_WEBHOOK_URL` push exist; native Telegram bot wiring is n8n’s job and was not exercised in this audit.

No empty-package blockers remain. Prior FAIL root cause is fixed.

---

## RISKS (should fix)

1. **`approve edit` does not re-run banlist/claims lint** — human can paste banned phrases or invented credentials straight into the draft and re-queue. Trust humans or re-validate.
2. **Follow-up bodies are template strings**, not `validateDraftOutput` — skip LLM anti-drift. Day-10 hardcodes TrackClear (allowlisted); still a second code path that can drift.
3. **Claims lint is reactive, not exhaustive** — only fires fabricated markers + a regex for known SGM credential tokens. Invented prestige without those tokens can slip (`"I rebuilt Spotify's master bus"`). Tighten: require at least one allowlisted phrase when credibility sentences appear, or ban unverified first-person ship claims.
4. **`unsubSecret` can fall back to `RESEND_API_KEY`** — couples unsub HMAC to vendor key. Prefer dedicated `SGM_OUTREACH_UNSUB_SECRET`.
5. **No automated CI gate** for LI/SN automation keywords — today absence is manual review. Add a cheap grep job.
6. **Dual pause writers** (Next UI SQLite vs `@sgm-outreach/core` CLI) — fine for solo; race-y if concurrent.
7. **Stale comment** in `packages/send/src/index.ts` claims LI/Upwork queues “not implemented here” — queues are CLI; update comment to avoid agent confusion.

---

## Hunt results (explicit)

| Hunt | Result |
|---|---|
| LinkedIn auto-send | **Not found.** Email-only send; paste queue only. |
| Sales Nav scrape | **Not found.** CSV ingest only. |
| Missing suppressions on email send | **Not found.** Pre-send check + tests. |
| Claims allowlist | **Present** on draft path; tests green. |
| Pause kill switch | **Present** send + approve + CLI + dry-run. |
| Stub packages | **Gone.** draft / approve / followup implemented. |

---

## Package map (as audited)

| Package | Milestone | State |
|---|---|---|
| core | M0 | Present — schemas, SM, SQLite, suppressions, pause, claims load |
| ingest | M1 | Present — appstore, salesnav-csv, upwork-rss, jobboards |
| enrich | M2 | Present — Playwright + robots + LLM facts |
| score | M2 | Present — deterministic |
| draft | M3 | **Implemented** — DeepSeek/Ollama/fixtures, banlist, claims lint, retries |
| approve | M3 | **Implemented** — digest, approve/reject/edit, webhook serve |
| send | M4 | Email Resend + CASL + suppression + unsub |
| followup | M4 | Day-4/10/60 + mocked clock tests |
| ops | M5 | metrics, reply/bounce webhooks, dry-run |
| cli | M0–M5 | status/pause/resume/ingest/enrich/score/draft/approve/send/queue/followup/metrics/webhook/dry-run |

---

## PASS/FAIL per milestone

| Milestone | Verdict | Notes |
|---|---|---|
| **M0 scaffold** | **PASS** | Monorepo, core SM/migrations, CLI status, compose (+ outreach profile). |
| **M1 ingest** | **PASS** | Four sources + `add-company`; fixture tests. |
| **M2 enrich+score** | **PASS** | Playwright scraper + robots + deterministic score. |
| **M3 draft+approve** | **PASS** | Package code + unit tests cover SCORED→draft→digest→approve→APPROVED and pause-on-approve. Live Telegram/n8n loop not audited here. |
| **M4 send+followup** | **PASS** | Resend path + CASL + suppression + unsub + `queue linkedin\|upwork` + followup cadence with time-mocked tests. Live “test email to own address” is ops, not missing code. |
| **M5 ops** | **PASS** | metrics, reply/bounce webhook, pause/resume, dry-run, runbook. |

**Overall (packages vs spec):** **PASS** — previous empty-package FAIL is cleared.  
**Overall (ship live volume tomorrow):** **NO** until webhook secret (if exposed) + Resend keys + one staged self-send.

---

## Acceptance vs §9.3 reviewer prompt

- Hunted LI auto-send / SN scrape → **clean**.
- Suppression on email send → **present**.
- Claims allowlist → **present** (with lint gaps noted).
- Pause kill switch → **present**.
- Stubbed draft/approve → **fixed**.
- Be blunt: architecture now matches §1 channel law end-to-end in code. Remaining failure modes are auth hygiene on approve serve, claims-lint completeness, and ops credentials — not missing packages.
