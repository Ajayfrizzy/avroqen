# M2 — typed mandates, wallet consent and revocation

Status: implementation and local verification complete for draft review, with
real-wallet M2 acceptance still pending. This is offchain preparation, not deployed
MandateVault authority, financial execution or independent security approval.

Branch: `feat/m2-typed-mandates`. Baseline: M1 PR #5 merge
`6c2c7431949945ddcb547fcd69a4cbe208b656b5`. Preparation commit:
`6bb25fb9edb7f8e062044a88da1ad34a8b863677`. Date: November 1, 2026.

## Owner decisions and authority boundary

All three requested decisions were explicitly approved: offchain-only NEP-413
approval/revocation, explicit verifier quorum/claims, and per-claim quorum with
distinct owner approval. D013 and M2_DESIGN record the exact policy. No unresolved
M2 signing-policy choice remains. O02 is resolved for this representation; M5
must still implement and test the actual attestation/evidence semantics.

Every approval/revocation requires a fresh signature plus finalized active
FullAccess Ed25519 key lookup, bound to the original owner, organization, network,
intended vault, mandate ID/version, exact immutable policy, action, origin, random
nonce, five-minute challenge and initiating session. Restricted keys are rejected.
The intended vault is explicitly entered and unverified. `onchainStatus` is always
NOT_SUBMITTED; no contract call, receipt, funds movement or active vault is claimed.
M3 must obtain a new owner-signed onchain authorization and enforce the exact policy.

## Implementation inventory

| Component | Implemented evidence |
| --- | --- |
| Shared domain | Strict v1 draft/policy/action schemas in packages/domain; fixed schema-order canonical JSON and sorted unique verifier/claim sets; SHA-256 snapshot identity; exact decimal/BigInt NEAR conversion |
| Limits | Positive u128 atomic strings; u64 nanosecond expiration; u32 execution cap; per-payment cap <= total cap; unknown fields/owner injection rejected |
| Policy versioning | Independent new UUID, schemaVersion=1 and policyVersion=1; no mutable revisions. Changed terms require another mandate and fresh consent. Future lineage/version protocols are not silently implemented |
| Persistence | Migration 002 adds policies, consent state, session-bound challenges and mandate audit events; scoped org/network/agent FKs; UPDATE/DELETE guards on policy/events; terminal lifecycle guard |
| Backend | M1 plugin reuses existing Origin/CSRF/session/membership/rate/error helpers; owner-only draft creation and original-wallet approval/revocation; scoped list/detail; no custody routes |
| Consent | Complete canonical policy in NEP-413 message; cryptographic verification before RPC and repeated state verification afterward; lock order session/membership/consent/agent; nonce consumption, transition and audit in one transaction |
| Revocation | Fresh wallet signature, terminal offchain status; allowed after expiry or agent disable; no onchain revocation or cancellation of dispatched transfers claimed |
| Audit/privacy | Append-only ordinary mutation guards, fixed events, account/key/digest metadata; no retained raw signatures, tokens or proof payloads in events/logs/reports. Private challenges retain only verification input as required |
| UI | /workspace/mandates linked from selected organization; responsive create/review/approve/revoke workflow, readable NEAR plus atomic limits, UTC expiration, exact identifiers, quorum/claim explanations, immutable/offchain warnings |
| UI safety | Review checkbox, fresh exact-message comparison before wallet prompt, account check, cancellation/retry, expiry/disabled/read-only states, stale-response guards and denied-load control suppression/retry |
| Existing architecture | No new dependency or lockfile change; no Rust financial code, worker executor, verifier signer, alternate payment adapter or M1 auth-policy change |

## Actual local verification

| Gate | Result |
| --- | --- |
| `pnpm check` | PASS: lint, root/web TypeScript, 37 unit + 13 integration + 13 adversarial tests |
| `pnpm test:identity-db` | PASS: 54 real PostgreSQL tests (22 M1 identity, 4 migration, 28 M2) |
| `pnpm build` | PASS: production Next build and repository TypeScript; /workspace/mandates generated |
| `pnpm test:e2e` | PASS: 15 Chromium tests (8 existing, 7 new M2) |
| `cargo fmt --all -- --check` | PASS |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | PASS |
| `cargo test --workspace --locked` | PASS: 1 disabled scaffold test, zero financial contract coverage claimed |
| `pnpm build:contract`, `pnpm test:wasm` | PASS: existing disabled Wasm views only; no transfer/upgrade host calls |
| `pnpm test:workflow`, `pnpm test:secrets` | PASS: pinned CI policy, no leaks found |

