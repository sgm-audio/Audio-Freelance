# Repository Remediation & Verification Prompt Suite

These system prompts turn the findings in [`REPOSITORY_REVIEW.md`](../../REPOSITORY_REVIEW.md) into bounded implementation and verification assignments. They are designed for capable coding agents operating in the repository with GitHub access.

## Recommended order

| Order | Prompt | Purpose | Findings covered |
|---:|---|---|---|
| 1 | [`00-remediation-orchestrator.md`](00-remediation-orchestrator.md) | Coordinate all work, preserve evidence, and enforce gates | All findings |
| 2 | [`01-dependency-security.md`](01-dependency-security.md) | Resolve Python and npm advisories safely | Human-decision findings 1–3; critical alert aggregate |
| 3 | [`02-authentication-boundaries.md`](02-authentication-boundaries.md) | Decide and implement briefing/webhook protection | Human-decision findings 4–5 |
| 4 | [`03-supply-chain-and-deployment.md`](03-supply-chain-and-deployment.md) | Pin actions/images and verify containers | Human-decision finding 6; Docker gaps |
| 5 | [`04-test-coverage.md`](04-test-coverage.md) | Run every suite and add missing frontend/security coverage | Human-decision finding 7; verification gaps |
| 6 | [`05-release-and-repository-admin.md`](05-release-and-repository-admin.md) | Resolve versioning, alerts, PRs, branches, and metadata | Human-decision findings 8–9 |
| 7 | [`06-independent-final-verification.md`](06-independent-final-verification.md) | Adversarially verify the completed project | All findings and fixes |

Run prompts 2–6 on separate branches or sequentially with small commits. Run prompt 7 from a clean checkout after all accepted remediation changes are integrated.

## Shared rules

Every agent must:

1. Read `REPOSITORY_REVIEW.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `AGENTS.md`, relevant package docs, manifests, lockfiles, and workflows before changing files.
2. Treat the repository's code and executable behavior as authoritative when documentation conflicts.
3. Never expose, print, commit, or request credentials. Use placeholders and GitHub's existing secret interfaces.
4. Never rewrite Git history or delete remote branches without explicit maintainer approval.
5. Avoid major dependency upgrades, public API changes, authentication-policy changes, or architecture changes unless the assigned prompt explicitly requires a human decision first.
6. Reproduce a defect or advisory's applicability before changing code where feasible.
7. Add tests for behavior changes and run the narrow suite after each meaningful change.
8. Record commands, versions, outcomes, skipped checks, and environmental blockers exactly—never report an unrun check as passing.
9. Keep commits small and descriptive. Do not mix dependency, behavior, formatting, and documentation changes unnecessarily.
10. Update `REPOSITORY_REVIEW.md` or create a dated follow-up report with evidence and remaining risk.

## Definition of fully verified

The project is not “fully verified” until all applicable gates in `06-independent-final-verification.md` pass on supported environments. A network/tooling failure is **blocked**, not passed. Accepted risk must identify its owner, rationale, compensating control, and review date.
