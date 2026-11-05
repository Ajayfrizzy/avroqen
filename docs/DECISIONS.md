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

## D014 — M3 financial protocol (owner-approved, 2026-11-01)

M3_DESIGN.md records recommended custody/storage, caller/domain/guardian and
failure/recovery packages with alternatives. These settle substantive ambiguities
left by CONTRACT_SPEC; none are inferred from M2 offchain-consent approval.
Financial implementation began only after those decisions. No deployment,
public-network transaction, privileged key creation or token spend is authorized.

Owner explicitly approved all three M3 packages: direct funding/separate storage
credit; direct authority/owner-only execution; terminal attempts/quarantined unknown
outcomes. These authorize implementation and local sandbox verification only.
They do not authorize public-chain deployment, keys, transactions or token spending.


M3 implementation notes: exact NEAR atomic units and immutable policy remain
canonical. CONTRACT_SPEC's former budget-minus-spend shorthand was replaced by
actual deposit conservation, as required by approved direct funding. Owner
withdrawal record storage is charged outside agent/verifier mandate allowances.
The NEAR-target build explicitly sets `--cfg near` for near-sdk-env 0.1.8. Narrow
host transfer/callback calls avoid linking SDK general-purpose administrative
promise actions; an exact Wasm method/host-capability gate and mandatory real
sandbox job now replace the M0 scaffold-only assertion. No authority boundary
changed during this implementation. Protocol reserve 0.1 NEAR, callback 20 Tgas,
remaining-gas minimum 60 Tgas and bounded records are documented engineering
limits, not permissions to spend or claims of maximum-load certification.


## D015 — M4 scoped application capabilities (owner-approved, 2026-11-02)

Owner explicitly selected option A in M4_DESIGN.md: independently authenticated
256-bit bearer capabilities, hash-only persistence, exact agent/org/network/mandate/
policy/vault scope, 24-hour maximum (15-minute demo), bounded by mandate expiry.
Original owner issuance requires active owner membership, session, Origin and CSRF.
Live permission checks, atomic rotation and explicit revocation are mandatory.
This grants offchain proposal access only, never custody, verifier or chain signing.
The in-memory demo transport holds the token outside task inputs and runtime tools.
See M4_DESIGN.md for alternatives, risk boundaries and implementation verification.


## D016 — M5 human provenance and signed reviews (owner-approved 2026-11-02)

Owner approved A (fresh wallet-signed review decisions) and chose B2 (independent
human source verification), explicitly not the proposed synthetic provider service.
M1 identifies the designated account; each review needs a new session-bound NEP-413
proof with finalized active FullAccess Ed25519 validation and one-use five-minute
challenge. Signed provenance/MAP-1 preparation never substitutes for an onchain
verifier transaction. Human source observations are attributed assertions, not
automated provider authentication. Synthetic exercises never count for live readiness.
No provider/wallet secrets are created or stored. See M5_DESIGN.md for scope,
independence limitations, per-claim quorum, owner separation and dispute boundaries.

## D017 — Integrated product acceptance sequencing (owner-directed, 2026-11-02)

Complete the integrated product before further repetitive desktop/Android milestone
walkthroughs. Preserve M5's approved A/B2 implementation and all automated gates;
do not restart or expand M5. Its real-wallet and authentic independent-source
acceptance moves to pending integrated M8 testing, not passed or waived. PR #9 is
eligible for hackathon integration with green required CI and no confirmed blocking
defects; merge still requires separate owner authorization. This is not production
security approval, and self-review is not an independent audit.

M6 owns real NEAR Testnet wallet transaction orchestration, verified receipts,
indexing/reconciliation and quarantined unknown outcomes. M7 completes monitoring,
incident UX and the already-approved emergency authority controls. M8 validates the
complete M1–M7 journey, including physical Android and genuine independent verifier
message/transaction signatures. M9 delivers a polished reproducible judges' demo,
temporarily hosted on RumptyCloud, with actual NEAR Testnet results. Hosting terms,
zero-cost availability, HTTPS/origin configuration and teardown must be verified
before a separately authorized deployment; no infrastructure is provisioned now.

Simplify owner/verifier journeys: calculate exact-byte digests locally where safe,
convert human-readable NEAR decimal strings to checked atomic integers without
floating-point arithmetic, and put protocol details behind an inspectable view.
Do not auto-confirm independent provenance, change signed terms, hide consequential
wallet approvals, or turn app roles/consent into onchain authority. Synthetic
fixtures remain useful automated tests, never genuine source or payment evidence.
No authority boundary, expiry, nonce, quorum, accounting, custody or key policy is
changed. No deployment, token transfer, merge or repository-publication permission
is granted by this sequencing decision.

