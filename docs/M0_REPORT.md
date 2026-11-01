# M0 Foundation — implementation and review report

**Status:** foundation implemented and verified locally and on GitHub Actions.
Human review and enforced required branch checks remain outstanding; this report
does not declare final M0 acceptance.
**Date:** November 1, 2026 (Africa/Lagos).
**Branch:** `feat/m0-foundation-implementation`, based on synchronized staging
`10a5a1c20f96f965a96b3724709b04307fdf5b59`.

The start gate was verified at **2026-11-01 02:14:02 UTC** before generating
implementation. AGENTS.md, organizer HACKATHON.md, bootstrap/milestone documents,
PRD, architecture, contract, attestation, threat model, test plan, supporting
specifications and all seven persistent skills were reviewed. Their financial
requirements remain in force. The owner has now authorized committing and pushing
the feature branch and opening a PR against staging. No merge, external deployment,
financial transaction or paid service is authorized or performed.

## Implemented components

| Component | Actual implementation |
| --- | --- |
| Monorepo | pnpm workspace, exact package/toolchain pins, pnpm/Cargo lockfiles, strict TypeScript, Biome, root check scripts |
| Frontend | Next.js App Router/React, responsive foundation page, explicit disabled-payment status, no fabricated balances or receipts |
| Backend | Fastify with bounded request body/timeout, process liveness, real PostgreSQL readiness, generic error responses, graceful shutdown |
| Shared domain | Zod configuration validation and canonical decimal atomic units bounded to u128; no floating-point token conversion |
| Agent package | Strict propose/query request schemas only; privileged and extra fields rejected; no executor, keys or network tools |
| Worker/verifier | Separate workspace entrypoints explicitly reporting disabled capability; no indexing, evidence approval or signing implementation |
| Database/dev containers | Digest-pinned PostgreSQL, Node images, persistent local volume, loopback ports, health checks, non-root web/API, dropped app capabilities |
| Configuration | Placeholder-only template; exclusive mode-0600 local database environment generator; existing config preserved; no blockchain credential generation |
| Rust NEAR workspace | Pinned Rust and near-sdk, release overflow checks, Wasm artifact, disabled-payment view and SDK metadata only |
| Tests | Vitest unit/integration/adversarial tests, Playwright mobile smoke, real database/container/outage scripts, Rust test harness, compiled Wasm ABI checks |
| CI | Pinned checkout/pnpm/Node actions, least-privilege permissions, frozen installs, secret scan, workflow lint, JS/browser/container and Rust/Wasm jobs |
| Documentation | README bootstrap/check instructions, D011 tooling/boundary decision, historical plan linked to this report |

## Verification evidence

All commands below completed locally with exit code **0** after fixes unless
explicitly marked unrun. Versions and dependencies were checked against official
package metadata/docs before pinning; see D011 in DECISIONS.md.

