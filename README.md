# Avroqen — foundation and identity

**Status:** Avroqen is the owner-confirmed product name. **Prior working name:** MandateFlow. **Prepared:** 2026-10-29. **Implementation:** M0 foundation implemented locally after the official start, 2026-11-01 00:00 UTC. Local and hosted CI checks pass; human review and required branch-check enforcement remain pending. See [the actual verification report](docs/M0_REPORT.md).

**Proposed product line (draft, not approved marketing copy):** Task-bound financial authority for autonomous agents.

## Purpose
Avroqen lets organizations delegate narrowly scoped transaction proposals to AI agents without granting the agents unrestricted control of funds. Owner-approved mandates, independently authenticated attestations, and an onchain vault constrain payment execution. The system assumes agent, API, provider, and verifier failures or compromise are possible and emphasizes exposure limits and recovery. It **does not** claim to be unhackable or independently audited.

## Run the local foundation

Prerequisites: Node **24.22.1**, pnpm **9.15.9**, Docker Engine with Compose v2+
(the verified local version is v5.3.1), and rustup. The Rust toolchain file pins
Rust **1.96.1**, Clippy, rustfmt and the Wasm target. First installs need network
access to public registries; no paid accounts, wallet keys or faucets are needed.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup:env
docker compose up --build -d --wait
pnpm test:smoke
```

Open **http://127.0.0.1:3000** to see the responsive foundation page and its
“Payments are not enabled” status. **http://127.0.0.1:3001/health** reports process
liveness; **/ready** checks actual PostgreSQL connectivity, not financial readiness.
The database binds to **127.0.0.1:55432**. These are development services only.
`pnpm setup:env` creates an ignored, mode-0600 `.env` with a random local database
password and never overwrites an existing file. It creates no blockchain identity
or signing credentials. Do not reuse this development database or its bootstrap
role for production; application roles and tenant authorization belong to M1.

For hot reload, stop the Compose application services and run their local versions:

```sh
docker compose stop web api
docker compose up -d --wait database
pnpm db:migrate
AUTH_ALLOW_INSECURE_LOCALHOST=true pnpm dev
```

Stop the local processes with Ctrl-C and use `docker compose down` to stop
containers. The database volume is retained; ordinary shutdown never deletes data.
Do not change the database password without updating the existing database role.

## Verify the foundation

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
pnpm test:contract
pnpm build:contract
pnpm test:wasm
pnpm test:workflow
pnpm test:secrets
```

The browser test starts its own production frontend; stop other processes on
port 3000 first. With Compose running, execute `pnpm test:database`,
`pnpm test:containers` and `pnpm test:smoke`. To verify an actual outage:

```sh
docker compose stop database
node scripts/check-outage.mjs
docker compose start database
docker compose up -d --wait
pnpm test:smoke
```

Expected: `/ready` returns 503 during the outage, `/health` remains 200, and
readiness returns after recovery. No transfer or retry is triggered.

The workspace contains Next.js web, Fastify API, shared Zod domain and agent
request schemas, disabled worker/verifier entrypoints and a Rust NEAR scaffold.
M1 adds wallet-message authentication and organization/agent record APIs; see
[the M1 report](docs/M1_REPORT.md) for local evidence and review blockers. The contract exposes a disabled-payment
view and SDK metadata; it has no custody, transfer, attestation or upgrade methods.
Worker indexing and verifier signing are not implemented. Database connectivity
and foundation checks are not evidence of S01–S20 financial safety or settlement.

GitHub Actions defines required `foundation` and `rust` jobs with pinned actions,
read-only repository permissions, frozen installs, secret scanning, browser tests,
container outage tests, Rust checks and Wasm interface inspection. Configure those
as required branch checks after review; no repository settings were changed.
See M0_REPORT.md and the review PR for hosted CI evidence. Staging branch protection
was absent at review; required checks still need configuring. No failures may be waived.

## Reading order
1. `docs/PRD.md` — user journeys, functional scope, acceptance criteria
2. `docs/THREAT_MODEL.md` — attacker model and mitigations
3. `docs/ARCHITECTURE.md` — boundaries and subsystems
4. `docs/CONTRACT_SPEC.md` — funds, permissions, transitions, accounting
5. `docs/ATTESTATION_PROTOCOL.md` — evidence, identities and trust
6. `docs/API_DATA_MODEL.md` — backend interface and records
7. `docs/TEST_PLAN.md` — adversarial acceptance gates
8. `docs/MILESTONES.md` — dependency-based implementation plan
9. `docs/DECISIONS.md` — decisions and open questions
10. `docs/OPERATIONS.md` — monitoring, incidents, deployment
11. `docs/HACKATHON_SUBMISSION.md` — official rules and human approval gates
12. `AGENTS.md`, `.agents/skills/*/SKILL.md` — persistent Codex operating rules

