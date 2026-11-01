# M1 — identity, organizations and agent access

**Status: incomplete; identity-policy approval pending.** This is a preparation
report, not evidence that wallet login, sessions, RBAC or agent management work.
**Branch:** `feat/m1-identity-access` (local only).
**Baseline:** `84ffd209d767660d0cae5c369aa2aa52a54148e8`.

## Repository preparation

Fetched origin, switched to staging and ran `git merge --ff-only origin/staging`:
already up to date. `git merge-base --is-ancestor` confirmed the exact requested
M0 merge is present. Created the dedicated M1 feature branch from that baseline.
Read AGENTS.md, HACKATHON.md, all seven skills and canonical product, architecture,
API, contract, attestation, threat, test, milestone and decision specifications.

## Implemented so far

- `db/migrations/001_identity.sql`: organizations, memberships, registered agents,
  authentication challenges/sessions, security audit records and request counters.
  Composite foreign keys bind organization records and challenge sessions to their
  account/network identities. Role/status enums and account constraints reject
  invalid stored records. One session per challenge is enforced by a unique key.
- `apps/api/src/db/migrate.ts`: transactional migrations, advisory serialization
  across runners, stored SHA-256 checksums and refusal of edited/unknown history.
- `scripts/migrate.ts` / `pnpm db:migrate`: explicit local migration entrypoint
  with sanitized errors. Application startup does not silently modify the schema.
- `tests/database/migrations.test.ts` / `pnpm test:identity-db`: real PostgreSQL
  tests in uniquely named temporary schemas, removed afterward. The normal
  application database schema was not migrated during these tests.
- CI includes the new database test after the existing PostgreSQL readiness check.
  No remote workflow has been run for M1; this branch remains local.
- `docs/M1_DESIGN.md` and proposed D012 record the identity alternatives, protocol
  boundaries and remaining tests without inventing an approved security policy.

## Actual verification evidence

Completed locally on November 1, 2026 with exit code 0:

| Check | Result |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` | Passed |
| `pnpm test:unit` | Existing M0 suite: 13 passed |
| `pnpm test:integration` | Existing M0 suite: 2 passed |
| `pnpm test:adversarial` | Existing M0 suite: 13 passed |
| `pnpm test:identity-db` | 4 passed against real PostgreSQL: migration idempotency/concurrent runners, invalid role/network/account constraints, session/challenge binding and concurrent duplicate rejection, migration checksum tampering |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | Next.js production build and TypeScript passed |
| `pnpm test:e2e` | Existing mobile foundation test: 1 passed |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passed |
| `cargo test --workspace --locked` | Existing scaffold test: 1 passed |
| `pnpm build:contract` / `pnpm test:wasm` | Existing Wasm build and boundary checks passed; simulated host, not chain settlement |
| `pnpm test:workflow` | Local workflow validation passed |
| `pnpm test:secrets` | Redacted Gitleaks scan: no leaks |
| `docker compose up --build -d --wait` | Web/API/database rebuild and health checks passed |
| `pnpm test:containers` / `pnpm test:database` / `pnpm test:smoke` | Non-root isolation, real PostgreSQL connectivity and existing M0 HTTP smoke passed |

Docker was initially stopped. Started Docker Desktop, then brought up the existing
local PostgreSQL service. No paid infrastructure or external database was used.
The migration tests do not verify NEAR signatures, authenticated nonce consumption,
session issuance, HTTP authorization or tenant isolation at API boundaries.

## Blocking decision and incomplete scope

Owner approval was requested for NEP-413 login using an active full-access Ed25519
key checked via finalized RPC on the server-selected network, with account, origin,
network and single-use challenge binding. This verifies wallet control for app
login only and never authorizes an onchain action. The alternative of accepting
restricted keys needs an explicit separate permission mapping; otherwise an agent
key could impersonate a wallet owner. No approval response has been received.

The user's delivery requirement explicitly calls for owner approval of unresolved
substantive wallet-signing/identity decisions. Dependent implementation is therefore
pending. There is no API login, secure session lifecycle, CSRF middleware, organization
RBAC endpoints, agent-management API, rate-limit enforcement or M1 UI yet. The schema
alone does not satisfy those requirements. Signature, replay/expiry/substitution,
nonce-consumption races, session/CSRF, cross-organization/role-escalation and agent
disabling acceptance cases are not implemented or claimed passed.

The wallet connector also needs compatibility verification. Official MyNearWallet
source contains a dapp-signing sunset guard; do not assume its current live signing
service is available or replace message signing with transactions/access-key creation.

## Next steps

Approve the proposed login policy (or specify a separately scoped restricted-key
policy), then implement and test the full wallet/session/organization/agent/UI scope.
Resolve connector support from current official wallet APIs. Complete all M1 cases,
rerun applicable checks, and replace this partial report with actual M1 evidence.
No scope reduction is approved or implied. Changes remain on the local feature
branch; no push, merge, deployment, credential exposure or financial transaction.
