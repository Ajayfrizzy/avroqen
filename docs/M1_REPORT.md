# M1 — identity, organizations and agent access

**Assessment:** implementation is prepared for draft GitHub review; final M1 acceptance is
not claimed. Automated checks below pass. Human real-wallet desktop/mobile
compatibility and independent security review remain outstanding. Hosted CI must
pass on the final PR head; evidence is tracked below and in the PR checks.
**Branch:** `feat/m1-identity-access`; owner authorized push and a draft PR to `staging`.
**Baseline:** M0 merge `84ffd209d767660d0cae5c369aa2aa52a54148e8`.
**Verification date:** November 1, 2026, after the official UTC start.

## Preparation and approved design

Fetched origin and fast-forwarded staging (already up to date); verified the exact
M0 merge is an ancestor before creating the feature branch. Preparation commit:
`08dc8154f5207e5e998190a5b746b81238b25349`. Read repository instructions, organizer
rules, all seven persistent project skills and canonical specifications.

Owner explicitly approved “full-access-key verification (recommended).” D012 and
M1_DESIGN.md record the approved NEP-413 policy, rejected restricted-key alternative,
trust assumptions and connector choice. No unresolved authority decision was
silently implemented. App roles/sessions never substitute for wallet-signed
onchain actions. Contract/worker/verifier authority remains unchanged.

## Implementation inventory

| Component | Implementation |
| --- | --- |
| Wallet authentication | Server-issued 32-byte nonce, exact account/network/origin/recipient/expiry message, 5-minute expiry, browser-binding HttpOnly cookie; NEP-413 Borsh/SHA-256/Ed25519 verification; finalized active FullAccess key lookup on fixed network RPC |
| Replay and concurrency | Conditional PostgreSQL nonce consumption and session insertion in one transaction; unique challenge/session binding; concurrent submissions have one winner |
| Sessions | Opaque random 256-bit session token; hashes only in DB; 15-minute absolute expiry; prior-session rotation, server-side logout; Secure/HttpOnly/SameSite=Strict/__Host- cookies on HTTPS; explicit loopback-only HTTP exception |
| Request protection | Exact Origin on mutations, session-bound CSRF, strict shared Zod schemas, body limits, bounded list pagination, sanitized errors, no wildcard CORS or trusted forwarded IP headers |
| Database | Checksummed transactional migrations with advisory lock; organizations, memberships, agents, challenges, sessions, security audit and atomic rate-limit records; network/account/role/FK constraints |
| Organization access | Verified identity creates an app-owner membership; every org operation checks active account/network membership; owner/admin write, member/viewer read; no role-escalation endpoint |
| Agent records | Register/list/disable scoped by org and network; idempotent disabling; registration creates no credential, execution tool, treasury access, owner rights or verifier/settlement authority |
| Mutation races | Session and membership row locks serialize mutations against logout/membership changes; mutations and success audit records commit together |
| Logging/rate limits | Fixed event/reason codes and public identifiers only; DB atomic per-peer limits, 30 writes/120 reads per minute; first exceeded request records a rate-limit audit, further excess requests do not amplify audit storage |
| Frontend | Responsive `/workspace`: wallet message prompt, auth/session/logout, org creation/selection, paginated agents, registration/disabling, loading/error/empty/read-only/session-expired states; original M0 landing preserved |
| Wallet adapter | Pinned Meteor SDK message-only action, exact server payload, no access-key/transaction options, in-memory metadata, disabled logging/mobile bridge, rejecting private-key-store provider |
| Development/CI | Explicit Compose migration service before API, schema-aware readiness, same-origin Next API proxy, frozen lockfile installs, real PostgreSQL suite added to existing CI |

Neither the backend nor UI implements custody, deposits, settlement, transfers,
privileged agent execution, owner key import or a verifier credential flow.
Disabling an app record does not claim to revoke any onchain permission.

## Actual verification evidence

Final local runs completed with exit code 0 unless a limitation is explicitly noted.

| Command/check | Result |
| --- | --- |
| `pnpm check` | Lint, TypeScript, 19 unit + 4 integration + 13 adversarial tests pass; all original M0 tests retained |
| `pnpm test:identity-db` | 14 tests pass against real local PostgreSQL in isolated temporary schemas |
| `pnpm build` | Next production build (`/`, `/workspace`) and TypeScript pass |
| `pnpm test:e2e` | 6 Chromium tests pass, including M0 and mobile M1, service errors, org/agent lifecycle, viewer denial, loading/session expiry |
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Pass |
| `cargo test --workspace --locked` | 1 scaffold test passes |
| `pnpm build:contract` / `pnpm test:wasm` | Pass; existing disabled-payment view and absence of transfer/upgrade imports verified; simulated host, not chain execution |
| `pnpm test:workflow` | Local workflow validation passes |
| `pnpm test:secrets` | Redacted Gitleaks source scan: no leaks; includes untracked source, excludes ignored `.env` |
| `docker compose up --build -d --wait` | Frozen install, web/API builds, explicit migration and health checks pass |
| `pnpm test:containers` / `pnpm test:database` / `pnpm test:smoke` | Non-root isolation, actual PostgreSQL connection, web/API/readiness smoke pass |
| Same-origin container proxy | `/api/auth/config` through web returns configured testnet network |
| Database outage/recovery | Readiness returns unavailable while liveness stays healthy; recovery restores smoke; migrations rerun idempotently |
| `git diff --check` | Pass; generated output, local credentials and dependency install directories excluded |

