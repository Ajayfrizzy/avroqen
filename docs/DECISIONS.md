# Architecture decision log

## M0 preparation — October 31, 2026

Foundation implementation remains blocked until November 1 at 00:00 UTC by
AGENTS.md and [CODEX_BOOTSTRAP.md](archive/milestones/CODEX_BOOTSTRAP.md). The preparation plan and verification status
are recorded in [M0_FOUNDATION.md](archive/milestones/M0_FOUNDATION.md). This entry changes no
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

CI gates are implemented, with hosted results recorded in [M0_REPORT.md](archive/milestones/M0_REPORT.md). The owner
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
claims. No financial/security invariant is waived. See [M2_DESIGN](archive/milestones/M2_DESIGN.md) and [M2_REPORT](archive/milestones/M2_REPORT.md).

## D014 — M3 financial protocol (owner-approved, 2026-11-01)

[M3_DESIGN.md](archive/milestones/M3_DESIGN.md) records recommended custody/storage, caller/domain/guardian and
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

Owner explicitly selected option A in [M4_DESIGN.md](archive/milestones/M4_DESIGN.md): independently authenticated
256-bit bearer capabilities, hash-only persistence, exact agent/org/network/mandate/
policy/vault scope, 24-hour maximum (15-minute demo), bounded by mandate expiry.
Original owner issuance requires active owner membership, session, Origin and CSRF.
Live permission checks, atomic rotation and explicit revocation are mandatory.
This grants offchain proposal access only, never custody, verifier or chain signing.
The in-memory demo transport holds the token outside task inputs and runtime tools.
See [M4_DESIGN.md](archive/milestones/M4_DESIGN.md) for alternatives, risk boundaries and implementation verification.


## D016 — M5 human provenance and signed reviews (owner-approved 2026-11-02)

Owner approved A (fresh wallet-signed review decisions) and chose B2 (independent
human source verification), explicitly not the proposed synthetic provider service.
M1 identifies the designated account; each review needs a new session-bound NEP-413
proof with finalized active FullAccess Ed25519 validation and one-use five-minute
challenge. Signed provenance/MAP-1 preparation never substitutes for an onchain
verifier transaction. Human source observations are attributed assertions, not
automated provider authentication. Synthetic exercises never count for live readiness.
No provider/wallet secrets are created or stored. See [M5_DESIGN.md](archive/milestones/M5_DESIGN.md) for scope,
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

Owner decision (November 2, 2026): target `avroqen-vault.testnet`; retain an owner-controlled deployment full-access key for the small hackathon demo, accepting contract replacement and direct-transfer risk. No deployment/account creation/key mutation/transaction is authorized by this selection. At the initial observation, finalized public testnet RPC reported `UNKNOWN_ACCOUNT` (superseded by D019); account control, public keys, balance, deployed artifact and initialized domain must be verified before live authorization. See [M6_DESIGN.md](archive/milestones/M6_DESIGN.md). Backend, worker and AI never receive wallet keys; all M3 financial invariants remain mandatory.

## D019 — Demonstration governance disclosure and future vault direction

Owner-directed M6 review, 2026-11-02: D018's retained owner-controlled FullAccess key applies only to the dedicated low-value Testnet demonstration. Its code-replacement, direct-transfer and account-deletion powers are outside MandateVault restrictions. Do not claim immutable deployment or fully noncustodial operation. The account now exists with 4.5 NEAR, no code and one FullAccess key at finalized block 275954911; this supersedes D018's earlier UNKNOWN_ACCOUNT observation.

Proposed production direction is a versioned verified factory and separate user/organization vaults, independent mandate ownership, no platform master withdrawal or unilateral customer upgrade/full-access authority, explicit cost responsibilities and auditable provenance. Immutable versus user-governed upgrade/migration/recovery remains a future reviewed choice. Current M3 direct initialization/authority is not factory/DAO compatible and is unchanged. See VAULT_GOVERNANCE.md. This records design direction, not deployment, spending, key mutation or production approval.

## D020 — M7 advisory monitoring and existing emergency authority

M7 projects server-owned audit/reconciliation records into redacted events, deterministic five-minute detection windows and tenant-scoped incidents. Existing active owner/admin application roles may respond, without wallet/onchain authority. All active members retain scoped read access. Assignment is self-assignment by an authorized responder, with versioned transitions and append-only history.

A guardian with active organization access may prepare PAUSE through M6 after finalized exact mandate/guardian verification, repeated before prompting. Only the original owner may resume/revoke. M3 code/custody/accounting and guardian stop-only authority are unchanged. Dashboard notification does not mean external delivery. Monitoring never automatically pauses, signs, broadcasts, settles or releases funds. See [M7_DESIGN.md](archive/milestones/M7_DESIGN.md). No deployment, key mutation or transaction authorization is granted.