## D018 — M6 intended deployment account and retained-key governance

Owner decision (November 2, 2026): target `avroqen-vault.testnet`; retain an owner-controlled deployment full-access key for the small hackathon demo, accepting contract replacement and direct-transfer risk. No deployment/account creation/key mutation/transaction is authorized by this selection. At the initial observation, finalized public testnet RPC reported `UNKNOWN_ACCOUNT` (superseded by D019); account control, public keys, balance, deployed artifact and initialized domain must be verified before live authorization. See M6_DESIGN.md. Backend, worker and AI never receive wallet keys; all M3 financial invariants remain mandatory.

## D019 — Demonstration governance disclosure and future vault direction

Owner-directed M6 review, 2026-11-02: D018's retained owner-controlled FullAccess key applies only to the dedicated low-value Testnet demonstration. Its code-replacement, direct-transfer and account-deletion powers are outside MandateVault restrictions. Do not claim immutable deployment or fully noncustodial operation. The account now exists with 4.5 NEAR, no code and one FullAccess key at finalized block 275954911; this supersedes D018's earlier UNKNOWN_ACCOUNT observation.

Proposed production direction is a versioned verified factory and separate user/organization vaults, independent mandate ownership, no platform master withdrawal or unilateral customer upgrade/full-access authority, explicit cost responsibilities and auditable provenance. Immutable versus user-governed upgrade/migration/recovery remains a future reviewed choice. Current M3 direct initialization/authority is not factory/DAO compatible and is unchanged. See VAULT_GOVERNANCE.md. This records design direction, not deployment, spending, key mutation or production approval.

## D020 — M7 advisory monitoring and existing emergency authority

M7 projects server-owned audit/reconciliation records into redacted events, deterministic five-minute detection windows and tenant-scoped incidents. Existing active owner/admin application roles may respond, without wallet/onchain authority. All active members retain scoped read access. Assignment is self-assignment by an authorized responder, with versioned transitions and append-only history.

A guardian with active organization access may prepare PAUSE through M6 after finalized exact mandate/guardian verification, repeated before prompting. Only the original owner may resume/revoke. M3 code/custody/accounting and guardian stop-only authority are unchanged. Dashboard notification does not mean external delivery. Monitoring never automatically pauses, signs, broadcasts, settles or releases funds. See M7_DESIGN.md. No deployment, key mutation or transaction authorization is granted.

## D021 — M8 integrated observation and acceptance boundary

M8 connects the existing role-specific workspaces with an assignment-scoped journey, exact decimal NEAR entry and local exact-byte evidence hashing. Failed settlement refresh disables wallet actions and labels retained history stale; no stale balance is represented as current. An offchain proposal/consent/review never implies chain submission, quorum or payment. No authority, custody, policy, expiry, callback or quarantine rule changes. S01–S20 automation remains mandatory; physical Android/desktop, authentic independent evidence and genuine public Testnet receipts remain separate pending integrated acceptance. Public deployment/funding/transactions require the exact M8 authorization package and later owner approval. iOS remains deferred; self-review is not independent review.

## D022 — M8 design system and advisory overview

Owner-requested redesign retains existing routes and security handlers behind a shared light-theme shell, accessible native controls and guided mandate/evidence forms. Overview uses scoped authorized observations and never infers settlement from offchain consent or evidence. Its next-action recommendation is advisory; exact wallet reconstruction, backend checks and contract enforcement remain mandatory. Sign-out requires server invalidation and CSRF. No financial, custody, identity or evidence authority changes. Test-only axe tooling and explicitly synthetic screenshots support accessibility/visual verification, not genuine wallet or independent-source acceptance. See UI_DESIGN_SYSTEM.md and M8_UX_REDESIGN_REPORT.md.

## D023 — Isolated deployment preview and Meteor compatibility boundary

Owner-requested preparation, 2026-11-05: retain Meteor-only custody and the approved366735-byte artifact. A loopback-only, no-script reviewer validates the exact deploy/init proposal and offline historical or fresh finalized read-only account observations. No wallet invocation/signing/broadcast route, app/API integration, credential import, new key or M6 enablement is added. Actual pinned SDK serialization is exercised separately offline with deterministic placeholders, never a prepared public signature.

Meteor wallet payload acceptance and transparent human review remain unverified; SDK serialization and browser MessageChannel success are not wallet compatibility. Its legacy web response listener requires source/origin trust review before a future deployment connector; a transaction prompt is signing-capable and cannot be called a guaranteed review-only mode. A separate explicit review-and-cancel authorization and then separate live deployment authorization remain required. No existing financial or custody boundary changes. See METEOR_DEPLOYMENT_COMPATIBILITY.md and METEOR_DEPLOYMENT_REVIEWER.md.
