# M0 foundation preparation

Status: planning only, prepared October 31, 2026. M0 is not implemented or complete.
Implementation may begin November 1, 2026 at 00:00 UTC (01:00 Africa/Lagos),
as required by AGENTS.md, CODEX_BOOTSTRAP.md and MILESTONES.md.

## Baseline and scope

Feature branch: `feat/m0-foundation`, based on `origin/staging` at `1599cce`.
Read all canonical specifications, remaining docs, organizer HACKATHON.md,
and all seven project skills. Existing repository contains planning documents
and skills; it has no application, package manifests, container setup or CI.

M0 will supply the documented monorepo layout, environment templates,
containerized local development, exact dependency/toolchain pins and lockfiles,
bootstrap instructions, and required CI checks. Keep AGENTS.md and the seven
skills in place. M1–M9 functionality remains required by its milestones.

## Tests and threat cases before implementation

| Gate | Positive evidence | Negative/adversarial evidence |
| --- | --- | --- |
| Reproducible bootstrap | Clean checkout installs with frozen JS and locked Rust dependencies; documented builds succeed | Lockfile drift and unsupported toolchain fail clearly |
| Configuration | Valid local configuration boots; readiness checks actual dependencies | Missing/malformed required configuration fails closed; no secret values in diagnostics |
| Credential isolation | Service-specific environment allowlists; placeholder-only examples | Owner/verifier signing credentials never reach agent, backend or browser bundles |
| Containers | Local web/API/Postgres start and health checks pass | Database outage makes readiness fail without claiming settlement; no publicly bound database by default |
| CI integrity | Lint, typecheck, unit, integration, adversarial and contract checks report actual results | A failing required check fails CI; no continue-on-error or success placeholders; untrusted PR jobs receive no signing secrets |
| Supply chain | Verified exact versions, committed lockfiles, pinned actions and images | Dependency drift and committed credential fixtures are detected without printing secret values |

Define tests before the relevant code. Compile and test only the foundation
that exists. Never call an empty Rust scaffold proof of custody correctness,
or a fixture proof of settlement. Record absent financial suites as unimplemented;
S01–S20 remain mandatory for the financial milestones and release.

## Implementation sequence after the start

1. Recheck the start gate and staging changes. Verify supported Node/pnpm,
   Rust/NEAR SDK/Workspaces, Next.js, Fastify, Zod, PostgreSQL and CI action
   versions against official documentation. Record exact choices and sources.
   Installed versions below are observations, not approved dependency pins.
2. Establish pnpm workspace and Cargo workspace using the bootstrap layout:
   `apps/{web,api,worker}`, `packages/{domain,agent}`,
   `contracts/mandate-vault`, `services/verifier`, `tests/e2e`.
   Define root check scripts, strict TypeScript settings, format/lint rules,
   Rust toolchain and build target, lockfiles, and meaningful foundation tests.
3. Add placeholder-only environment templates, ignored local configuration,
   service-specific configuration boundaries and local Docker Compose.
   Do not mount wallet directories, signing keys or the Docker socket into
   application services. Do not make paid API calls or require hosted resources.
4. Add minimal executable foundation services and honest health/readiness
   behavior. Do not add payment methods, custody authority, attestation approval,
   wallet signing, or fake financial success to satisfy smoke tests.
5. Add CI with least-privilege permissions, immutable action pins, reproducible
   install/build/test jobs, and secret scanning. Document required branch checks;
   verify their actual repository settings rather than assume protection exists.
6. Run a fresh-checkout bootstrap, local container smoke and failure tests,
   all applicable checks, and remote CI. Record commands, exit codes and limitations.
   Rewrite the draft PR around the actual implementation before requesting review.
   Never merge, deploy, fund accounts or submit the hackathon application here.

## Proposed command interface

These commands are the intended interface to implement after the start;
they are **not executable project instructions today**:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:adversarial
pnpm build
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
pnpm test:contract
docker compose config --quiet
docker compose up --build -d --wait
pnpm test:smoke
docker compose down
```

Contract integration must execute actual NEAR sandbox tests when present;
it must not substitute an echo command or mocked successful transaction.
Never use a destructive volume-removal command in the ordinary shutdown path.

## Security invariants and decisions

M0 grants no financial authority. Preserve all ten AGENTS.md constraints and
all eight CONTRACT_SPEC accounting invariants. The agent only proposes/queries;
the database and API cannot authorize custody changes; verifier evidence must
be independent and exactly bound; token units use checked integers; reservations
precede transfers; private callbacks finalize outcomes; unknown obligations stay
quarantined; owner withdrawals exclude reservations; no master withdrawal,
unilateral upgrade, wildcard transfer, or uncontrolled retry is introduced.

Open decisions O02–O07 remain open. Foundation work must not silently choose
verifier policy, upgrade governance, canonical proposal authority, paid inference,
new assets or deployment infrastructure. Any conflict concerning money, identity
or ownership requires an owner decision and ADR before affected implementation.

## Verification performed and blockers

Read-only toolchain probes succeeded:

| Command | Observed output |
| --- | --- |
| `node --version` | `v24.22.1` |
| `pnpm --version` | `9.15.9` |
| `cargo --version` | `cargo 1.96.1 (356927216 2026-06-26)` |
| `rustc --version` | `rustc 1.96.1 (31fca3adb 2026-06-26)` |
| `docker compose version` | `Docker Compose version v5.3.1` |
| `gh --version` | `gh version 2.103.3 (2026-10-26)` |

`git fetch origin` succeeded; the feature branch starts at latest staging
as fetched for this preparation. Working tree was clean before this document.

Blocking: the client date is October 31, before the explicit implementation gate.
No dependency compatibility, Docker daemon operation, sandbox availability,
reproducible bootstrap, lint, typecheck, unit, integration, adversarial, contract,
or CI success has been established. There are no transaction references or
deployed artifacts. Do not mark M0 complete until implementation and green CI
provide the completion evidence required by MILESTONES.md.