`HACKATHON.md` is an unchanged copy of the organizer-provided file. It is authoritative for submission details; check the **live** version before submitting.

## Non-negotiables
- No agent self-authorization, self-verification, policy mutation, or treasury full-access credential.
- Onchain enforcement of budgets/recipients/executions/revocations. Never trust a frontend or backend `approved` boolean.
- External evidence is not truth merely because it is signed. A verifier attests only to precisely defined claims.
- No misleading success states. Track submitted / pending / succeeded / failed / unknown separately.
- No automatic mainnet spending. No personal out-of-pocket costs; use sandbox/testnet and organizer-provided resources.
- No deploy, push, publish, spend, or submission without explicit owner approval.

## Official links
- https://nearhackathon.com/HACKATHON.md
- https://docs.near.org/protocol/accounts-contracts/access-keys
- https://docs.near.org/smart-contracts/anatomy/crosscontract
- https://docs.near.org/smart-contracts/testing/unit-test
- https://docs.near.org/smart-contracts/testing/integration-test


## M1 local identity workspace

Open **http://127.0.0.1:3000/workspace** after the Compose bootstrap. Compose runs
an explicit, checksummed migration service before starting the API. The migration
adds only application identity records; PostgreSQL is never a custody ledger.
Existing `.env` files remain untouched; for host development add the public
configuration values from `.env.example` or explicitly set
`AUTH_ALLOW_INSECURE_LOCALHOST=true`. Production authentication requires HTTPS.
`API_INTERNAL_URL` is server-only and read at Next build time; the Docker image
builds it as `http://api:3001`, local builds default to `http://127.0.0.1:3001`.

Enter your NEAR testnet account, connect via the wallet popup and review the exact
login message. This requests no transaction or new access key. Full-access
Ed25519 key control is checked at finalized RPC state. Login creates a 15-minute
application session. Create/select an organization, register an agent record, and
disable it. Owner/admin app roles manage records; members/viewers can read.
Registration grants no execution or treasury rights. Disabling a record is not an
onchain revocation. Logout invalidates the server session.

Run `pnpm test:identity-db` with local PostgreSQL for real API/signature/session/
tenant tests. `pnpm test:e2e` includes labeled API simulations for mobile/UI states;
it does not claim live wallet signatures. A manual wallet compatibility check and
hosted CI review remain required. No funds, faucets or paid infrastructure are
needed. No credentials or private keys should be pasted into the application.

## M2 typed mandate preparation

After signing in and selecting an organization, use **Create and review typed
mandates**, or open `/workspace/mandates`. An organization owner selects an active
agent, explicit intended vault and recipient, exact NEAR limits, UTC expiration,
execution cap and verifier policy. Save the immutable draft, review readable and
atomic terms, then sign an offchain consent message. Corrections require a new
mandate. Revocation requires another owner wallet message and affects app consent
only; no onchain mandate or payment is created. The vault identifier is unverified.

Run `pnpm test:identity-db` for real SQL/crypto consent tests and `pnpm test:e2e` for
browser fixtures. See docs/M2_REPORT.md for actual results and pending real-wallet
acceptance. M2 consent must never substitute for M3 wallet-signed onchain actions.


## M3 local contract verification

M3 replaces the disabled Rust scaffold with a native NEAR MandateVault. **No public
vault is deployed and the application still cannot fund or execute payments.**
M2 wallet messages remain offchain consent. See [M3 evidence](docs/M3_REPORT.md)
and [approved design](docs/M3_DESIGN.md). Earlier M0 scaffold descriptions above
are historical foundation context, not the current contract interface.

```sh
cargo build -p mandate-vault --target wasm32-unknown-unknown --release --locked
cargo test --workspace --locked -- --nocapture
pnpm test:wasm
```

Do this to see actual local sandbox recipient balance changes, failed transfers,
rollback and concurrent-spend rejection. Sandbox 2.14.0 downloads on first use;
Linux x86_64/aarch64 and Apple Silicon are supported by the pinned runner. Tests
create only temporary local identities with valueless balances. Public testnet
requires separate approval of the deployment/transaction plan; see the runbook.
