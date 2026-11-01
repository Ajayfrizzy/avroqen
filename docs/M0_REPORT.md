# M0 Foundation — implementation and review report

**Status:** foundation implemented and locally verified; review and hosted CI
remain pending. Do not claim final M0 acceptance or green GitHub Actions yet.
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

1. **Hosted CI pending:** the milestone's green-CI acceptance evidence remains
   outstanding until the review PR runs successfully. GitHub's branch protection
   endpoint returned `404 Branch not protected` for staging during review. Required
   checks are therefore not enforced by branch protection; no settings were changed.
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
   The workflow targets Ubuntu amd64; execution on that hosted platform is pending.

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
The prior test results above remain local evidence, not hosted-CI evidence.

M0 acceptance checklist: workspace, environment templates, containerized bootstrap,
pins/lockfiles and persistent instructions are implemented and locally verified;
CI is authored but must be observed green on GitHub. Branch protection and human
review remain unresolved. M0 is not declared complete by this report.
