# Supply-chain and deployment verification report

Date: 2026-10-05
Prompt: `docs/prompts/03-supply-chain-and-deployment.md`
Status: source hardening complete; runtime/container verification blocked; NO-GO

## Changes

### GitHub Actions

Every third-party action is pinned to the full commit currently resolved by its reviewed major release ref:

| Action | Release | Commit |
|---|---:|---|
| actions/checkout | v4 | `11d5960a326750d5838078e36cf38b85af677262` |
| astral-sh/setup-uv | v7 | `37802adc94f370d6bfd71619e3f0bf239e1f3b78` |
| actions/setup-node | v6 | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| docker/setup-buildx-action | v3 | `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f` |
| docker/login-action | v3 | `c94ce9fb468520275223c153574b00df6fe4bcc9` |
| docker/metadata-action | v5 | `c299e40c65443455700f0fdfc63efafe5b349051` |
| docker/build-push-action | v6 | `10e90e3645eae34f1e60eeb005ba3a3d33f178e8` |
| superfly/flyctl-actions/setup-flyctl | v1 | `ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1` |

The commits were resolved directly with `git ls-remote` against each upstream repository. Human-readable release comments remain beside each SHA, and Dependabot's GitHub Actions ecosystem remains enabled.

CI now accepts `v*` tag pushes, making its existing Docker tag condition reachable. CD still owns the Fly backend deployment. A future release gate should make CD depend on successful CI rather than allowing independent tag workflows to race.

### Build contexts and images

- Added root and frontend `.dockerignore` files excluding Git metadata, environment files, keys/certificates, local databases, caches, dependency directories, test output, and build artifacts.
- Pinned the copied uv tool image to uv 0.12.23 and manifest digest `sha256:61d393e44e249f2e4b526b6c7ddcecce245946826e608e11c93ad4f5bba55b21`.
- Replaced all `latest` Compose references with readable versions or versioned local image names. Production operators can set `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `OLLAMA_IMAGE`, and `N8N_IMAGE` to tested digest-pinned references.
- Added Dependabot Docker update entries for the root, frontend, and outreach CLI Dockerfiles.
- The outreach Dockerfile now installs from `pnpm-lock.yaml` with `--frozen-lockfile`, builds the complete workspace needed by CLI imports, and runs as the non-root `node` user.
- The frontend runtime now copies artifacts with `node:node` ownership and runs as non-root `node`.
- The backend already runs as non-root `appuser` and binds `0.0.0.0:8080`.

Base images (`python:3.12-slim`, `node:22-alpine`, and `node:22-bookworm-slim`) and optional service images have readable version tags but are not yet digest-pinned. Registry authentication/TLS is inaccessible from this runner, and Docker is absent, so selecting untested digests would violate the remediation rules. This remains an explicit release blocker.

### Networking and deployment semantics

- Ollama and n8n host ports now bind only to `127.0.0.1`; backend and frontend remain deliberately published on 8080 and 3000.
- Frontend browser navigation no longer targets `127.0.0.1:8080`. `/briefing` is same-origin in the browser and is proxied server-side to the Compose-internal `API_HOST`.
- The production Compose override sets `ENVIRONMENT=production`, activating the fail-closed API-key policy and disabling reseeding.
- Fly also sets `ENVIRONMENT=production`. README now states that Fly deploys the FastAPI backend only and that the Next.js frontend needs a separate target. `API_KEY` is documented as required for production.

## Static deployment matrix

| Component | User | Entrypoint | Internal port/health | Persistence/exposure |
|---|---|---|---|---|
| Backend | `appuser` | `uv run python main.py` | 8080; `/api/v1/health` | `lead_data` at `/app/leads/data`; host 8080 intentionally published |
| Frontend | `node` | `node server.js` | 3000; production override checks `/` | Stateless; host 3000 intentionally published |
| Outreach CLI | `node` | CLI `status` | none | `outreach_data` at `/data`; no host port |
| Ollama (`full`) | upstream image default | upstream | 11434 | Loopback-only host publication; persistent model volume |
| n8n (`outreach`) | upstream image default | upstream | 5678 | Loopback-only operator UI; persistent n8n volume |
| Fly | `appuser` backend image | backend | internal 8080 | Backend only; no frontend deployment |

This matrix is source inspection, not runtime evidence.

## Verification evidence

Passed:

- YAML parsing for Dependabot, both workflows, and both Compose files.
- No workflow retains a branch/major-tag action reference.
- No checked-in Dockerfile or Compose service retains a `latest` tag.
- Frontend lint and production build pass after the proxy change.
- Frozen pnpm install and all outreach TypeScript builds pass after Dockerfile/workspace changes.
- `git diff --check`.

Blocked:

- `docker compose config` for base/production/profile combinations: Docker/Compose is unavailable.
- BuildKit clean builds, startup/restart/persistence checks, image size/package/user inspection, and runtime health checks: Docker is unavailable.
- Trivy/Grype scans: scanners and built images are unavailable.
- Immutable digest resolution and validation for Python, Node, Ollama, n8n, and application images: registry TLS/auth transport is unavailable.
- Tauri `cargo check --locked`, tests, and platform build: Cargo and a supported desktop build host are unavailable.
- Actions permissions, runner inventory, and billing/quota APIs: the GitHub integration returns HTTP 403.
- Workflow execution: run `37413734389` ended before runner assignment with empty step arrays and no runner names.

The GitHub Actions infrastructure blocker is assigned to a repository administrator in issue #73. It requires a real rerun with recorded steps; source edits must not mask it.

## Rollback

- Action pins can be rolled back by reverting the workflow commit; do not return to mutable refs.
- Container behavior can be rolled back by reverting Dockerfile/Compose changes, but retain `.dockerignore` credential exclusions.
- The frontend proxy change is isolated to `frontend/next.config.ts` and the sidebar href.

## Recommendation

**NO-GO.** Static hardening and local non-container builds pass, but the prompt's required Compose profiles, images, vulnerability scans, digest pins, Tauri build, and actual Actions jobs have not been verified. Complete those checks on a Docker/Rust-capable host with registry access after issue #73 is resolved.
