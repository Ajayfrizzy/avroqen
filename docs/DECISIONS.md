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

## D012 — M1 wallet authentication (owner-approved, 2026-11-01)

Owner explicitly approved: “Approve full-access-key verification (recommended).”
Use NEP-413 offchain message signing and a finalized RPC check that the exact
Ed25519 public key remains an active FullAccess key for the account on the
server-selected network. Restricted function-call keys cannot authenticate as
wallet owners. The alternative of restricted-key application identities would
require a separate approved permission mapping. This approval does not authorize
transactions, custody, deployments, publication or treasury permissions.

The API binds challenge account/network/origin/recipient/expiry and a random nonce,
requires a browser-bound HttpOnly cookie, and atomically consumes the challenge
while issuing one opaque session. Sessions last 15 minutes absolutely, with
server-side logout and rotation. Tokens are stored only as hashes. Exact Origin
and session-derived CSRF tokens protect mutations. HTTPS cookies use Secure,
HttpOnly, SameSite=Strict and the __Host- prefix. HTTP is accepted only for an
explicitly enabled loopback development origin. No forwarded headers are trusted.

Finalized NEAR RPC is a trust dependency, not an independently verified light
client. Key removal after login is reflected at the next login, with existing app
session exposure bounded by its 15-minute expiry; it cannot authorize an onchain
operation. RPC/DB errors fail closed. PostgreSQL membership checks and mutation
locks enforce app tenant/role permissions; app owner is not onchain owner.

Meteor SDK 3.24.1 uses only near::sign_in_and_sign_message, no contract or
addFunctionCallKey argument. In-memory connector metadata, disabled mobile bridge,
and a rejecting key-store provider prevent application-managed wallet key custody.
The library contains other capabilities, but the application does not invoke them.
NEP-413 payload encoding is checked against independent Borsh fixtures. External
wallet interaction and finalized RPC are simulated explicitly in automated tests;
manual real-wallet desktop/mobile compatibility remains a review gate.

React Query is pinned/overridden to 5.101.2 to satisfy the connector's peer range
and React 19; its older nested 5.51.5 declares only React 18 support. No install
scripts are enabled. This dependency choice is not an audit claim.

Rate counters are atomic in PostgreSQL: 30 writes and 120 reads/minute per direct
peer IP, with one rate-limit audit per bucket/window. Behind the same-origin Next
proxy the budget is shared; this conservative development default can cause denial
of service between users. Production needs a reviewed ingress/IP policy and
retention/cleanup for expired identity/rate/audit data, not blind trust in headers.
No session, role, agent record, backend approval or DB write grants financial
permissions. Contract, worker and verifier authority remain unchanged.

M1 pre-PR review additionally binds session lookup and pending proof verification
to the current configured origin. Changing PUBLIC_ORIGIN invalidates prior-origin
challenges/sessions; the M1 popup protocol rejects nonempty callback URLs. A failing
PostgreSQL regression demonstrated the prior gap and now passes.

M1 cancellation UX clarification (2026-11-01): classify only pinned Meteor SDK
explicit cancellation tags or its exact connector-cancel Error as neutral status.
Popup failures take precedence; unknown errors remain failures. Cancellation aborts
before backend verification and retry obtains a fresh challenge. This changes no
identity or financial authority. Source-verified SDK shapes and automated connector
cancellation do not replace manual signing-popup validation.

M1 dependency review (2026-11-01): Meteor SDK 3.24.1's V1 messenger contains two
unconditional console calls that bypass `setLoggingLevel("none")`, exposing its
connection state and successful response payload. A hash-locked pnpm patch removes
only those calls in ESM/CommonJS entrypoints. No signing, transport, key permission,
nonce, session or authorization logic changes. A test checks both installed
artifacts after frozen installation. Dependency-wide independent review is still
required; this is not a claim that all unused SDK capabilities have been audited.

M1 private HTTPS acceptance (2026-11-01): use a short-lived local test CA and a
loopback-only TLS proxy with Android USB reverse on 8443. Only the public CA cert
may be transferred; trust installation is an explicit human device action. No
public tunnel/LAN binding or automatic system trust change. The HTTPS Compose
override fixes the exact HTTPS origin and disables the HTTP exception, preserving
all cookie/CSRF/identity policies. Certificates are ignored and excluded from images.
Host TLS validation is not Android browser trust or independent security review.

M1 negative verification closeout (2026-11-01): use isolated synthetic proofs for
replay, browser substitution and wrong account/network tests; do not ask the owner
to copy/export real proof bodies. No-Domain response headers establish host-only
scope; DevTools showing an owning host in its Domain column is not evidence that a
Domain attribute was sent. Human Android TLS/session-attribute observations are
recorded separately. iOS is deferred by explicit owner instruction. No authentication
or financial authority policy was changed to satisfy tests.

## M1 hackathon integration acceptance — 2026-11-01

Owner clarification: Avroqen is a hackathon testnet prototype. External independent
security audit is not a prerequisite for merging M1 for hackathon development.
Accept M1 integration based on its milestone evidence, green required CI and no
confirmed critical/high blocking defects. Independent review remains not performed;
manual negative-wallet gaps and deferred iOS remain explicit. This scopes M1
integration only, not production security approval or a waiver of TEST_PLAN release
review, M2+ financial gates, or canonical authority boundaries. Final merge requires
the owner's authorization. No runtime security policy changes.

## D013 — M2 offchain consent and verifier policy (owner-approved, 2026-11-01)

The owner explicitly approved all three proposals: offchain-only M2 signatures,
explicit quorum/claim bindings, and per-claim quorum plus distinct owner approval.
NEP-413 plus finalized active FullAccess Ed25519 verification is required for both
consent approval and revocation. Sign complete immutable policy, exact owner/org/
network/intended vault/mandate/version/action/origin, random single-use nonce and
five-minute expiry, bound to the initiating authenticated session. An intended
vault account is explicit and unverified; M3 needs fresh owner-signed onchain
authorization. No session, DB record or M2 message grants custody authority.

O02 is resolved for M2: explicit unique verifier accounts and threshold apply to
each selected third-party claim. `requireOwnerApproval` separately binds the actual
mandate owner's per-payment attestation requirement; neither M2 consent nor an
arbitrary verifier's claim counts as that approval. No empty verifier policy or AI
evidence default. M5 evidence enforcement remains unimplemented and mandatory.

Snapshots use schemaVersion=1/policyVersion=1, exact u128 decimal atomic strings,
u64 nanosecond expiry and u32 execution limits. Each independent mandate gets a
new UUID; corrections require a new mandate and fresh consent, never editing a
signed record. No cross-mandate revision lineage is inferred. Owner-only creation
and same-wallet approval/revocation reuse live membership, session and CSRF guards.
SQL policy/event guards prohibit ordinary UPDATE/DELETE; a privileged DB operator
can bypass guards and remains untrusted for custody. Consent verification records
contain no raw signatures and are not portable, independently verifiable proofs.

Revocation is terminal offchain and remains possible after expiry or agent disable.
Onchain status stays NOT_SUBMITTED, with no invented receipt or transfer. Reserved+
successful execution accounting, per-claim attestations, dispute blocking, actual
revocation inclusion and owner authorization remain obligations for M3/M5, not M2
claims. No financial/security invariant is waived. See M2_DESIGN and M2_REPORT.
