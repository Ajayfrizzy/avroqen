# Architecture decision log

## M0 preparation — October 31, 2026

Foundation implementation remains blocked until November 1 at 00:00 UTC by
AGENTS.md and CODEX_BOOTSTRAP.md. The preparation plan and verification status
are recorded in [M0_FOUNDATION.md](M0_FOUNDATION.md). This entry changes no
financial authority, resolves no open security decision, and does not establish
M0 completion or passing CI.

## Settled design choices
- **D001:** Avroqen is the owner-confirmed product name, replacing the previous working label MandateFlow. Retain technical history; owner reports having verified name availability, but no legal trademark opinion is claimed.
- **D002:** Contract-controlled custody in `MandateVault` with owner-approved allocation and withdrawal; account-held funds outside vault remain untouched.
- **D003:** Agent is an untrusted proposer; no owner/verifier full-access keys in AI runtime.
- **D004:** Scope of spending set in typed immutable mandate, enforced onchain. Material terms require new owner authorization.
- **D005:** Independent MAP-1 attestation from owner-designated NEAR account; agent-created evidence is not sufficient.
- **D006:** Atomic reservation before async transfer; safe callback; no blind retries on unknown outcomes.
- **D007:** Native NEAR initial custody/transfer; NEP-141 and Intents are later adapters only if independently validated.
- **D008:** No unilateral platform-admin withdrawal/upgrades; stop-only guardian scope; owner recovery.
- **D009:** Security uses assume-breach mindset; no claims of invulnerability or audited status.
- **D010:** Zero-out-of-pocket engineering requirement; sandbox/testnet or granted credits only.

## Open decisions requiring explicit owner/technical approval
- **O01:** Final tagline and any formal trademark/legal review remain separate from the owner-confirmed Avroqen name.
- **O02:** Whether mandatory third-party claims require 1 verifier, quorum, or per-mandate owner co-approval; proposal: configurable policy, default owner co-approval for hard-to-verify outcomes.
- **O03:** FT token support and exact token contracts; requires asset-specific audit.
- **O04:** Contract upgrade governance and migration; cannot sacrifice custody protections for easier ops.
- **O05:** Agent inference provider / costs; prefer deterministic orchestrator baseline and free existing inference if available.
- **O06:** Deployment infrastructure, testnet faucets and free quotas; verify current constraints.
- **O07:** Relationship between onchain 'proposal' and offchain proposal: choose single canonical identifiers, prevent spoofing.

## Blocking design reviews before value-bearing deployment
Prove deposits/withdrawals incl gas/storage, private callbacks, non-replay, budget conservation under concurrency, and attestation identity semantics in actual compiled contract. These are implementation tests, not assumed established properties.

## D011 — M0 foundation tooling and authority boundaries (2026-11-01)

Implementation began after the UTC start gate. Use pnpm 9.15.9 workspaces,
Node 24.22.1, Next.js 16.4.3/React 19.3.1, Fastify 5.12.7, Zod 4.6.7,
TypeScript 7.0.2, PostgreSQL 17.10 and Rust 1.96.1/near-sdk 5.30.0.
Exact direct dependency pins and pnpm/Cargo lockfiles preserve resolution;
container images and CI actions use immutable digests/commits. Install scripts
are disabled for JavaScript dependencies; the tested builds work without them.

Sources checked during implementation: npm package metadata for engine/version
requirements; official Next.js installation and Fastify Getting Started docs;
near-sdk-rs README (MSRV 1.95.0) and crates.io metadata; official Node/Postgres
image manifests; GitHub action tag refs. Installed Node and Rust satisfy those
requirements. Tool versions are decisions, not evidence of security auditing.

M0 adds no financial authority. Contract and API payment interfaces are absent,
agent request schemas have no executor, and worker/verifier entrypoints explicitly
report disabled capability. No O02–O07 security decision is silently resolved.
The PostgreSQL bootstrap account is local-development-only; its credential is
passed only to database/API services and is not an owner or verifier key.

CI gates are implemented, with hosted results recorded in M0_REPORT.md. The owner
has authorized a feature-branch commit/push and PR against staging for review.
Merge, deployment and repository visibility changes remain unauthorized. Required
branch-check configuration is outstanding; staging was unprotected at review.

## D012 — M1 identity policy proposal (pending owner approval)

M1 starts from the confirmed M0 merge `84ffd209d767660d0cae5c369aa2aa52a54148e8`
on `feat/m1-identity-access`. See M1_DESIGN.md for the proposed NEP-413 login
policy and alternatives. Owner approval of the active full-access Ed25519 key
policy was requested before implementing wallet verification or session issuance.
The official NEP requires full-access message signing; restricted agent keys must
not silently become wallet-owner login credentials. No approval is inferred from
elapsed time. This entry is a proposal, not a settled authorization decision.

Independent preparation adds transactional, checksummed PostgreSQL migrations and
schema constraints for identity records. Tests use temporary schemas, never wallet
credentials. No login endpoint, wallet connector, organization authorization API,
agent credential or financial method is introduced by this preparatory change.
M1 remains incomplete until the approved authentication, sessions, RBAC/UI and full
adversarial acceptance suite are implemented and verified.
