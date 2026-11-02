# M5 implementation and verification report

M5 implements the owner-approved A/B2 design: fresh wallet-signed human reviews of
independently obtained source evidence. This is agent implementation/self-review,
not an independent audit. Offchain functionality is prepared for draft review;
human M5 acceptance is scheduled for integrated M8 testing (D017), and controlled
public-testnet orchestration belongs to M6. M5 is not being reopened or expanded.

## Repository and approved authority

M4 PR #8 merged into staging at `2dc51a44f9fbe6ca5515cc6a7867885ace5b61f8`.
Fetched/pruned origin, fast-forwarded staging and created `feat/m5-independent-verifier`.
Main and protected staging are not modified. D016 records the owner's explicit
approval of fresh NEP-413 review signatures and B2 independent human verification.
No unresolved source/authentication policy decision remains. B1 synthetic provider
service was not selected and is not implemented.

## Implementation inventory

- Strict shared MAP-1 and metadata/observation schemas; exact decimal atomic units,
  UUID/digest bindings, independent claim semantics and per-claim distinct quorum.
- Deterministic human-source adapter in services/verifier; no provider credentials,
  server URL fetch, private file upload, signing daemon or agent self-verification.
- Migration004: immutable evidence metadata/reviews, session-bound challenge rows,
  append-only events, unique final signer/claim, global signer/MAP-1 nonce uniqueness,
  exact proposal/challenge consistency guards and atomic nonce/review/audit writes.
- Owner/scoped-agent metadata intake, narrowly assigned verifier reads and fresh
  per-decision NEP-413 authentication using finalized active FullAccess Ed25519 keys.
  Recheck consent, agent, session, role and expiry after RPC; safe errors/rate/CSRF.
- Responsive evidence dashboard with exact permissions, human assertion labels,
  required quorum, local exact-byte hashing, cancellation/retry and focused review.
  Pending/unverifiable/rejected/disputed decisions never masquerade as settled funds.
- Separate owner per-payment signature; terminal application disputes, expired
  record exclusion and disabled-agent/revoked-consent suppression of readiness.
- Non-submitting exact Rust attestation intents and pinned Meteor transaction-shape
  preview. No onchain sender, deployment verifier, transaction or fake receipt.
- Workspace descendant pages now inherit no-referrer, DENY framing and nosniff
  headers. Existing M1–M4 authentication and Rust financial implementation retained.

## Automated evidence — 2026-11-02

| Verification | Actual result |
| --- | --- |
| pnpm check | Lint/typechecks; 76 unit, 13 integration, 13 adversarial tests pass |
| pnpm test:identity-db | 130 real PostgreSQL tests pass; 35 M5 cases, isolated schemas |
| pnpm build | Next.js production build and TypeScript pass |
| pnpm test:e2e | 46 Chromium tests pass, including 8 M5 desktop/mobile-layout cases |
| cargo fmt --all -- --check | Pass |
| cargo clippy --workspace --all-targets --locked -- -D warnings | Pass |
| pnpm test:contract | Wasm build, 33 Rust unit and 6 real local sandbox tests pass |
| pnpm test:wasm | Export allowlist / forbidden admin capability inspection passes |
| pnpm test:workflow | Pinned workflow validation passes |
| pnpm test:secrets | Redacted offline Gitleaks finds no source secrets |
| HTTPS Compose build / migration / startup | Pass; additive migration; existing volume retained |
| pnpm test:containers / test:database / test:smoke | Non-root isolation, DB health and service readiness pass |
| pnpm test:https | CA-verified TLS, HTTPS origin, secure host-only challenge cookie and wrong-origin rejection pass |

Total application/API/SQL: **232 tests**. Browser: **46**. Rust: **33 unit + 6
sandbox**. No skipped test is counted as passing. Database outage returned readiness 503 and liveness 200; recovery smoke/HTTPS
checks passed. Hosted CI is a separate gate and is not implied by local results.
Cryptographic SQL fixtures use synthetic keys and explicitly stub finalized RPC;
existing M1 RPC tests cover active FullAccess/missing/restricted handling. They are
not real wallet/provider verification. Browser fixtures mock API data; cancellation
uses the installed Meteor dialog. Mobile viewport tests are not physical Android.
Sandbox uses ephemeral valueless local accounts, not public testnet funds.

Security cases cover substituted identity/network/signature/challenge/message;
session/Origin/CSRF; restricted/missing/outage key; consent revoked during RPC;
five-minute expiry/replay/concurrent consumes; source digest/recipient/amount/
issuer/reference/event/independence; unavailable/pending/synthetic sources; tenant
and role denial; agent inability to review; final immutable reviews and audit failure
rollback; SQL row immutability; local file/URL/size/type boundaries; distinct quorum
and owner separation. Sandbox adds exact MAP-1 tampering, cross-proposal nonce replay,
terminal dispute and no payment reservation/spending after rejection.