Total: **117 TypeScript/API/database tests + 15 browser tests + 1 Rust test**.
Container/bootstrap/live HTTPS verification is recorded in the final delivery
addendum below after execution. Hosted CI must run on the pushed head; local
results are not presented as hosted results. PR checks identify the exact commit.

### Behaviors proved with bounded automated evidence

- Decimal validation rejects exponent notation, signs, leading zeros, fractional
  atomics, zero budgets, overflow, per-payment > total, invalid quorum and extra
  owner fields. 24-decimal NEAR conversion retains one-yoctoNEAR precision.
- Independent Borsh-generated real Ed25519 signatures exercise real SQL routes.
  Wrong account/network/action/key/signature/challenge and swapped mandate reject.
  Altered recipient, vault, owner, budget and threshold messages reject.
- Session substitution (even same wallet), wrong Origin/CSRF, expired challenge,
  expired policy, logout/session expiry/role/agent changes during RPC reject.
- Same-nonce and distinct-challenge concurrent approvals permit one winner only;
  approval/revocation race always ends terminally revoked. Revocation remains
  available after expiry and agent disable. Replays never create another event.
- Another tenant/admin/another org owner cannot approve or revoke the original
  owner's mandate. Live role membership is checked server-side, not trusted UI.
- Policy mutation after approval and audit UPDATE/DELETE fail. Draft audit failure
  leaves no policy; approval audit failure rolls back nonce, state and event, then
  permits recovery retry. Database administrator bypass is not prevented or claimed.
- SDK dialog cancellation invokes its actual installed close handler with synthetic
  API data: no verification call; retry obtains a new challenge. The exact full
  signed M2 message is compared to reviewed terms before opening the wallet.
- Browser tests use explicit API fixtures; they do not claim a live Meteor M2
  approval or revocation. Missing/restricted key rejection uses the injected key
  result; existing M1 tests cover the actual finalized RPC response parser.

### Failures discovered and resolved during development

1. Invalid decimal strings reached a BigInt refinement and threw. Guard decimal
   syntax before conversion; invalid input now returns schema rejection. Unit
   regressions pass without weakening precision/overflow checks.
2. A deterministic lock-wait test demonstrated an expired session returning 200
   after the final consent transaction waited on its row lock. Recheck the session
   after locks and signature checks, before challenge consumption. Also recheck
   mandate expiry after waiting on the agent lock. The regression now returns 401
   and leaves DRAFT unchanged. This is bounded evidence, not all-interleaving proof.
3. Two new browser assertions accidentally selected Next's route announcer as well
   as the actual alert. Scope assertions to main; all browser tests pass. Denied
   organization loads now hide action controls and offer retry.
4. Initial DB/TLS/workflow invocations hit sandbox socket/Docker restrictions;
   reran with local service access. These were environment failures, not passed
   tests or waived security gates. The initial lock observer lacked its test
   application_name; fixed that observer before reproducing the actual race.

## Manual M2 acceptance — NOT RUN

M1 desktop/Android results do not establish M2 long-message compatibility. Use an
existing unfunded testnet wallet and the existing private HTTPS setup; never
provide private keys, create access keys, request funds or export authentication
payloads. iOS remains deferred by owner instruction.

1. Start local stack with `docker compose -f compose.yaml -f compose.https.yaml up
   --build -d --wait`. If the local HTTPS proxy is not already running, use
   `pnpm dev:https` in another terminal. Follow M1_ANDROID_HTTPS.md for existing
   CA trust and USB reverse, without public tunnels or certificate bypasses.
2. Open `https://127.0.0.1:8443/workspace`, sign in on testnet, select an owned org
   and follow **Create and review typed mandates**. The direct URL is
   `https://127.0.0.1:8443/workspace/mandates`.
