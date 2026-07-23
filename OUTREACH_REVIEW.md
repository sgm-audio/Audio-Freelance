# OUTREACH_REVIEW — §9.3 red-team audit

**Date:** 2026-07-22  
**Auditor:** REVIEWER §9.3  
**SoT status:** `OUTREACH_BUILD_SPEC.md` on disk is a **3-line stub**. Audit criteria recovered from the 2026-07-21 Write in parent transcript (full v1.0). Until the real spec is restored, every agent is flying blind.

**Scope:** `packages/*`, `config/*`, `docker-compose.yml` outreach profile. Hunt: stubs, untyped LLM boundaries, missing suppressions, LI auto-send / SN scrape, SQLi, unvalidated input, state-machine races, secrets in code.

---

## Verdict

**M0–M2 are partially real. M3–M5 are vapor.**  
No LinkedIn auto-send and no Sales Navigator scrape paths exist in code — that part of §1 holds by absence. Everything that requires send/draft/approve/followup is missing or empty. Do not call the pipeline GREEN.

---

## BLOCKERS (must fix)

### B1 — Source of truth destroyed
`OUTREACH_BUILD_SPEC.md` is a stub. Spec §9.3 cannot be enforced against a missing document. Restore the full v1.0 text (transcript has it) before more BUILDER work.

### B2 — M3 packages are empty shells
`packages/draft/` and `packages/approve/` exist with empty `src/` + `tests/` directories. No `package.json`, no TypeScript, no Zod draft schema enforcement, no claims allowlist at draft time, no digest, no webhook receiver.  
§1 “No stubs” violated. §8 “LLM invents credentials” mitigation **not wired** (claims.json loads in core tests only).

### B3 — M4 packages absent
`packages/send/` and `packages/followup/` **do not exist**.  
No Resend, no CASL footer append, no unsubscribe endpoint, no LinkedIn paste queue CLI, no Upwork queue, no day-4/10/60 scheduler.  
`isEmailSuppressed()` exists in core but **nothing calls it on a send path** — §8 “suppression checked at send-time” is untestable and unimplemented.

### B4 — No `addSuppression` / bounce / unsubscribe write API
Core exports `isEmailSuppressed` only. No first-class writer for suppressions + `UNSUBSCRIBED`/`BOUNCED` transitions. M4/M5 acceptance (unsub + bounce) cannot land cleanly without this.

### B5 — Outreach Docker image is incomplete
`docker-compose.yml` has `profiles: ["outreach"]` for `outreach` + `n8n`, but `packages/cli/Dockerfile` only `COPY`s **core + cli**. CLI commands `ingest` / `enrich` / `score` depend on sibling packages that are never installed in the image. Compose “works” for `status` only — false confidence.

### B6 — `transitionLead` is not concurrency-safe
```314:345:packages/core/src/repo.ts
export function transitionLead(...) {
  // SELECT state → assertTransition → UPDATE ... WHERE id = ?
  // no WHERE state = from
}
```
Two workers can both observe `NEW`, both assert `NEW→ENRICHED`, both write. Append-only events then lie. Spec §8 “Pipeline dies mid-run / idempotent stages” and Factor 6 resumability require optimistic `UPDATE ... WHERE id=? AND state=?` (fail if `changes===0`) or equivalent.

### B7 — Ingest contact insert ignores email uniqueness
`writeCandidates` always `insertContact`s. Unique index `contacts_email_unique` will **throw** on re-ingest of the same email instead of deduping via `findContactByEmail`. Re-running Sales Nav CSV / enrich contact discovery can abort the whole transaction.

---

## RISKS (should fix)

### R1 — SQLite UNIQUE allows duplicate NULL-contact leads
`UNIQUE (contact_id, channel)` does not prevent multiple `contact_id IS NULL` rows for the same company/channel (SQLite NULL ≠ NULL). `ensureLead` queries carefully for NULL, but a raw INSERT or race can still create dupes. Prefer a partial unique index or synthetic sentinel.

### R2 — Pause kill switch is advisory only
`sgm-outreach pause` persists `settings.paused`. No send package reads it yet. When M4 lands, fail-closed on pause is mandatory — wire it before first Resend call.

### R3 — Claims allowlist is dead code until draft exists
`config/claims.json` + `ClaimSchema` + tests: good. Zero runtime enforcement on generated copy. §8 drift failure mode is **open**.

### R4 — Dockerfile / compose vs monorepo
Even after fixing COPY list, Playwright + Chromium for enrich/jobboards live scrape will bloat/break slim image. Document fixture-only in container or use a separate worker image.

### R5 — n8n profile has no auth / webhook secret
`n8n` service exposes `:5678` with no documented basic-auth or webhook HMAC. Fine for local lab; dangerous if published.

### R6 — Dist-restore residue
Several `.ts` files still carry `//# sourceMappingURL=*.js.map` and formatting from JS dist. Not a security issue; signals fragile restore. Prefer clean sources.

### R7 — M1 acceptance “30 real companies” not verified here
Parsers + fixtures exist; live 30-company load was not re-run in this audit. Treat as **unproven**, not FAIL of code presence.

### R8 — Enrich marks ENRICHED even when LLM validation fails
On `LlmValidationError`, enrich still transitions to `ENRICHED` with `needs_manual: true` and zero facts. Score then runs; threshold may fail, but pipeline advances without facts. Spec wants “no high-enough fact → do not draft” — OK once M3 gates on facts, but enrichment success semantics are soft.