| Command/check | Actual result |
| --- | --- |
| `git fetch origin --prune` | Staging unchanged at `10a5a1c`; tracked branch baselines synchronized |
| `CI=true pnpm install --frozen-lockfile --ignore-scripts` | Lockfile up to date; frozen install succeeds |
| `pnpm lint` | Biome passes; canonical Markdown and persistent skills excluded from automatic formatting |
| `pnpm typecheck` | Root strict TypeScript and Next.js route/type generation pass |
| `pnpm test:unit` | **13 passed**: u128 bounds/precision, malformed representations, configuration selection, redacted failures, placeholder refusal |
| `pnpm test:integration` | **2 passed**: liveness/readiness separation and recovery, absent financial endpoints; database dependency is injected here |
| `pnpm test:adversarial` | **13 passed**: privileged/injected tool requests, extra authority fields, invalid ports |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | Production Next.js build and TypeScript check succeed; static `/` and not-found pages generated |
| `pnpm test:e2e` | **1 passed** in Chromium: foundation notice visible and no horizontal overflow at 390×844; mobile screenshot also visually inspected |
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Pass, no warnings |
| `cargo test --workspace --locked` | **1 foundation capability test passed**, 0 doc tests; no financial contract tests exist yet |
| `cargo build -p mandate-vault --target wasm32-unknown-unknown --release --locked` | Wasm built successfully |
| `pnpm test:wasm` | Compiled export allowlist passes, no transfer/upgrade host imports; generated view returns JSON `false` against explicitly simulated empty storage |
| `docker compose config --quiet` | Compose configuration valid without printing secrets |
| `docker compose up --build -d --wait` | Fresh image installs/builds succeed; web, API and PostgreSQL all healthy |
| `pnpm test:database` | Real local PostgreSQL `SELECT 1` succeeds |
| `pnpm test:smoke` | Real HTTP frontend, liveness and database readiness pass |
| `docker compose stop database` + `node scripts/check-outage.mjs` | Real outage returns 503 readiness and 200 liveness, without raw database errors |
| `docker compose start database` + `docker compose up -d --wait` + `pnpm test:smoke` | Recovery succeeds without application restart or transaction retry |
| `pnpm test:containers` | Web/API run non-root; `/app/.env` and `/app/.git` absent from images |
| `pnpm test:workflow` | Pinned actionlint validates GitHub Actions workflow |
| `pnpm test:secrets` | Pinned Gitleaks scan of tracked/untracked reviewable source: no leaks; output redacted; ignored local config excluded |
| Canonical-file diff | AGENTS.md, HACKATHON.md, all seven skills, CONTRACT_SPEC, THREAT_MODEL and ATTESTATION_PROTOCOL unchanged |

Local Wasm SHA-256:
`790b9fcf6b5642996d6dd9fc8878b500286ab3aaa364989a19705a389a068c41`.
This is a build artifact reference, **not** a deployment or transaction reference.
The Wasm host simulation is **not** a NEAR sandbox or proof of settlement.

## Failures encountered and resolved

- Initial Docker build failed with EACCES because `/app` was root-owned. The
  build now changes directory ownership before switching to the `node` user;
  fresh install, build and health checks passed with non-root runtime intact.
- The first formatter invocation attempted to format existing Markdown and could
  not write protected skill files. Incidental specification formatting was restored
  from the clean baseline. Formatter scope now excludes Markdown/skills/Git, and
  final checks pass. Organizer HACKATHON.md remains byte-for-byte unchanged.
- A sandboxed pnpm reinstall prompted about a different dependency store and did
  not establish verification. The explicit noninteractive frozen install using
  the original store subsequently completed successfully.

## Security scope and remaining blockers

1. **Required-check enforcement and human review pending:** both hosted CI jobs
   passed for the implementation commit (evidence below). GitHub's branch protection
   endpoint returned `404 Branch not protected` for staging; effective branch rules
   and repository rulesets were both empty. Required checks are not enforced.
   No settings were changed; the PR remains draft and unmerged.
2. **No custody implementation:** M1–M9 are not complete. S01–S20 financial tests,
   NEAR Workspaces sandbox settlement, testnet receipts and independent review
   remain mandatory at their milestones. This scaffold must not receive funds.
3. **No authority changes:** no owner/verifier signing, policy authorizations,
   admin withdrawals, upgrades, alternate payment adapter, onchain transfer,
   async accounting or retry path was introduced. Future implementations must
   enforce every CONTRACT_SPEC invariant; foundation tests do not prove them.
4. **Development configuration only:** local PostgreSQL uses its bootstrap role;
   production roles, tenant isolation, authentication and migrations are not
   implemented. The backend database is never a custody ledger. Owner/verifier
   credentials are not present, and web containers receive no database environment.
5. **Open security decisions remain open:** O02–O07 are not silently resolved.
   Any material authority/identity/ownership decision requires human review and ADR.
6. **Platform coverage:** local tests ran on macOS ARM64 and Linux ARM64 containers.
   Both GitHub Actions jobs also passed on Ubuntu 24.04 amd64.

## Next steps