3. Create a draft using an active registered agent, an explicitly chosen intended
   testnet vault identifier (not an assertion it exists), exact recipient, small
   NEAR limits, future UTC expiry, execution cap, existing verifier identities and
   required claims. No account creation or contract deployment is needed.
4. Confirm readable and exact atomic values, owner/network/vault/recipient, policy
   ID/version, per-claim quorum and separate owner-approval requirement. Verify
   DRAFT and NOT_SUBMITTED before signing.
5. Select the review checkbox; cancel the wallet prompt. Expect neutral consent
   cancellation and unchanged draft. Retry; inspect the ENTIRE message and approve
   only the offchain NEP-413 message, never a transaction/AddKey request. Expect
   CONSENT_APPROVED_OFFCHAIN and NOT_SUBMITTED after refresh/login.
6. Request revocation, read the onchain limitation, cancel once, then retry and
   sign the revocation message. Expect CONSENT_REVOKED_OFFCHAIN after refresh;
   no new approval option. Confirm no transaction hash/success is fabricated.
7. Use an existing second wallet to check absent/denied foreign org policies.
   Inspect only visible results/status codes; do not copy cookies, CSRF tokens,
   nonces, signatures, HAR files or full request bodies into evidence.
8. Record device/browser/wallet versions, UTC time, action, visible status and
   non-sensitive failure code. Long-message truncation or mobile popup problems
   are failures/pending compatibility issues, not permission to sign opaque hashes
   only, omit policy fields, weaken key checks or create wallet keys.

## Remaining risks and acceptance limits

- Fresh RPC checks trust the configured finalized RPC service. Key revocation
  between RPC response and SQL commit is not eliminated; no onchain authority is
  derived from this offchain record. Session/CSRF and M1 residuals remain explicit.
- Policies/events are guarded against ordinary UPDATE/DELETE, not a privileged
  database administrator, TRUNCATE or schema changes. Raw signatures are not
  archived: these are verification records, not portable proof certificates.
- Permission requires live org-owner membership and the original wallet. Loss of
  that membership blocks further M2 changes; it never cancels an onchain mandate
  or prevents the wallet's independent future onchain revocation rights.
- Detail returns up to 100 oldest events; full audit export and retention/cleanup,
  shared proxy rate budgets, production ingress/CSP/DB least privilege and broader
  SDK review remain operational work, not a claim of production readiness.
- Independent security review is not performed or represented by self-review.
  M2 real-wallet acceptance remains pending, including full-message readability
  on desktop/Android. iOS deferred. No real funds or chain receipts are applicable.
- S01–S20 financial scenarios, attestation verification, actual budget accounting,
  onchain permission/revocation and settlement require M3+; none are passed by M2.

## Delivery boundary

Commit the reviewed implementation on the M2 feature branch and open a draft PR
against staging. Do not merge or change main/staging directly, deploy, transact,
provision privileged wallet keys, change visibility or incur personal costs.
All canonical financial/security invariants remain in force for subsequent work.

## Final local delivery addendum

- `docker compose -f compose.yaml -f compose.https.yaml config --quiet`: PASS.
- Clean image rebuild/bootstrap: PASS, frozen dependency installation with scripts
  disabled, production web build, migration 002 applied and web/API/database healthy.
- `pnpm test:containers`, `pnpm test:database`, `pnpm test:smoke`,
  `pnpm test:https`: PASS. Non-root images exclude local credentials/Git/TLS
  material. Host CA-verified TLS checks challenge-cookie attributes and origin
  denial; no human M2 wallet session is fabricated by this check.
- Controlled database stop plus `node scripts/check-outage.mjs`: PASS (unavailable
  readiness, live process). Restored stack healthy; smoke and HTTPS passed again.
  Existing database volume and owner records were preserved.
- Final lint/whitespace review and redacted secret scan: PASS, no leaks found.
  Reviewed tracked/untracked source; no env/TLS material, generated artifacts,
  dependency directories, Rust or dependency-lock changes included.
- Hosted checks are to run on the implementation commit in the draft PR. This
  local addendum predates that run; the PR check URLs provide its exact-head result.
