# M1 — identity, organizations and agent access

**Assessment:** implementation is ready for local review; final M1 acceptance is
not claimed. Automated checks below pass. Human real-wallet desktop/mobile
compatibility, independent security review and hosted CI remain outstanding.
**Branch:** `feat/m1-identity-access`, local only.
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
| `pnpm test:identity-db` | 13 tests pass against real local PostgreSQL in isolated temporary schemas |
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
2. Hosted GitHub Actions has not run for M1 because work remains local. Independent
   security review and required branch checks are still needed before acceptance.
   No PR, push, merge, deployment or visibility change was performed.
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
substituting transactions or restricted keys. After owner review authorizes push,
run hosted CI and open a PR against staging. Do not merge/deploy until review gates
pass. M2 wallet-signed mandate consent remains separate from application login.