## D021 — M8 integrated observation and acceptance boundary

M8 connects the existing role-specific workspaces with an assignment-scoped journey, exact decimal NEAR entry and local exact-byte evidence hashing. Failed settlement refresh disables wallet actions and labels retained history stale; no stale balance is represented as current. An offchain proposal/consent/review never implies chain submission, quorum or payment. No authority, custody, policy, expiry, callback or quarantine rule changes. S01–S20 automation remains mandatory; physical Android/desktop, authentic independent evidence and genuine public Testnet receipts remain separate pending integrated acceptance. Public deployment/funding/transactions require the exact M8 authorization package and later owner approval. iOS remains deferred; self-review is not independent review.

## D022 — M8 design system and advisory overview

Owner-requested redesign retains existing routes and security handlers behind a shared light-theme shell, accessible native controls and guided mandate/evidence forms. Overview uses scoped authorized observations and never infers settlement from offchain consent or evidence. Its next-action recommendation is advisory; exact wallet reconstruction, backend checks and contract enforcement remain mandatory. Sign-out requires server invalidation and CSRF. No financial, custody, identity or evidence authority changes. Test-only axe tooling and explicitly synthetic screenshots support accessibility/visual verification, not genuine wallet or independent-source acceptance. See UI_DESIGN_SYSTEM.md and [M8_UX_REDESIGN_REPORT.md](archive/milestones/M8_UX_REDESIGN_REPORT.md).

## D023 — Isolated deployment preview and Meteor compatibility boundary

Owner-requested preparation, 2026-11-05: retain Meteor-only custody and the approved366735-byte artifact. A loopback-only, no-script reviewer validates the exact deploy/init proposal and offline historical or fresh finalized read-only account observations. No wallet invocation/signing/broadcast route, app/API integration, credential import, new key or M6 enablement is added. Actual pinned SDK serialization is exercised separately offline with deterministic placeholders, never a prepared public signature.

Meteor wallet payload acceptance and transparent human review remain unverified; SDK serialization and browser MessageChannel success are not wallet compatibility. Its legacy web response listener requires source/origin trust review before a future deployment connector; a transaction prompt is signing-capable and cannot be called a guaranteed review-only mode. A separate explicit review-and-cancel authorization and then separate live deployment authorization remain required. No existing financial or custody boundary changes. See [METEOR_DEPLOYMENT_COMPATIBILITY.md](archive/investigations/METEOR_DEPLOYMENT_COMPATIBILITY.md) and [METEOR_DEPLOYMENT_REVIEWER.md](archive/investigations/METEOR_DEPLOYMENT_REVIEWER.md).

## D024 — Owner-operated official CLI deployment preparation

Owner direction, 2026-11-05: pursue official near-cli-rs rather than another Meteor deployment connector. Preserve the approved archived Wasm and exact atomic deploy/init batch. This supersedes the proposed Meteor transport direction, not any contract/custody invariant or approval gate. CLI/macOS Keychain cannot directly reuse a browser-held secret; any additional local Keychain copy of the existing authorized key requires separate owner approval and owner-only handling. No key export/import, new onchain key, signing or deployment is authorized by this preparation.

Version0.30.1 source exposes both plaintext fallback and secret-bearing reconstructed-command logging risks. Do not use CLI private-key/seed import commands or web-wallet login that creates a key. The proposed owner-only generic-password item and disabled legacy credential root require actual setup validation before signing. No production/financial adapter change. See [NEAR_CLI_DEPLOYMENT.md](archive/deployment/NEAR_CLI_DEPLOYMENT.md) for source provenance, unsigned inspection, setup limitations and final authorization/postchecks.


### Deployment key phases and explicit CLI selection — 2026-11-06

Owner confirmed exactly Primary and temporary Testing FullAccess keys on avroqen-vault.testnet. DEPLOYMENT validation requires both and selects only Testing; POST_REVOCATION requires Primary only and does not authorize deployment. Fresh finalized checks reject extra/missing/duplicate/restricted keys and stale account observations. Archived evidence is labeled historical. Artifact and atomic deploy/init terms remain unchanged; no financial adapter changes or automatic M6 enablement.

CLI v0.31.0 online Keychain selection is not pinned by the public-key option. Offline mode pins the Keychain item but refuses direct send. The proposed owner-only procedure therefore signs offline to a protected file and submits that exact file separately. This signed-authorization artifact is a new operational tradeoff requiring explicit owner approval before use; it was not created here. Plaintext credential fallback remains isolated with /dev/null/avroqen-no-legacy (code is not disabled). No signing, Keychain access, key removal or deployment is authorized by this decision. See [NEAR_CLI_DEPLOYMENT.md](archive/deployment/NEAR_CLI_DEPLOYMENT.md).


