# SGM Outreach backlog

M0–M2 package sources restored under `packages/{core,ingest,enrich,score,cli}`.

## Done

| Area | Status |
|---|---|
| M0 core (SQLite, state machine, claims schema) | Done |
| M1 ingest | Done |
| M2 enrich + score | Done |
| M0 CLI: status / pause / resume / ingest / enrich / score | Done |
| **M4 send** (`packages/send`, `sgm-outreach send`) | Done (sibling) |
| **M5 metrics** (`sgm-outreach metrics`) | Done — `packages/ops` |
| **M5 webhooks** (reply → HUMAN, bounce → BOUNCED + suppression) | Done — `sgm-outreach webhook` |
| **M5 dry-run** (10 leads, staging mocks, suppression proof) | Done — `sgm-outreach dry-run` / `scripts/outreach-dry-run.mjs` |
| **OUTREACH_RUNBOOK.md** | Done |
| Config polish (`config/claims.json`, `.env.example` outreach keys) | Done |

## Pending / in flight

| Area | Status |
|---|---|
| M3 draft (`packages/draft`) | Empty scaffold — implement |
| M3 approve (`packages/approve`) | Empty scaffold — implement |
| M4 LinkedIn / Upwork paste queues | Not started / sibling |
| M4 follow-up cadence | Not started / sibling |
| Full SoT restore | `OUTREACH_BUILD_SPEC.md` is currently a stub — recover from backup if needed |

## Operator entry

See [OUTREACH_RUNBOOK.md](./OUTREACH_RUNBOOK.md).