PostgreSQL coverage: migration concurrency/checksum tampering; invalid stored
roles/accounts/network bindings; real Ed25519 signatures over independently
Borsh-encoded challenges; forged/different key, replay, expiry, account/network/
browser substitution; altered message/recipient/nonce/callback; six concurrent
nonce submissions with one winner; restricted/revoked key and RPC-outage boundary;
session rotation/expiry/logout; missing/mismatched CSRF and Origin; unauthorized,
cross-org, disabled memberships, all four roles, role/owner field injection;
agent registration and scoped/idempotent disabling; rate-limit audit redaction.

Unit tests additionally verify exact finalized RPC request construction, fixed
network endpoint, missing access keys, restricted permissions, malformed/mismatched
RPC envelopes, transport timeout/outage, HTTPS configuration and independent Borsh
encoding with both optional-callback encodings. Connector integration tests assert
only the message-signing action, exact binding, refusal of key custody and wallet
cancellation propagation.

### Evidence limits and resolved verification issues

- Tests generate ephemeral unfunded Ed25519 fixtures. Real signature cryptography
  and PostgreSQL transactions run; finalized RPC permissions are simulated.
- Browser tests explicitly simulate API/session responses. Connector tests replace
  the SDK loading boundary. Neither claims a live human wallet signature or real
  chain receipt. No blockchain transactions were performed.
- Initial connector-test module mocking did not intercept the SDK and failed in
  Node (`window is not defined`). A dedicated lazy-loader boundary made the mock
  explicit; both connector tests now pass.
- Three initial browser assertions matched both the app alert and Next's route
  announcer. Scoping assertions to the application main region fixed the tests;
  all six now pass. No acceptance assertion was removed.
- Initial type/lint errors (key-store return type and effect dependencies) were
  fixed. Dependency peer warnings were resolved by pinning React Query 5.101.2.
- Workflow checking initially hit sandbox Docker permissions; rerunning with
  authorized Docker access passed. No failed gate is waived.

## Outstanding review gates and operational risks

1. Human wallet compatibility: validate message-only login/cancel with an actual
   full-access Ed25519 wallet on desktop and mobile, including popup behavior.
   No transaction is required. Native mobile bridge is intentionally disabled;
   the responsive UI/browser tests do not establish native-wallet compatibility.
2. Hosted GitHub Actions must pass on the draft PR head; consult the PR checks
   for authoritative results (local evidence is not hosted CI evidence). Independent
   security review and required branch checks remain needed before acceptance.
   Push/draft PR are authorized; merge, deployment and visibility changes are not.
3. Finalized RPC remains a trusted identity-state source. Revoked keys may retain
   an existing application session until its maximum 15-minute expiry. App sessions
   cannot exercise financial authority. Multi-provider/light-client verification
   would be a separate reviewed design improvement.
4. Development rate limits share the Next proxy peer IP. This fails conservatively
   but permits denial of service between users; review ingress/IP attribution and
   multi-tenant abuse controls before deployment. Do not simply trust X-Forwarded-For.
5. Expired challenge/session/rate data and audit retention need an explicit
   operational cleanup/retention policy before public service. Development DB
   bootstrap privileges are not a production least-privilege deployment design.
6. Connector dependencies include capabilities the application never invokes;
   private-key-store rejection and message-only calls reduce exposure but do not
   constitute a dependency audit. Production CSP/ingress review remains necessary.
7. Financial S01–S20 and real sandbox/testnet settlement are later milestones; the
   unchanged M0 contract tests are not evidence of custody/settlement correctness.

## Next steps

Review D012, identity routes, migration constraints and negative-test evidence.
Perform the human wallet compatibility check; address any failures without
substituting transactions or restricted keys. The owner authorized push and a draft PR against staging;
inspect hosted CI on the final PR head. Do not merge/deploy until review gates
pass. M2 wallet-signed mandate consent remains separate from application login.


## Pre-PR security review of 4a1b15a (2026-11-01)

