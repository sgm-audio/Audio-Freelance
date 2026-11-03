# UX & Product Roadmap — 6.4 → 8.0 → 9.0

Baseline: **6.4/10** ("credible beta") per the 2026-09-14 UX review held against
Indeed/LinkedIn. Scored dimensions: visual design 8, error/loading states 7,
keyboard UX 8.5, information architecture 6, list scalability 4, bulk ops 3,
feedback/undo 5, accessibility 5.

This document is the engineering plan. Each item has an acceptance criterion —
no item is "done" until its criterion passes and `make test` + `npx tsc
--noEmit` are green.

---

## Completed (2026-09-14)

| Item | What shipped |
|---|---|
| Leads-list text search | Client-side filter over title / company / raw_text, with match-count and clear |
| Sort control | Score (default) / Newest / Oldest; keyboard nav follows the sorted view |
| Undo toast | 5s undo window on status changes; single shared toast primitive on leads page |
| Modal focus trap + a11y | Quick Add is now `role="dialog" aria-modal`, ESC closes, Tab traps, autofocus on open |

## Phase 1 — List scalability (IA 6→8, scalability 4→8)

1. **Cursor pagination in the API.** `GET /api/v1/leads?cursor=&limit=100`.
   *Acceptance:* 5,000-lead dataset returns page-1 in <150 ms; no full-table
   scan (Chroma `offset` or id-cursor, whichever is cheaper — measure both).
2. **Server-side filter + sort parity.** Push `q`, `status`, `sort` into the
   API; client-side filtering becomes the cache for the loaded page only.
   *Acceptance:* filters survive a refresh via URL query params.
3. **Virtualize the list past page 1.** `@tanstack/react-virtual` (already
   sized rows) or windowed render. *Acceptance:* 5k leads scroll at 60 fps;
   j/k keyboard nav crosses virtual window boundaries without losing focus.

## Phase 2 — Bulk operations + shared feedback layer (bulk 3→8, undo 5→8)

4. **Selection model.** Row checkbox + header select-all + Shift+click range.
   Bulk bar floats on selection: status change, block company, export.
   *Acceptance:* 100 leads → CONTACTED in ≤3 clicks; one toast, one undo for
   the whole batch (`POST /leads/bulk-status` returns applied ids; undo issues
   one reverse call).
5. **Extract the toast system.** Move the leads-page toast into
   `components/ui/alert.tsx` (shadcn already vendored): `role="status"` /
   `role="alert"` by severity, `aria-live="polite"`, action slot for Undo,
   stack position bottom-right. Adopt on every page (preferences, setup,
   outreach console, import). *Acceptance:* zero per-page message state left;
   every mutating action produces exactly one toast.
6. **Optimistic UI with reconciliation.** Status changes render instantly,
   roll back on failure (toast explains). *Acceptance:* simulated 500 →
   visible revert + error toast, no stale state.

## Phase 3 — Accessibility hard gate (a11y 5→8)

7. **Axe sweep.** Add `@axe-core/playwright` to the existing E2E suite; run on
   every route. *Acceptance:* zero serious/critical violations in CI.
8. **Remaining dialogs.** Lead detail sheet (Sheet primitive already has
   focus mgmt — verify against APCA contrast), any new modals follow the
   Quick Add pattern (role, aria-modal, ESC, trap, autofocus).
9. **Non-color semantics.** Verdict dots get `aria-label="HOT"` etc.; never
   encode verdict by color alone. Document the keyboard map in a `?` overlay.
   *Acceptance:* every workflow completable keyboard-only, verified in a
   Playwright keyboard-run test.

## Phase 4 — Verification & release hygiene

10. **E2E coverage for this session's features:** search filter, sort order,
    undo toast, modal trap — one Playwright file each. *Acceptance:* runs in
    `build-frontend` CI job.
11. **Frontend lint gate.** `eslint-plugin-jsx-a11y` in the Next lint config,
    CI fails on new violations.

