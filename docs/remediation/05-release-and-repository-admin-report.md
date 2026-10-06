# Release and repository administration report

Date: 2026-10-05
Prompt: `docs/prompts/05-release-and-repository-admin.md`
Status: version policy and safe PR hygiene implemented; administrator-only gates remain blocked; NO-GO

## Version inventory and policy

A full tag fetch corrected the earlier shallow-checkout observation. The repository has two matching tags and GitHub releases:

| Release | Commit | Release state |
|---|---|---|
| v0.1.1 | `48e647dc6ff93b1616e9403ec3a6fd4c468a7470` | Git tag and GitHub release; changelog section present |
| v0.1.2 | `e417c9aec31d0ec95036e6a5f2209195d43122c8` | Latest Git tag and GitHub release; changelog section present |

The maintainer-approved policy is **one public application version plus permanently private `0.0.0` outreach workspaces**. `VERSION` is the machine-readable source for the current public version, 0.1.2.

Aligned surfaces:

- Python project metadata;
- FastAPI/OpenAPI (read directly from `VERSION`);
- frontend package and package lock;
- desktop package and package lock;
- Tauri Cargo manifest/lock and Tauri configuration;
- default backend/frontend Compose image names;
- changelog release section.

All `@sgm-outreach/*` package manifests remain `private: true` at `0.0.0`.

`scripts/set_version.py` updates the explicit mapping. `scripts/check_version.py` verifies SemVer, every public mapping, both default image versions, a matching changelog section, and every private-workspace invariant. CI runs the check. README documents prereleases, annotated tags, deployment, and digest-based rollback without retagging failed releases.

## PR dispositions

Closed as demonstrably superseded by tested content in PR #70; no source branches were deleted:

| PR | Evidence in #70 |
|---|---|
| #69, #62 | Next.js 16.3.8 is newer than 16.3.6/16.3.3; frontend install/lint/build passed. |
| #68 | Approved OAuthlib 4.0.0 is in the regenerated audited uv lock. |
| #67 | urllib3 2.8.0 is in the regenerated frozen uv lock. |
| #63 | AnyIO 4.14.2 is in the regenerated frozen uv lock. |
| #66 | brace-expansion 5.0.12 is in the frontend lock; production npm audit is clean. |
| #61 | Next.js 16.3.8 and sharp 0.35.5 are newer than its proposed versions. |
| #60 | baseline-browser-mapping 2.11.27 is newer than 2.11.26. |

Remaining open PRs:

| PRs | Disposition |
|---|---|
| #54, #55, #56 | Patch/minor frontend proposals not contained in #70; remain `dependencies`, `in progress`. |
| #65 | Vitest 4 major explicitly deferred; `dependencies`, `javascript`, `research`; issue #72 owns the security decision. |
| #49–#53 | GitHub Action majors deferred; current actions are full-SHA pinned; proposals relabeled `research`. |
| #70 | Active remediation remains correctly labeled `in progress` until independent final verification. |

Factual comments were added to deferred/superseded PRs. Attempts to label issues #71–#74 were denied with HTTP 403, so their current empty label sets are an integration-permission limitation, not an intentional classification.

## Branch disposition

No branch was deleted. Every inspected non-Dependabot human branch has commits not reachable from the current `master`; title/age therefore cannot justify deletion:

- `assets/portfolio-collateral`
- `chore/outreach-claims-profile`
- `chore/track-startup-review-log`
- `cursor/setup-dev-environment-7d79`
- `feat/launcher-relaunch-shutdown`
- `feat/tauri-desktop-shell`
- `fix/dashboard-api-proxy`
- `fix/look-for-work-ux`
- `fix/run-py-ruff-lint`
- `fix/windows-dashboard-api-proxy`
- `n8n-refusal-protocol`

Proposed deletion list, requiring maintainer approval: only the remote Dependabot branches for closed PRs #60–#63 and #66–#69. Open-PR branches and all human branches must be retained. No history was rewritten.

## Repository metadata and settings

Verified:

- public repository with MIT license;
- accurate description and relevant topics (`ai-agents`, `audio-dsp`, `chromadb`, `fastapi`, `langgraph`, `lead-generation`, `nextjs`, `freelance`);
- default branch `master`;
- CODEOWNERS, bug/feature issue templates, SECURITY policy, Dependabot, and release notes present;
- no milestones;
- discussions enabled and wiki disabled;
- only the `copilot` deployment environment exists, with no protection rules;
- no real maintained homepage URL was identified, so none was invented.

Workflow files now declare least-privilege `contents: read` globally. The Docker job alone elevates `packages: write`. CD also declares only `contents: read`; the Fly credential remains a repository secret.

Administrator-only verification remains inaccessible with HTTP 403:

- branch-protection details and required checks;
- Actions/default workflow permissions and runner inventory;
- vulnerability-alert feature state and detailed Dependabot alerts;
- code-scanning and secret-scanning alerts;
- issue-label mutation for the newly created tracking issues.

A repository administrator should verify required reviews, stale-approval dismissal, force-push/deletion restrictions, required CI checks, a protected production environment, secret scope, Actions billing/quota, and all security alerts. Do not enable required checks until issue #73 proves that jobs actually obtain runners.

## Actions diagnosis

Run `37413734389` and its predecessor terminated within seconds. Runnable jobs have empty step arrays and no runner names. The integration cannot read Actions permissions, runner inventory, or billing settings. Issue #73 assigns repository administration to restore runner assignment and capture a rerun with actual checkout/test steps.

## Verification

Passed locally:

- `python scripts/set_version.py 0.1.2` (idempotence)
- `python scripts/check_version.py`
- Ruff and bytecode checks for release scripts and FastAPI version loading
- frontend `npm ci`, 4 unit tests, and production build at version 0.1.2
- desktop `npm ci` with zero npm findings
- YAML parsing and `git diff --check`

Blocked:

- Cargo regeneration/check of the desktop package version (Cargo unavailable); only the root package metadata entry changed, with no dependency or checksum edits.
- Real release/CD execution and protected-environment validation.
- Administrator/security settings listed above.

## Next release commands

From a clean, updated `master` checkout after all final gates pass:

```bash
python scripts/set_version.py 0.1.3
# Promote Unreleased to a dated [v0.1.3] changelog section.
python scripts/check_version.py
# Run the complete Python, frontend, outreach, Playwright, container, and Tauri matrix.
git tag -a v0.1.3 -m "Audio-Freelance v0.1.3"
git push origin v0.1.3
```

Create the GitHub release from the exact annotated tag and record deployed image digests. For rollback, restore the last verified Fly deployment/image digest and publish a new patch; never move an existing tag.

## Recommendation

**NO-GO.** Version drift and safely provable PR overlap are resolved, but PR #70 must remain in progress until real CI runners execute, administrator settings/security alerts are reviewed, desktop lock regeneration is verified by Cargo, and independent final verification passes.