Reviewed all 34 changed paths against staging, canonical security boundaries and
all seven project skills. No financial implementation, tracked environment secret,
generated build output or node_modules was added. Direct dependencies and lockfile
are intentional; install scripts remain disabled. No non-registry tarball/git/file
resolutions were added. Secret scanning includes the reviewable untracked tree.

Found and fixed an origin-configuration-change defect: a still-valid challenge
signed for a prior configured origin could authenticate after the origin changed;
existing sessions also lacked current-origin revalidation. A regression first
failed (HTTP 200 instead of 401). Verification now rejects a stored recipient that
differs from current PUBLIC_ORIGIN or a nonempty callback; session lookup requires
a challenge for the current origin and absent callback. The test now passes and
confirms no nonce consumption. This tightens the approved binding, not authority.

Final local review suite: 50 TypeScript/API/database tests (19 unit, 4 integration,
13 adversarial, 14 PostgreSQL), 6 browser tests, Rust format/Clippy/test, Wasm,
production builds, workflow validation, secret scan, container isolation and
PostgreSQL/outage checks. Results remain distinct from manual wallet evidence.

## Exact manual wallet acceptance checklist (not yet executed)

Use existing unfunded/testnet identities in a human-controlled wallet; never paste
private keys into the app, logs, report or test runner. Record browser/OS, wallet
version, network, public account/key, UTC time and pass/fail only. Do not retain
cookies, CSRF tokens or reusable proof material in review artifacts. No account
creation, AddKey/DeleteKey, transaction signing or funding is required/authorized.

1. **Desktop success:** open the configured origin `/workspace`; enter an existing
   testnet account with active full-access Ed25519 key. Confirm the popup shows
   message signing only, correct account, testnet, exact origin/recipient, unique
   challenge and expiry. Sign; expect the same account/network in the session,
   organization access, and no transaction/access-key approval prompt.
2. **Cancel / blocked popup:** cancel the message and separately block the popup.
   Expect no new authenticated session or success notice; allow popup and retry
   with a fresh challenge. Record the actual wallet error and recovery UX.
3. **Account substitution:** request a challenge for account A but choose account B
   in the wallet. Expect denial and no session for either new proof.
4. **Network substitution:** while app is configured for testnet, select a mainnet
   identity/network in the wallet. Expect wallet refusal or API rejection, never
   a testnet session authorized using mainnet-only key state. Do not transact.
5. **Restricted / missing key:** with a pre-existing function-call-only key fixture,
   expect wallet refusal to sign or API 401 if a proof can be produced. A key absent
   from finalized account state must also fail. If no such fixture is available,
   mark this manual case pending; automated cases already cover both. Do not add,
   remove or import keys to satisfy this checklist without separate approval.
6. **Challenge expiry:** leave a fresh prompt open beyond five minutes, then sign.
   Expect rejection and a fresh-login requirement, not an issued session.
7. **Replay / browser binding:** using browser devtools locally, resend a successful
   verification once; expect 401, no second session. Repeat a pending proof in a
   separate browser context without its preauthentication cookie; expect rejection.
8. **Logout / expiry:** sign in, logout and refresh; session endpoint must return
   401. Sign in again, wait beyond 15 minutes without refreshing the session's age;
   UI and privileged mutation must require login again. Check HttpOnly/SameSite and
   Secure/__Host- attributes on an owner-provided HTTPS development origin.
9. **Mobile:** repeat success, cancellation, popup recovery, logout and organization/
   agent workflows on actual iOS Safari and Android Chrome using an owner-provided
   HTTPS development origin reachable by the device. Check wallet return behavior,
   readability and no horizontal overflow. Native bridge remains disabled; record
   unsupported wallet/browser combinations as blockers, not passed simulations.
10. **App-only agent disable:** create an org and agent record, disable it and reload;
    it stays disabled. Confirm UI claims no onchain revocation and requests no wallet
    transaction. Verify a second wallet cannot access that org without membership.

Independent security review must separately assess protocol binding, cryptography,
RPC trust, session/CSRF and tenant access code, SDK dependency exposure, and the
operational limitations above. This agent's review is not independent assurance.


## Hosted review evidence

Draft PR: https://github.com/Ajayfrizzy/avroqen/pull/5 (base `staging`).
Implementation/security-fix head `15b7bdda54ccd610d82d6c4889a2d4890ef5f5b9`
passed both hosted jobs: `foundation` (2m53s), `rust` (3m18s).
Run: https://github.com/Ajayfrizzy/avroqen/actions/runs/41270940708 .
This evidence entry is a documentation-only follow-up; consult PR checks for its
final head rather than assuming a previous SHA's result applies automatically.
The branch-history Gitleaks scan also covered all three implementation commits
and found no leaks. No merge, deployment, financial transaction or visibility
change occurred. Hosted automation does not satisfy the manual checklist or
independent-security-review gate.