## Findings and corrections

1. Confirmed shared validator gap: swapping the supplied policy while leaving
   proposal/MAP-1 unchanged initially returned true. Added failing regression then
   reused policy preflight before accepting MAP-1. API already separately enforced
   canonical policy/proposal scope; this was a shared-helper defense gap, not an
   observed contract/payment bypass.
2. Readiness initially omitted agent disabled status on reads (writes rejected it).
   Added live agent identity/network/status checks and SQL regression; no prepared
   intent or ready state remains after disable. Original owner role loss is tested.
3. New domain imports typechecked but failed production bundling with .js references
   to TS source. Matched bundler-compatible imports; production build now passes.
4. Initial database run had transient 400 challenge failures, followed by a clean
   rerun; no sensitive payload was logged. Fixtures now use earlier observation
   timestamps and separately test rejection of future observations. Server expiry
   and clock validation were not relaxed. Exact cause of the transient is unproven.
5. Initial browser checks hit Next's separate route-announcer alert as well as the
   app alert. Scoped assertions to main; all 46 pass. No runtime bypass was added.
6. Reviewed lock order and permission rechecks; original-owner membership is acquired
   before consent/agent/evidence locks. Scoped agent intake rechecks credential and
   mandate expiry after metadata work. Audit failure rolls back nonce consumption.

## Manual and independent evidence — explicitly pending

No owner-confirmed M5 desktop/Android wallet or authentic provider observation has
been supplied. Under D017, these are pending integrated M8 tests; do not request
further repetitive standalone desktop/Android walkthroughs before the product is
integrated. Earlier M1/M2 passes do not establish M5 acceptance. Retain
M5_VERIFIER_RUNBOOK for real message approval/cancellation/retry, assigned versus
unassigned accounts, source mismatches, separate owner signature and disputes.
iOS remains deferred. HTTPS host verification does not assert browser trust.
Independent security review remains pending, not represented by this self-review.

B2 cannot prove a human accessed an authenticated provider, prevent lying/collusion,
or prove distinct humans control verifier accounts. SHA-256 proves bytes only.
Compromised designated keys can lie within policy; budgets/quorum/owner approval,
owner revocation and terminal disputes remain essential. DB-admin tampering is
outside append-only triggers and cannot establish onchain authorization.

Final signer/claim decisions cannot be refreshed on the same proposal after the
15-minute MAP-1 expiry (or earlier mandate expiry); create a new proposal/proofs.
256 lifetime challenges / 128 records bound storage; cancellation can exhaust the
challenge budget. No secret reset or override path is provided. A local dispute
cannot cancel a dispatched payment or block the contract until separately submitted.

## Public testnet preparation and delivery gates

M5_MAP1_INTEGRATION documents exact Rust args and pinned SDK shape, plus remaining
verified-deployment/onchain-preflight/wallet-transport/receipt work. No deployed-state
check or transaction signing is claimed implemented. M6 must reconcile actual
finalized receipts and unknown outcomes. Available testnet balance is not consent.
A separate explicit deployment/transaction authorization is required before live
registration, storage/funding, proposal, attestation, owner approval or execution.

No real signing keys/provider credentials were created/exported, no funds spent,
no public deployment, repository visibility change or merge performed. Existing
PostgreSQL data, HTTPS override and development CA are retained. Publish only this
feature branch and a draft PR to staging. Both foundation/rust must be green on its
exact head; consult the PR run evidence rather than treating local tests as hosted CI.


## Hackathon integration acceptance — owner direction D017

Preserve the completed M5 verifier and all automated security gates. Missing real
wallet/source acceptance is a pending M8 integrated obligation, not a blocker to
M5's development integration. PR #9 is eligible subject to required green CI on its
current head and no confirmed blocking defects. No financial or authentication
boundary changes, manual passes or production security approval are implied.

Implementation commit `2a967302f6800311819e3343dd76e418e0bddbd6` passed both required
jobs in [run 41486519563](https://github.com/Ajayfrizzy/avroqen/actions/runs/41486519563).
Documentation updates must be distinguished from that implementation test evidence;
check the latest PR head separately. Final merge still needs owner authorization.
The integrated delivery sequence, M8 manual matrix and temporary RumptyCloud M9
plan are defined in MILESTONES.md and TEST_PLAN.md. No deployment or token movement
is authorized by this acceptance change.