## D025 — Isolated offchain Primary-key control preparation

Owner-directed preparation, November 7, 2026: use a separate fixed-policy, single-process in-memory challenge verifier for avroqen-vault.testnet/Testnet and the exact approved Primary key. Reuse NEP-413 crypto, never the application login/session route. Five-minute CSPRNG challenges are immutable, claimed atomically before RPC and closed on success/failure/cancellation; verify exact signed purpose/recipient/key and fresh finalized, pinned account/two-FullAccess-key state. No signing, transaction, contract call, financial activation or custody/configuration change is introduced.

The inspected Meteor SDK popup listener lacks source/origin validation; injected extension callbacks are a different transport with no MessageEvent provenance. An unwired, fixture-tested popup guard uses exact source/UID plus explicitly reviewed origin/status routes, allowing review of multiple actual response origins rather than assuming one universal origin. No global SDK patch or wallet entrypoint is enabled. Owner review of full diff, rendered challenge and transport approach remains required before any real signing entrypoint. Single-process state, RPC/provider trust, actual hosted/extension provenance and exclusive-custody limitations are explicit in [the existing wallet acceptance runbook](runbooks/security/WALLET_ACCEPTANCE.md#implemented-isolated-preparation--november-7-2026). This is self-review, not independent audit or live Primary proof.


### Step 108F — popup-only source preparation, no live activation

Use a source-hash-pinned private SDK preparation factory with the legacy messenger/listener removed, one injected per-proof messenger, explicit `v1_web`, fixed hosted base and no extension/fallback path. Combined action uses wire `login`. Terminal-first success follows inspected SDK behavior while native source/origin/UID, exact signed challenge and fresh finalized Primary FullAccess verification remain mandatory. The isolated public facade's reviewed response-origin list stays empty. No installed SDK, app auth, live config or signing entrypoint changes.

Actual transformed SDK tests use mock popup/transport/RPC and fixture signatures; UI registration is explicitly mocked. A separate document/realm, reviewed browser loader/native ports/local-verifier boundary and actual hosted response-origin review remain blockers before any live prompt. Unknown redirects are rejected on response or timeout; exhaustive cross-origin navigation detection is not claimed. See [the existing acceptance runbook](runbooks/security/WALLET_ACCEPTANCE.md#step-108f--isolated-popup-only-adapter-preparation).


### Step 108H — challenge lookup contract audit

Actual working-tree core already includes issued/unexpired, same-instance read-only `getChallenge`; retain its memory-only state and atomic verify transition unchanged. Derive the popup-required verifier type from the real factory, and require the original frozen issued challenge object as well as exact values before any popup/SDK work. Exact caller-created copies are now rejected. Add lookup lifecycle/type/cross-instance and popup ownership regressions. Root TypeScript includes these scripts; its Node globals and the fixture VM's supplied Buffer are not proof of browser compatibility. Browser/CJS/Buffer/realm/IPC integration and actual response-origin approval remain blocked. See [the existing acceptance report](runbooks/security/WALLET_ACCEPTANCE.md#step-108h--actual-lookup-contract-and-challenge-ownership). No core state-machine, auth, installed SDK, configuration or signing activation change.


## D026 — Primary proof blocked; private browser integration stopped

Owner decision, November 7, 2026 (Step 108J), following the read-only Step 108I feasibility investigation: **do not enable or continue the private transformed-MeteorConnect browser integration for the one-time Primary-key proof**. This supersedes the continuation direction in D025/Steps 108F–108H. Preserve all existing preparation source and tests as research; do not activate or delete them. They are not production-ready.

Unresolved concerns include browser bundling failures on Node dependencies (`util`/`buffer`), free Buffer references and the Node-only crypto verifier, generated CJS/require assumptions, and retained dependency code that dynamically constructs functions. Fixture VM success is not an eval-free browser build. SDK/Lit custom-element registration can modify existing registered components; a separate document/realm and lifecycle design remain unverified and would not by themselves isolate compromised same-origin code. The actual hosted response-origin/redirect contract is unknown; the response-origin allowlist remains empty. No origin may be trusted merely because an incoming message reports it.

If a future proof is required, prefer investigating Meteor's supported public off-chain message-signing interface. That approach also remains **unverified** and is **not authorization to sign** or a workaround for provenance/build gates. Any future method requires separate review and explicit authorization. Its safe boundary must keep original immutable challenge state and exact Primary-key signature/fresh finalized permission verification in the Node-only isolated verifier; browser data is untrusted, raw signatures stay transient and unlogged/unpersisted, and no `/api/auth/verify`, application session issuance or blockchain transaction is involved.

Current status for `avroqen-vault.testnet`: **Primary-key proof BLOCKED; temporary Testing key RETAINED** pending a separately reviewed and authorized verification method. This is a retention decision, not a fresh on-chain observation. Live Primary control, independent security audit and Testing-key retirement readiness are not established or claimed. **Financial operations remain disabled.** No signing, key revocation, configuration change or financial activation is authorized. See [the wallet runbook's current status](runbooks/security/WALLET_ACCEPTANCE.md#current-status--step-108j).

## D027 — Public SAMPLE display contract, not financial authority

Owner-directed M9.1, November 8, 2026: prepare PRD F11's six-route public SAMPLE
journey using a single deeply immutable versioned display dataset and synthetic
aliases. M9.1 adds no rendered page or route entrypoint. Reuse reviewed visual
primitives later, never authenticated workspace pages or AppShell. Closed imports,
route lookup and offline adversarial source checks exclude wallet/auth/API/RPC,
storage/identity, server actions and archived Primary research. Same-origin cookies
may accompany navigation; static SAMPLE rendering must not read identity. This is
not separate-origin isolation or a JavaScript security sandbox.

Eligibility, illustrative review and narrative identifiers grant no authorization,
source authenticity, funded balance or settlement. Synthetic cards and every page
must retain visible SAMPLE disclosure. Browser/request/accessibility gates remain
pending until pages exist. See [M9_SAMPLE_CONTRACT](SAMPLE_CONTRACT.md) for exact
routes, amounts, boundaries and acceptance. M8 live gates and M9 hosting/submission
remain separate; no paid service, publication or financial activation is approved.
D026 is unchanged: Primary proof BLOCKED, Testing key RETAINED, financial operations
DISABLED. The stopped private Meteor integration is not resumed.

### M9.2 — Static SAMPLE walkthrough

Implement the six closed public routes and a dedicated ordinary-link shell from
D027's unchanged dataset. No authenticated workspace shell, API, cookie/session
read or wallet import. Reviewed exceptions permit only Next not-found handling,
the existing pure atomic formatter and the literal skip-link target. Source pins
cover reviewed formatter dependencies and scoped demo response headers. No live
feature gate or D026 change. Browser fixture/isolation evidence remains separate
from genuine source, public financial, physical-device and hosted M9 acceptance.

### M9.3 — Targeted responsive and accessibility corrections

Keep the existing ordinary-link shell and immutable dataset. Use container-aware
summary stacking, readable labels derived from exact disclosed status codes,
distinct route titles, bounded prose, tighter card spacing and a 44px brand-link
target. No drawer, identity read, request or financial action is introduced.
Offline and Chromium evidence is recorded in [M9_SAMPLE_CONTRACT](SAMPLE_CONTRACT.md);
physical-device, assistive-technology and genuine browser-zoom acceptance remains
pending. D026 and all live security gates remain unchanged.

## D028 — Read-only deployment verification is not submission authority

Owner-directed nonfinancial readiness hardening, November 9, 2026: parse a complete
M6 deployment manifest independently of `M6_TRANSACTIONS_ENABLED`, so authenticated
read-only status and monitoring can verify the expected Testnet account, approved
Wasm, complete key-permission fingerprints and initialized accounting/domain while
financial submission remains disabled. Every intent preparation and wallet-prompt
opening still requires the explicit submission switch. Manifest presence is neither
transaction authorization nor an onchain pause.

The trusted-RPC boundary now requires a bounded, unambiguous JSON-RPC 2.0 response,
the exact issued request ID, exactly one result-or-error member and no duplicate
decoded keys or unknown outer fields. Current deployment verification accepts a
finalized head no older than 120 seconds and at most 30 seconds ahead of the local
clock, then pins account/code/key/domain observations to its hash. Historical
receipt-block checks remain exact-hash checks after a fresh head verification.
These controls do not provide light-client consensus or remove the trusted-provider
assumption.

Health output reports only non-secret configuration/read-only/submission booleans;
it neither exposes manifest values nor claims a fresh RPC check. No wallet, signer,
contract, access-key, UNKNOWN/retry or financial-policy behavior changes. Hashless
UNKNOWN terminal clearance remains separately blocked for review. D026/D027 remain
unchanged: Primary proof BLOCKED, Testing FullAccess key RETAINED and financial
operations DISABLED. No historical amount becomes an approved budget.

## D029 — Third-party verifier roles are disjoint from mandate authority

Security correction, November 9, 2026: every designated third-party verifier in a
new immutable mandate must be distinct from its owner, restricted agent, exact
recipient and vault account. Owner `OWNER_APPROVED` and the documented owner
dispute path remain separate authorities; neither substitutes for third-party
quorum. This decision adds no unrelated pairwise rule among owner, agent and
recipient.

Historical overlapping policies and their audit records remain readable and
immutable, but cannot produce new consent approval, proposals, reviews, readiness,
attestation preparation, registration, funding or execution. Safe revocation,
incident inspection and reconciliation visibility remain available; no new chain
intent, including pause, revoke or withdrawal, may be prepared from that policy.
An unchecked independence declaration blocks third-party approval before any
signing challenge; rejection without that declaration remains valid.

The Rust source rejects overlap during registration and rechecks stored policy
before proposal submission, attestation or execution. The proposal-path recheck is
defense in depth for historical stored policies and does not mutate or delete their
records. The already deployed November 7 Wasm is unchanged and does not inherit
this correction. Any replacement deployment or migration is a separate
owner-authorized action. Primary proof remains BLOCKED, the Testing FullAccess key
remains RETAINED and financial operations remain DISABLED.

## D030 — Meteor broadcast results remain untrusted until chain reconciliation

Transaction recovery correction, November 12, 2026: pinned Meteor SDK 3.24.1's
`near::sign_transactions` action invokes the wallet's sign-and-broadcast flow and
documents `FinalExecutionOutcome[]`. Avroqen previously accepted only
`transaction.hash`, discarding otherwise usable single-result identifiers and
collapsing every post-prompt condition into one missing-hash outcome. A failed API
report could then overwrite a hash already returned to the browser with null.

The browser now accepts one consistent base58 hash from the documented
`transaction.hash`, the same outcome's `transaction_outcome.id`, or the SDK's
exported legacy hash-only response. Conflicting, multiple, malformed or missing
results are not guessed. Cancellation, explicit wallet submission failure and
genuinely unknown results receive distinct safe reason codes but all remain
`UNKNOWN` after prompt opening. A known hash is never replaced with null after a
reporting failure. The durable pre-prompt intent and finalized-block scanner remain
the recovery path, and only exact operation, signer, receiver, receipt graph,
deployment and contract-state verification can establish terminal success or
failure.

No backend signer, wallet key custody, automatic financial replay, timeout unlock,
contract change, database reset or terminal UNKNOWN override is introduced. The
wallet result and a block scan are attribution evidence under the documented trusted
RPC assumption, not independent consensus. An identical out-of-band operation after
the intent anchor can still be indistinguishable; multiple matches remain
quarantined. Existing deployment and transaction authorization gates are unchanged.

## D031 — Hashless UNKNOWN storage deposits require explicit controlled replacement

Historical M8.1 recovery correction, November 12, 2026: absence from a partial
block scan, a null storage-credit view and repeated RPC errors do not prove that a
wallet-approved transaction was never broadcast. The original intent therefore
remains `UNKNOWN`, continues ordinary reconciliation and retains every audit event.
It is never relabeled as an onchain failure and its hash is never fabricated.

One exact `STORAGE_DEPOSIT` replacement may be prepared only after at least 90,000
finalized blocks have elapsed from the immutable intent anchor. This exceeds the
documented 86,400-block transaction-validity period by 3,600 blocks. At the exact
anchor and a fresh finalized head, the application re-verifies the authorized
deployment, requires the signer's complete access-key set, permissions and nonces
to be identical, and requires `get_storage_credit` to be null. Any hash, changed
key/nonce/permission, storage credit, conflicting pinned block, short window or RPC
failure preserves quarantine.

After those checks, the original signer must authorize a five-minute, session-bound
NEP-413 message that states the original remains unknown, names the exact operation
and evidence, and authorizes only one unsigned replacement. Evidence is checked
again after signing. One database transaction appends immutable recovery evidence,
marks the original as replacement-authorized and creates one exact `PREPARED`
intent. The uniqueness guard then applies to the replacement; replay and concurrent
preparation remain blocked. No wallet transaction prompt opens automatically, and
the replacement still requires the normal separate wallet approval.

This is a controlled residual-risk decision under the existing trusted-RPC model,
not consensus proof of non-broadcast. A malicious or incorrect trusted provider
could conceal both nonce and contract-state changes. If the original later appears,
stop submission and reconcile both records. No contract, custody, deployment key,
automatic retry or terminal-state rule changes.

The Payments UI separates read-only inspection from authorization. Opening the
recovery panel performs one authenticated GET, creates no challenge and shows the
90,000-block threshold, finalized head, remaining distance and any key/storage/RPC
blocker. Only an ELIGIBLE result exposes a separate authorization action. That POST
recomputes evidence before issuing the five-minute owner message, and completion
recomputes it again. Loading, wallet-pending, cancellation, failure and durable
success remain distinct; no inspection result itself permits replacement creation.

## D032 — Consent proof rejection diagnostics preserve every authorization gate

Meteor consent investigation on November 12, 2026 confirmed that its pinned SDK
and Avroqen produce the same NEP-413 SHA-256 Borsh payload: message, 32-byte nonce,
recipient and an omitted optional callback. SDK `state` is retained response
metadata and is not signed. Stored challenge messages for the reported mandate
also reconstructed byte-for-byte. Sanitized timestamps show the latest proof was
rejected six seconds after challenge issuance, ruling out the five-minute expiry.
The remaining distinguishing input was one U+2014 character in `taskReference`:
login messages were ASCII, while all five rejected consent messages contained the
same multibyte policy text. This isolates remote wallet UTF-8 serialization as the
demonstrated interoperability failure; no proof bytes were retained or inspected.

New consent challenges therefore use message v2. The canonical policy and its
SHA-256 digest remain signed, but literal non-ASCII policy characters are rendered
with JSON `\\uXXXX` escapes before NEP-413 serialization. This is an exact,
reversible JSON representation and gives the wallet an ASCII-stable byte string;
it does not normalize, omit or alter policy terms. Existing challenges are not
rewritten and cannot be silently upgraded or replayed.

Consent verification now returns fixed, allowlisted stage codes for account and
network binding, scoped challenge/session/action/origin/expiry/consumption,
reconstructed-message integrity, local signature verification, finalized
FullAccess authorization and the final atomic consume. Security observations and
audit records contain only those codes and existing scoped identifiers. They never
contain signatures, nonces, bearer tokens or complete messages. RPC errors remain
service failures rather than false key rejection. Challenge TTL, owner/session/
CSRF binding, finalized-key requirement, single use and atomic consent recording
are unchanged; no malformed or unauthorized proof is accepted.

## D033 — Cross-organization agent discovery is exact-assignment scoped

Owner-directed correction on November 12, 2026: organization membership is not a
precondition for the wallet account explicitly designated as an immutable mandate's
agent to discover that assignment. A dedicated authenticated list filters by exact
network and stored `agent_account`; exact mandate lookups repeat that binding and
return not-found for every unassigned wallet. The view exposes only immutable terms,
the owner-organization display name and consent/expiry/agent/verifier status. It
does not grant membership, organization management, consent, evidence review,
credential-operator, owner or settlement access.

An assigned wallet may mint only a 15-minute demo capability after the server
rechecks the owner's active membership, approved offchain consent, active matching
agent registration and mandate expiry under the existing lock order. Authorization
derives from the owner's signed immutable agent designation and live consent; it
does not replace or infer a new owner approval. The credential retains the existing
owner issuer required by policy and adds an immutable exact holder marker. That
marker permits the wallet to revoke only its own capability, never an owner-issued
demo/operator credential. Proposal preparation, submission, idempotency, evidence,
financial and onchain checks remain unchanged and continue through the existing
bearer-scoped agent tool. Revoked, expired or disabled assignments remain visible
for an honest denial state but cannot issue a capability or submit a proposal.

## D034 — Independent review messages use ASCII-stable NEP-413 bytes

Meteor review investigation on November 12, 2026 found the same compatibility
boundary addressed for consent in D032. The review challenge always began with a
literal U+2014 em dash, making every M5 message multibyte even though the bounded
review and MAP-1 fields are otherwise ASCII. Avroqen reconstructed and verified
the original UTF-8/Borsh bytes, so any remote-wallet Unicode byte drift produced a
valid-looking nonempty signature that failed local Ed25519 verification.

Fresh review challenges now use message v2 with an ASCII header. The exact review,
MAP-1 payload, organization, policy digest, evidence and submission digests,
challenge, Origin and expiry remain in the signed JSON body. Any future non-ASCII
structured value is rendered with reversible JSON `\\uXXXX` escapes, preserving
the value without ambiguous transport bytes. Existing challenge rows and evidence
records are not rewritten; a legacy or altered stored message fails reconstruction.

Review verification returns fixed `REVIEW_PROOF_*` stage codes for account/network,
challenge/session/actor/origin/expiry/consumption, MAP-1 payload, reconstructed
message, Ed25519 signature, finalized FullAccess key and atomic consumption. Only
the allowlisted code and existing scoped identifiers reach security observations;
signatures, nonces, session tokens and complete messages remain excluded. The
five-minute TTL, CSRF/session binding, designated verifier and claim checks, exact
proposal/evidence/policy bindings, finalized key requirement and single-use commit
are unchanged.

## D035 — Historical storage recovery is independent of live mandate expiry

Controlled-recovery correction on November 12, 2026: mandate expiry governs new
mandate operations, but it must not alter the immutable meaning of a storage-deposit
attempt made while the mandate was active. Reusing the live operation builder for
recovery challenge issuance, proof completion and replacement wallet review applied
the current timestamp and rejected an otherwise eligible historical replacement as
`OPERATION_NOT_ALLOWED`.

Historical reconstruction now has one narrow domain path: it accepts only an exact
canonical `STORAGE_DEPOSIT`, derives the expected signer, vault, method, arguments,
gas, deposit, mandate and policy digest from the immutable policy, and requires
byte-for-byte equality. It intentionally does not apply current mandate expiry.
The route additionally requires the current authenticated owner membership and the
original signer, approved deployment manifest, hashless UNKNOWN state, 90,000-block
distance, identical complete signer-key state, null finalized storage credit, fresh
evidence, still-approved consent, an enabled agent, owner NEP-413 proof and the
atomic single-replacement database binding.

This path does not change consent, mandate status or contract state and cannot build
registration, funding, proposal, evidence, execution, withdrawal or a new unlinked
storage-deposit intent. Ordinary operation preparation retains the live expiry and
consent checks. Completion creates only one identical unsigned `PREPARED` record,
preserves the original UNKNOWN record and audit events, and never opens or approves
a wallet transaction. The owner must separately request wallet review; if the
original advances or any binding changes, that review remains blocked.

## D036 — Read-only RPC availability failover preserves evidence validation

Testnet availability correction on November 12, 2026: the fixed RPC helper retried
HTTP 429 but allowed a timeout, network failure or transient provider 5xx to end a
read immediately. Deployment verification therefore alternated between current and
unavailable even though the approved manifest and financial-submission switch were
unchanged.

Allowlisted read-only JSON-RPC methods now fail over across the existing fixed
providers after transport errors, per-provider timeout, HTTP 429, HTTP 408 and
retryable 5xx responses. Every attempt gets a new abort signal, is capped at two
seconds, and shares a strict six-second overall deadline. Rate-limit `Retry-After`
and transient-provider cooldowns are bounded. Exhaustion or deadline expiry fails
closed; non-transient responses and JSON-RPC errors are returned to the unchanged
strict validator instead of being hidden by another provider.

This is availability failover, not provider quorum or weaker evidence. `NearReader`
still validates the exact response ID and envelope, Testnet identity, finalized
freshness, approved code hash, complete vault access-key set and accounting domain.
Deployment reads remain pinned to one finalized block hash across providers and
reject inconsistent results. The helper rejects every transaction-broadcast method,
so it cannot retry or resubmit a signed transaction.

Chain status now reports the configured `submissionEnabled` switch independently
from `deploymentVerified`. An RPC outage leaves the former unchanged and the latter
false. Payments labels that state as unavailable and keeps transaction controls
disabled until fresh verification succeeds; it no longer claims configuration was
disabled because evidence was temporarily unavailable.

## D037 — Provider rate limits are shared; transient failures are request-local

Post-PR #38 Testnet correction on November 12, 2026: three consecutive deployment
checks produced `RPC_TIMEOUT`, `RPC_HTTP_STATUS`, then immediate `RPC_UNAVAILABLE`.
The third call made no provider attempt because PR #38 put timeouts, network errors
and retryable HTTP failures into the same global 15-second cooldown used for 429s.
Its two-second provider limit also rejected plausible public Testnet latency, and a
failure while streaming an HTTP 200 body occurred after failover had already ended.

Only an explicit provider-imposed 429 now creates shared cooldown state, with the
existing bounded `Retry-After`. Timeouts, transport failures, response-body failures
and retryable 408/5xx responses remain local to one request. A later independent
verification can therefore attempt every provider not explicitly rate-limited.
All-rate-limited, all-timeout and mixed exhausted-provider outcomes remain distinct
fixed categories; none is accepted as evidence.

Each provider receives a fresh 3.5-second signal under a nine-second RPC deadline.
Complete deployment verification has a separate 15-second deadline across status,
finalized head and parallel pinned reads. Successful HTTP bodies are bounded and
read inside the provider attempt, so a streaming failure can safely reach the next
provider while oversized responses still reach the unchanged four-MiB rejection.
Valid JSON-RPC error envelopes and nonretryable HTTP responses are not hidden by
provider shopping.

Production diagnostics record only method, network, public provider hostname,
attempt index, fixed category and optional numeric status/counts. No parameters,
request IDs, account/key data, credentials or response content are logged. Network,
freshness, block pinning, contract hash, complete access-key and accounting checks
remain unchanged. The read-only method allowlist still excludes signed-transaction
broadcast, and unavailable evidence still disables every financial operation.

## D038 — Expired-mandate replacement signing requires a durable recovery binding

Controlled-replacement signing correction on November 13, 2026: a prepared
replacement is identified only by its immutable `chain_recoveries` relationship,
not by its operation kind, a client flag or the original intent's timestamp marker.
The settlement read model exposes that server-derived relationship so the owner can
review the exact historical storage deposit after mandate expiry. Ordinary storage
deposits, registration, funding, proposals, attestations and execution are rejected
at authorization before operation-specific records are loaded.

Opening the replacement wallet prompt repeats finalized recovery evidence checks,
including the 90,000-block distance, complete signer key/permission/nonce equality,
null storage credit and approved deployment. The transaction is reconstructed only
through the exact historical `STORAGE_DEPOSIT` equality path and must equal both the
original UNKNOWN operation and the immutable prepared replacement. Current owner
membership, signer, consent, enabled-agent, manifest and duplicate-prevention gates
still apply. The original remains UNKNOWN, and any changed chain evidence or binding
leaves the replacement PREPARED without opening a wallet prompt.

The history action now scrolls to and focuses the existing exact transaction review
region, respecting reduced-motion preferences. This is navigation and review only;
it does not begin, sign or report a transaction.

## D039 — Historical hash-pinned reads may fall back to archival RPC

Controlled-recovery availability correction on November 13, 2026: the approved
non-archival Testnet providers can return a valid `UNKNOWN_BLOCK` error for an old
intent anchor that the approved archival provider still serves. Read-only routing
may therefore continue to the next approved provider only when the request is an
exact valid block-hash-pinned `block` or `query` call and the complete JSON-RPC
envelope strictly validates as `UNKNOWN_BLOCK`. This supports the immutable
historical anchor and its block-pinned code, account, access-key and contract-view
reads without creating or changing an operation.

Malformed or ambiguous envelopes, wrong response IDs, invalid block hashes, other
JSON-RPC errors and nonretryable HTTP responses do not enable this fallback. The
accepted archival response still must match the requested block hash, and all
existing height, network, code-hash, complete key-set, signer nonce/permission,
storage-credit and accounting-domain checks remain mandatory. Conflicting or
unavailable archival data fails closed and leaves recovery quarantined.

The fallback remains inside the existing read-only method allowlist and bounded
per-provider/overall deadlines. Explicit 429 cooldown and request-local transient
failure behavior from D036–D037 are unchanged. Signed transaction submission is
not accepted by this routing layer.

## D040 — Historical recovery uses an archival-first bounded timing budget

Observed Testnet archival reads for block 277284348 completed in 3,314–3,983 ms,
which can exceed the ordinary 3.5-second provider limit. Historical recovery now
identifies only valid hash-pinned `block` and `query` requests as historical and
tries the approved archival provider first. Each such read permits at most six
seconds for one provider and eight seconds overall. Ordinary reads retain the
existing 3.5-second provider and nine-second overall limits from D036–D037.

Historical deployment verification has a 25-second ceiling, and the complete
anchor/head/key/storage evidence pass shares one 35-second deadline signal. This
allows an archival block read followed by parallel pinned state reads without an
unbounded workflow. D041 removes the redundant current-deployment pass that was
originally retained before this evidence workflow; the workflow's own fresh-head
deployment verification remains mandatory before the wallet prompt.

Provider timeout, validated `UNKNOWN_BLOCK` and conflicting block data remain
distinct failures (`RPC_TIMEOUT`, historical state unavailable and
`RPC_BLOCK_MISMATCH`). None proves that an earlier wallet operation was not
broadcast. Every archival result still passes exact anchor hash/height, network,
code, complete deployment-key, signer-key/nonce/permission, storage-credit and
accounting-domain checks. The approved provider list, 429 cooldown behavior,
read-only method allowlist and signed-transaction prohibition are unchanged.

## D041 — Replacement begin reuses the complete recovery evidence pass

Testnet correction on November 13, 2026: controlled-replacement `/begin` first ran
a complete current deployment verification and then ran the bounded recovery pass,
which itself verifies the exact historical deployment and a fresh current
deployment. The redundant first pass added up to 15 seconds and another set of
public-provider reads before the 35-second historical evidence workflow. Under
normal Testnet latency this could return 503 before the transaction prompt even
though configuration remained authorized and no wallet transaction had started.

Replacement `/begin` now uses the recovery pass as its deployment verification:
one exact historical deployment and one fresh finalized deployment remain
mandatory. Ordinary intents retain their current deployment verification. The
recovery deadline, archival routing, block pinning, manifest/code/key/accounting
checks, signer-state and storage-credit equality, immutable operation rebuilding,
owner authorization and atomic duplicate guard are unchanged. A failed check leaves
the replacement `PREPARED` and records no `AWAITING_WALLET` event.

Pre-wallet failures emit a sanitized request correlation identifier, fixed workflow
stage and fixed failure category. API responses distinguish configuration disabled,
deployment timeout, unavailable evidence and deployment inconsistency without
including provider bodies, RPC parameters, accounts, keys or signatures. Payments
shows that server response instead of reporting wallet cancellation. The Meteor
transaction action is still prompted only after the database commits exactly one
`AWAITING_WALLET` transition; read-only failover never signs, retries or broadcasts.