---

## Hunt results (explicit)

| Hunt target | Result |
|---|---|
| LinkedIn auto-send | **None found.** No Unipile/PhantomBuster/connect APIs. Channel enum includes `linkedin` for queue/draft intent only. |
| Sales Navigator scrape | **None found.** `salesnav-csv.ts` is CSV export ingest only — compliant with §1. |
| Secrets in code | **None found** in packages. `.env.example` has empty placeholders only. |
| Untyped LLM boundaries | Enrich: `complete()` → `unknown` → `ExtractedFactsSchema` + evidence URL allowlist + retries. **Acceptable for M2.** Draft package missing → N/A (blocker). |
| SQL injection | Queries use bound params. `countTable` interpolates **whitelist** table names only. |
| Suppression pre-send | Helper exists; **no caller on send path** (blocker). |
| Stubs | Empty `draft`/`approve` dirs; missing `send`/`followup`; stubbed SoT doc. |

---

## §1 hard constraints — compliance

| Constraint | Status |
|---|---|
| Email via Resend + CASL + unsub | **FAIL** — send package missing |
| LI/SN: no auto-send, no SN scrape; CSV + paste | **PASS** (by absence of forbidden code; paste queue CLI missing) |
| Upwork: draft auto / submit manual; RSS ingest | **PARTIAL** — RSS ingest exists; draft/queue missing |
| TS / pnpm / Node 22 / SQLite / Playwright / Zod / DeepSeek+Ollama | **PASS** for M0–M2 stack |
| No stubs / placeholders / mock outside tests | **FAIL** — empty draft/approve; stub SoT |
| Compose / Docker for Bazzite | **PARTIAL** — profile exists; Dockerfile incomplete |

---

## §8 failure modes — status

| Failure | Mitigation in code? | Test? |
|---|---|---|
| LLM invents credentials | claims.json only; **not enforced on drafts** | claims schema unit only — **FAIL** for draft path |
| Duplicate outreach | unique (contact_id, channel) + suppression table | partial — NULL-contact hole; no send-time check — **RISK** |
| Send to unsub/bounce | suppression table + `isEmailSuppressed` | lookup unit only; **no send integration** — **FAIL** |
| Scraper bans | rate limit, UA, robots, 3-page cap | scraper test **PASS** |
| Zod-invalid LLM output | 2 retries + manual flag | facts.test **PASS** |
| SN account risk | CSV-only architecture | code review **PASS** |
| Pipeline dies mid-run | events + per-lead transactions | no kill-9 test; race in transition — **RISK** |
| Generic spam | fact required + ban-list on draft | draft missing — **FAIL** |

---

## M0–M5 acceptance PASS / FAIL

| Milestone | Acceptance (abbrev) | Verdict | Notes |
|---|---|---|---|
| **M0** scaffold | `pnpm test` green; `status` empty pipeline; compose | **CONDITIONAL PASS** | core/cli/state/migrations/tests present. Compose outreach profile present. Dockerfile incomplete (B5). SoT stub (B1). Tests not re-executed in this pass — assume prior green for M0–M2 packages only. |
| **M1** ingest | 4 sources + add-company; fixture tests; 30 companies | **CONDITIONAL PASS** | All 4 sources + `add-company` + fixture tests exist. Live “30 companies” **not verified** this audit (R7). Contact re-ingest crash (B7). |
| **M2** enrich+score | Playwright + Zod retry + scorer; robots tests; 10 SCORED w/ ≥2 facts | **CONDITIONAL PASS** | Implementation + robots/Zod tests present. Live “10 SCORED ≥2 facts” **not verified** this audit. |
| **M3** draft+approve | SCORED → digest → approve → APPROVED | **FAIL** | Empty package dirs. |
| **M4** send+followup | Resend+CASL+suppress+unsub; LI/Upwork queues; clocked followups | **FAIL** | Packages missing. |
| **M5** ops | metrics; reply webhook; dry-run 10 staging | **FAIL** | Not present. pause/resume CLI exists early (good), insufficient for M5. |

---

## What is actually good

- State machine transitions match §2 shape; terminal states encoded.
- Enrich LLM path is Zod-strict with retry context and evidence URL pinning.
- Scraper respects robots + 3-page cap + 1 req/s (tested).
- Sales Nav path is CSV-only — correct architecture for §1.
- Deterministic scorer, no LLM.
- Kill switch + status CLI exist early.
- `config/claims.json` + `.env.example` outreach keys look honest (no secrets).
- Parameterized SQL throughout.

---

## Required next actions (ordered)

1. Restore full `OUTREACH_BUILD_SPEC.md` from transcript/backup.  
2. Delete or implement empty `draft`/`approve` dirs — empty dirs that look like packages are worse than missing.  
3. Land M3 for real (claims enforcement + ban-list + approve webhook).  
4. Land M4 send with **fail-closed** suppression + pause + CASL footer (not LLM).  
5. Fix `transitionLead` optimistic lock + ingest contact upsert before any parallel workers.  
6. Fix outreach Dockerfile to include all packages the CLI invokes (or shrink CLI surface in container).  
7. Re-run `pnpm test` and attach output before any GREEN claim.

---

*Blunt bottom line: the compliance hard parts of §1 that matter for account safety (no LI/SN automation) are currently OK because send automation doesn’t exist. The compliance hard parts for CASL/suppression/claims are not OK because the packages that must enforce them were never built — and the SoT file itself was gutted.*