Review the feature PR and D011, inspect both GitHub Actions jobs without bypasses,
and configure required `foundation` and `rust` checks before merging. The owner
has authorized the feature-branch push and PR, but not merge or deployment.
Proceed to M1 identity/authentication after M0 review; retain the full financial
scope and threat gates for M2–M8. No deadline-based scope reduction was made.

## Pre-commit review

Reviewed all tracked modifications and untracked implementation files against the
M0 milestone and canonical specifications. The changes add foundation services
only: there are no custody keys, financial endpoints, transfer adapters, fabricated
receipts, or new owner/verifier authority. Core specifications, organizer rules and
all seven persistent skills remain unchanged.

Packaging fixes from review: ignore generated `next-env.d.ts`, and exclude nested
environment/credential files and local cloud/agent configuration from Docker build
contexts. Lockfiles are intentional reproducibility inputs; `node_modules`,
`.next`, Rust `target`, browser results, Wasm binaries and `.env` are not committed.
The table above records local evidence; hosted-CI evidence is recorded separately below.

M0 acceptance checklist: workspace, environment templates, containerized bootstrap,
pins/lockfiles and persistent instructions are implemented and locally verified;
both CI jobs passed on GitHub. Branch protection and human review remain unresolved.
M0 is not declared complete by this report.

## GitHub review and CI evidence

- Review PR: https://github.com/Ajayfrizzy/avroqen/pull/4 (draft, targets staging).
- Implementation commit: `59642c89796ccbf9b75c10f4c986325289b02029`.
- Completed workflow: https://github.com/Ajayfrizzy/avroqen/actions/runs/41265593148.
- `foundation`: **success**, completed 2026-11-01 02:34:25 UTC. Frozen installation,
  workflow lint, secret scan, JS checks/build, Chromium, fresh Compose bootstrap,
  isolation, real database connectivity, smoke and outage/recovery all passed.
- `rust`: **success**, completed 2026-11-01 02:35:06 UTC. Format, Clippy, tests,
  locked Wasm build and compiled interface/JSON boundary checks all passed.
- Non-failing annotation: the pinned v4 actions declare Node 20 and GitHub runs
  them under Node 24 due to deprecation. This is not a failed or waived check;
  updating action major versions is a maintenance follow-up.
- This evidence records the implementation revision. A subsequent documentation-only
  commit records these results; verify its latest checks on the PR before merging.
- Repository remains private. No merge, deployment, financial transaction or
  branch-protection change was performed.

## Changed files

The reviewed change set contains 53 files (including intentional lockfiles):

```text
.dockerignore
.env.example
.github/workflows/ci.yml
.gitignore
.node-version
.npmrc
Cargo.lock
Cargo.toml
Dockerfile
README.md
apps/api/package.json
apps/api/src/app.ts
apps/api/src/index.ts
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/app/styles.css
apps/web/next.config.ts
apps/web/package.json
apps/web/tsconfig.json
apps/worker/package.json
apps/worker/src/index.ts
biome.json
compose.yaml
contracts/mandate-vault/Cargo.toml
contracts/mandate-vault/src/lib.rs
docs/DECISIONS.md
docs/M0_FOUNDATION.md
docs/M0_REPORT.md
package.json
packages/agent/package.json
packages/agent/src/index.ts
packages/domain/package.json
packages/domain/src/index.ts
playwright.config.ts
pnpm-lock.yaml
pnpm-workspace.yaml
rust-toolchain.toml
scripts/check-containers.mjs
scripts/check-database.ts
scripts/check-outage.mjs
scripts/check-wasm.mjs
scripts/check-workflow.mjs
scripts/scan-secrets.mjs
scripts/setup-env.mjs
scripts/smoke.mjs
services/verifier/package.json
services/verifier/src/index.ts
tests/adversarial/boundaries.test.ts
tests/e2e/foundation.spec.ts
tests/integration/api.test.ts
tests/unit/domain.test.ts
tsconfig.json
vitest.config.ts
```