**8/10 definition:** all four phases complete; re-score the rubric and land
the table in this file.

---

# The 9/10 Release — From "lead tool" to Freelance Acquisition OS

Scope expansion voted for: **breadth of lead sources, depth of pipeline,
operational autonomy.** The audio-DSP wedge stays (that's the SEO wedge and
the scoring ground truth), but nothing in the architecture assumes audio.

## Lane A — Source breadth (the reason users switch)

- **A1. Feed ingestion engine**: RSS/Atom poller (We Work Remotely, RemoteOK,
  Hacker News "Who is hiring", niche Discourse boards) run as the existing 6th
  tier. *Constraint:* respect robots.txt + per-board ToS; LinkedIn stays
  paste-only per `docs/outreach/OUTREACH_BUILD_SPEC.md` §1 (this is law).
- **A2. ATS autodiscovery**: given `company.com`, probe greenhouse/lever/ashby
  slugs and subdomains; store in `companies.yaml` automatically after a
  human confirm step.
- **A3. Email ingest**: forwarded job emails → parse → lead. Lowest-friction
  acquisition channel there is. Start with a mailbox input on `/leads/import`
  (paste raw email), Gmail API only if volume justifies it.
- **A4. Industry packs**: profile + scoring + signal vocab as swappable YAML
  packs (audio-dsp, embedded, firmware, game-dev). The marketplace artifact
  that makes people star the repo.

## Lane B — Operational autonomy

- **B1. Saved searches as scheduled probes**: store query + filter; run on
  interval; diff against last run; notify only on *new* hits (Telegram/n8n
  already wired — add web-push).
- **B2. Daily digest email** ("3 HOT, here's why") using the existing
  `templates/briefing.html` + Resend.
- **B3. Follow-up intelligence**: unanswered outreach surfaces at day 4/10
  with a suggested next touch; reply detection via the existing webhook.

## Lane C — CRM depth

- **C1. Lead timeline**: status history, notes, message log per lead.
  ChromaDB is the wrong store for this — add SQLite (packages/core already
  ships the pattern) and treat Chroma as the semantic index only.
- **C2. Rate intelligence**: benchmark table auto-rebuilt from postings;
  "this offer is 20th percentile" badges in the UI.
- **C3. Win/loss loop**: marking WON/LOST captures WHY (tags); scoring
  weights retrain monthly from that data. Ship a ModelCard documenting the
  scorer (this is what makes scoring trustworthy at scale).

## Lane D — Platform hardening

- **D1. Multi-user/RBAC** (roadmap Phase 5): real auth (not API-key),
  Postgres for accounts, tenant-isolated stores. Only after a second human
  actually wants to use this — don't build it hoping.
- **D2. Desktop finish**: the half-landed Tauri app on this branch —
  complete or delete; a dead branch is worse than none.
- **D3. Release engineering**: release-please (conventional commits →
  CHANGELOG), SBOM (cyclonedx) in CI, pinned GitHub Actions SHAs, Dependabot
  coverage for packages/ workspace (frontend only today).

## Sequencing

```
Week 1-2:  Phase 1 (list scale) + Phase 2 (bulk/toast)
Week 2-3:  Phase 3-4 (a11y + E2E)  → tag v0.2.0, "8/10" milestone
Week 4-6:  A1 + A3 (feed + email ingest) — highest source ROI
Week 7-8:  B1 + B2 (alerts, digest)
Week 9-10: C1 lead timeline (SQLite)
Week 11+:  C3 feedback loop, A4 industry packs, D2 desktop decision
```

## Success metrics (the 9/10 bar)

- A first-time user goes install → first HOT lead in <15 minutes.
- Zero un-logged pipeline failures (all `except` sites emit telemetry).
- Every UI mutation is reversible or confirm-gated.
- CI is the source of truth: tests, types, a11y, build, all green on every PR.
- Docs site intact: README quickstart works on a clean machine, no tribal
  knowledge required.
