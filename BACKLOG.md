# SGM Outreach backlog

M0–M5 package sources under `packages/{core,ingest,enrich,score,draft,approve,send,followup,ops,cli}`.

## Done

| Area | Status |
|---|---|
| M0 core (SQLite, state machine, claims schema) | Done |
| M1 ingest | Done |
| M2 enrich + score | Done |
| M0 CLI: status / pause / resume / ingest / enrich / score | Done |
| **M3 draft** (`packages/draft`, `sgm-outreach draft`) | Done — claims allowlist, banlist, DeepSeek/Ollama/fixtures |
| **M3 approve** (`packages/approve`, digest / webhook / approve\|reject\|edit) | Done |
| **M4 send** (`packages/send`, `sgm-outreach send`) | Done |
| **M4 LinkedIn / Upwork paste queues** (`sgm-outreach queue`) | Done — paste-only, no auto-send |
| **M4 follow-up cadence** (`packages/followup`, `sgm-outreach followup`) | Done — day-4/10/60 |
| **M5 metrics** (`sgm-outreach metrics`) | Done — `packages/ops` |
| **M5 webhooks** (reply → HUMAN, bounce → BOUNCED + suppression) | Done — `sgm-outreach webhook` |
| **M5 dry-run** (10 leads, staging mocks, suppression proof) | Done — `sgm-outreach dry-run` / `scripts/outreach-dry-run.mjs` |
| **OUTREACH_RUNBOOK.md** | Done |
| **OUTREACH_BUILD_SPEC.md** | Present (full SoT) |
| Config polish (`config/claims.json`, `.env.example` outreach keys) | Done |
| Python FastAPI + Next frontend (compose `backend`/`frontend`) | Done — separate product surface; not blocking outreach packages |

## Pending / in flight

| Area | Status |
|---|---|
| Approve webhook shared-secret auth | Open — required before non-loopback `approve serve` |
| Live Resend self-send + verified domain | Ops — needs `RESEND_API_KEY` |
| n8n → Telegram digest wiring | Ops — code pushes to `N8N_APPROVAL_WEBHOOK_URL` when set |
| Claims lint tighten + edit/followup re-validate | Risk follow-ups from OUTREACH_REVIEW |
| CI grep gate: no LI/SN automation | Nice-to-have §8 review automation |

## Operator entry

See [OUTREACH_RUNBOOK.md](./OUTREACH_RUNBOOK.md). Latest red-team: [OUTREACH_REVIEW.md](./OUTREACH_REVIEW.md).
