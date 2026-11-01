# M1 — identity, organizations and agent access

**Assessment:** prepared for continued draft review; final M1 acceptance is not
claimed. The owner confirmed desktop Meteor testnet login, organization/agent
persistence, logout UI, sign-in recovery, cancellation messaging and successful
retry. Android/iOS, trusted HTTPS/Secure-cookie behavior, second-wallet manual
isolation and independent security review remain outstanding. See **Current review
verification** below for the latest results. Earlier dated sections are historical
investigation evidence; their NOT RUN/local-only statements are superseded only
where explicitly confirmed in the current section.
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

## Real-wallet acceptance preparation — 2026-11-01

Source tested: `1026b0b5e9e7f2a4e3766ce9bec104a262d6838e`.
Local guide: [M1_WALLET_ACCEPTANCE.md](M1_WALLET_ACCEPTANCE.md), including exact
startup/USB commands, expected outcomes, prerequisite matrix and evidence template.
Preparation documentation is kept local; no application code/configuration changed.
Existing ignored `.env` was preserved. PR #5 was read back as OPEN, draft,
`mergedAt=null`, at the source SHA above; no merge or deployment was performed.

### Automated rerun results (separate from manual acceptance)

| Check executed for this preparation | Actual result |
| --- | --- |
| `CI=true pnpm install --frozen-lockfile --ignore-scripts` | Passed; lockfile unchanged, dependencies up to date |
| `pnpm check` | Passed: lint, typechecks, 19 unit + 4 integration + 13 adversarial tests |
| `pnpm test:identity-db` | 14 real PostgreSQL tests passed; temporary schemas cleaned up |
| `pnpm build` | Next production build and TypeScript passed |
| `pnpm test:e2e` | 6 browser tests passed; includes explicit API/wallet boundary simulations |
| Rust format / Clippy / `cargo test --workspace --locked` | Passed; 1 scaffold unit test |
| `pnpm build:contract` / `pnpm test:wasm` | Passed; disabled scaffold, not a settlement test |
| `docker compose up --build -d --wait` | Frozen container build/migration/health checks passed |
| `pnpm test:database`, `pnpm test:containers`, `pnpm test:smoke` | Passed |
| Database stop + `node scripts/check-outage.mjs` + restore + smoke | Passed; readiness fails closed, liveness stays healthy, recovery succeeds |
| `pnpm test:workflow` | Passed |
| Live browser, no intercepted API and no wallet interaction | `/workspace` sign-in button enabled, real config testnet/exact loopback origin, unauthenticated session HTTP 401, no page errors |
| Public RPC read-only `status` from host and running API container | Both reachable; `chain_id=testnet`. Does not verify any human account/key |

`pnpm test:secrets` passed after writing the preparation records (Gitleaks: no
leaks); `git diff --check` passed.
No owner, verifier or agent wallet keys were requested or created. Ephemeral
cryptographic fixtures in automated tests do not add any onchain access key.
Financial S01–S20/sandbox settlement tests remain out of M1 scope, not passed.

### Human test readiness and manual results

Desktop environment is running and ready at
**http://127.0.0.1:3000/workspace**. API/web/database remain healthy and bound only
to host loopback. A human can now attempt message-only login with an existing,
unfunded compatible NEAR testnet wallet. Actual wallet compatibility is unverified.

- **All human wallet cases: NOT RUN.** No login signature, popup interaction,
  wallet-controlled account proof, real-wallet session or human agent workflow was
  performed. Automated results above cannot be used as manual pass marks.
- **Android: BLOCKED on device connection.** `adb` is installed but no Android
  device was connected. The guide uses USB `adb -d reverse tcp:3000 tcp:3000` and
  the same loopback URL; forwarding and device/browser behavior are unverified.
- **HTTPS: BLOCKED on local trusted HTTPS setup.** USB loopback can test the existing
  HTTP development exception; it does not replace the prior HTTPS acceptance
  checklist or establish Secure/__Host- cookie behavior. No trusted local HTTPS
  endpoint or certificate/device trust was configured.
- **Second-wallet/other-network/restricted-key tests: NOT RUN.** Existing fixtures
  have not been confirmed. The guide never asks to create/import/remove wallet keys
  or fund accounts just to complete a test.
- **Independent security review: NOT RUN.** This preparation is not independent
  assurance and does not establish final M1 acceptance.

Evidence should contain only case IDs, device/browser/wallet versions, source SHA,
UTC times, origin/network, sanitized status/error codes and inspected/cropped UI
images. Do not export session/CSRF cookies, proof signatures, HARs, raw console
output, seed phrases, private keys or `.env`. See the guide for the manual ledger.

## Real-wallet login failure investigation — 2026-11-01

**Manual observation (user report, before this fix):** an existing testnet account
opened Meteor account connection and NEP-413 Sign Message screens at
`http://127.0.0.1:3000/workspace`, then Avroqen displayed its generic request error.
Desktop login is therefore **FAILED before fix; human retest pending**, superseding
the earlier NOT RUN status for W01. No post-fix human signature has been observed.

### Sanitized findings and precise failing boundary

- Running API logs were read through an allowlist, never dumped. The only database
  unavailable event was at `04:12:30Z`, during the earlier deliberate outage check;
  the later wallet failures did not produce an RPC/server error log. Fastify body
  logging is disabled, so historical proof bodies are not available and were not
  requested or reconstructed from user secrets.
- PostgreSQL audit aggregates contained three `challenge_created / CHALLENGE_ISSUED`
  events and three `login_denied / INVALID_REQUEST` events. Latest challenge was
  `04:39:59Z`; latest invalid request was `04:40:24Z`. All three challenges used
  testnet, the exact loopback origin and an absent callback; none was consumed.
  There were zero sessions. They had expired by inspection time.
- `INVALID_REQUEST` maps to HTTP 400 in the API. Reproducing SDK-native response
  JSON through `/api/auth/verify` yielded **400 / INVALID_REQUEST**, before the
  cryptographic verifier, finalized key lookup or nonce-consumption transaction.
- Installed Meteor SDK 3.24.1's `MeteorConnectV1Client` does not return wire strings:
  it hydrates `signedMessage.publicKey` with `PublicKey.fromString(...)` and
  `signedMessage.signature` with `Buffer.from(..., "base64")`. Its other supported
  internal path similarly uses a PublicKey object and Uint8Array. `accountId` is a
  string. The frontend previously JSON-serialized those objects directly; backend
  strict validation correctly requires publicKey/signature strings. Previous
  connector mocks incorrectly supplied strings and hid this defect.
- Read-only finalized `view_access_key_list` and `view_access_key` queries from the
  running API container, using the latest challenged account internally, returned
  HTTP 200. One active full-access Ed25519 key was present; the individual query
  returned id `m1-key` and permission `FullAccess`. Only statuses/counts/booleans
  were output. This proves RPC availability and that key's permission at inspection,
  not that an uncaptured historical wallet response selected that same key.

The confirmed defect is **frontend serialization of the SDK response**, consistent
with the observed audit trail and reproduced HTTP error. It is not a reason to
accept object-shaped proofs, alternate encodings or restricted keys in the API.
No actual user signature, nonce, session cookie, private key or sensitive request
body was printed, written to diagnostics, or added to a fixture.

### Fix and security boundaries

`apps/web/app/workspace/wallet-proof.ts` explicitly normalizes the pinned SDK shape:
valid account string, PublicKey object's canonical `ed25519:<base58>` text, and
64 signature bytes encoded as standard padded base64. Both Uint8Array and Buffer
are accepted as byte arrays; arbitrary arrays, malformed key objects, other key
types, wrong lengths and unexpected pre-encoded strings are rejected. Untrusted
exception text is replaced by a fixed error. `signChallenge` returns only these
three JSON string fields. No proof bytes are logged or persisted by the adapter.

Backend input validation, NEP-413 Borsh/tag/SHA-256/Ed25519 verification, exact origin/
network/account binding, finalized FullAccess lookup, atomic nonce consumption,
session/CSRF rules, tenant checks and authority boundaries are unchanged. No
migration or data reset is needed. Existing expired challenges must not be reused.

### Regression and verification evidence

- First changed the connector fixture to match the SDK's object/byte return shape.
  It failed as expected: `typeof publicKey` was `object`, expected `string`.
  Only type labels were output; no proof data appeared in the failure.
- Corrected fixture now checks normalization, exact byte preservation for both
  Uint8Array and Buffer, malformed-output rejection and cancellation propagation.
- A real-PostgreSQL/API regression first sends native-object JSON and asserts HTTP
  400 / INVALID_REQUEST, then submits the normalized independently signed Ed25519
  proof. Disallowed-key and bit-flipped-signature attempts return 401; the valid
  normalized proof returns 200; replay returns 401. All use ephemeral test fixtures
  in isolated schemas, not the human wallet or application session database.
- `pnpm check` passed: lint/typechecks, 19 unit, 5 integration, 13 adversarial tests.
- `pnpm test:identity-db` passed: 15 PostgreSQL tests (52 TypeScript/API/DB total).
- `pnpm build` passed. Browser and local-container checks are recorded after the
  rebuilt frontend is ready below. Rust/contract behavior was not changed.

The fix and this report remain local for human retest. PR #5 remains unmerged;
no transaction, access-key creation, public deployment or funding was performed.
For the human retry: hard-refresh the rebuilt `/workspace`, use a fresh challenge
with the same existing testnet wallet, and sign only the login message. Expected:
verification succeeds and the app displays the account/testnet session. If it
fails, share only the `/api/auth/verify` HTTP status and fixed `error` code, not
request data, headers, proof, cookie values or HAR files. Desktop completion,
logout, actual Android behavior and the remaining acceptance cases still require
human verification; the automated regression is not a real-wallet pass.

Post-fix local completion: `pnpm test:e2e` passed all 6 browser tests. Rebuilt only
the local `web` container with the normalization fix; it is healthy. `pnpm test:smoke`,
`pnpm test:containers` and `pnpm test:database` passed against the running services.
`pnpm test:secrets` found no leaks and `git diff --check` passed. Database records
were preserved, backend security code was unchanged, and no user proof was replayed.
Human retry URL remains **http://127.0.0.1:3000/workspace**; hard-refresh first to
load the rebuilt client, then request a new challenge. Changes are uncommitted and
not pushed; the existing PR's hosted CI does not cover this local fix yet.

## Field-level diagnosis and successful human retry — 2026-11-01

The follow-up reproduction reported another `INVALID_REQUEST`. Audit state showed
four invalid-request events, latest `04:52:06Z`, including one after the earlier
fix was prepared. The running web image contained normalization. That observation
alone could not establish whether the browser loaded the corrected client or
which field the historical request contained; no historical payload was retained.
A stale client was a hypothesis, not a proven second root cause.

Added a narrowly scoped parser around the unchanged `verifyInput` schema. On
verification schema rejection only, the API returns/logs fixed event
`AUTH_VERIFY_SCHEMA_REJECTED` with allowlisted `field` and `category` pairs.
Allowed fields are accountId, network, challengeId, publicKey, signature and the
fixed fallback request. Categories are TYPE, FORMAT, LENGTH and UNKNOWN_FIELDS.
No values, raw Zod messages, unknown input property names, nested paths, request
bodies, signatures, nonces, cookies or session tokens enter these diagnostics.
The response remains HTTP 400 / INVALID_REQUEST. Successful schema parsing still
runs every existing cryptographic, binding, nonce, RPC and session check.

Reproducing the installed connector's PublicKey-object and binary-signature format
identified **publicKey / TYPE** and **signature / TYPE**. The serialized string
format passes the exact schema, including account ID, testnet network and UUID
challenge mapping. PublicKey.toString() emits canonical curve-prefixed base58;
64 signature bytes become standard padded base64. No alternate encodings or
backend coercions were introduced. Wrong-shape tests return 400; correctly shaped
but tampered/restricted-key/replayed proofs return 401. These are distinct stages.

After the diagnostic API was ready, the user was asked to retry in their current
Chrome tab and replied **“Retried; login succeeded.”** The real database then
contained `login_succeeded / WALLET_VERIFIED` at `04:57:08.569Z`, with one total and
one active session. Invalid-request count remained four. This confirms a real
successful Meteor testnet login through the current full verification/session
path. No new schema rejection occurred, so no claim is made that field-level
metadata from the earlier human failure was captured. The confirmed serialization
defect, SDK source contract, failing-then-passing regression and human success
support the fix; the precise cause of the additional historical failure beyond
INVALID_REQUEST cannot be reconstructed without its discarded payload.

Current local verification: lint/typechecks/build pass; **22 unit + 5 integration
+ 13 adversarial + 15 PostgreSQL = 55 tests pass**; 6 browser tests pass. Rust fmt,
Clippy, the scaffold test, Wasm build/interface checks and workflow validation pass.
The API/migration images were rebuilt locally; web was restored after browser tests.
Database connectivity, container isolation and HTTP smoke checks pass. Gitleaks
source scan found no leaks; diff whitespace check passed. The database outage gate
is rerun with guaranteed service restoration; its final result is recorded below.

Manual status is now **desktop login success confirmed** (user report plus server
audit), not blanket M1 acceptance. Detailed wallet-prompt inspection, logout/expiry,
second-wallet/tenant checks, HTTPS and Android flows still require their own
observations. Changes remain local and unpushed as requested; PR #5 stays unmerged.

Final follow-up results: database outage check and restored HTTP smoke passed;
all three services returned healthy, preserving database/session state. The final
redacted source secret scan found no leaks, and `git diff --check` passed. PR #5
remains OPEN/draft and unmerged. No fix was committed or pushed during this
investigation; hosted CI for the PR head does not attest to these local changes.

## Meteor cancellation UX follow-up — 2026-11-01

The user reported that canceling the real Meteor signing prompt correctly left
Avroqen signed out but showed the generic wallet/service failure. The frontend
previously had no cancellation classification. Installed Meteor SDK 3.24.1 uses
`MeteorActionError._reason.endTags` (`USER_CANCELLED`, or
`INCOMPLETE_ACTION` plus `WINDOW_CLOSED`); its own connector dialog cancel rejects
with the exact plain Error message `Action was cancelled`. These are source-verified
SDK shapes, not a captured error payload from the user's particular signing popup.

The adapter now throws a sanitized typed error. Explicit cancellation displays a
neutral `role=status`: “Wallet sign-in canceled. No transaction was sent.” Popup
open/refusal errors, extension connection failures and unknown failures remain
separate errors; unknown/mixed cancellation tags do not silently become cancellation.
Raw wallet errors are not retained as causes or shown to users. In-memory connector
storage is cleared even if initialization/action creation fails. Retry clears the
notice and requests a fresh challenge. Cancellation still rejects before verify;
no backend authentication, nonce, RPC permission, origin, CSRF or tenant policy was
changed by this follow-up.

Automated checks run on this local working tree:

- `pnpm check`: lint/typechecks PASS; 24 unit, 5 integration, 13 adversarial PASS.
- `pnpm build`: PASS.
- `pnpm test:e2e`: 7 PASS. New regression invokes the installed SDK dialog's actual
  close handler twice, checks neutral status and enabled retry, two fresh challenges,
  zero verification requests and no signed-in UI. Challenge/session endpoints are
  explicit browser fixtures; this is not a real-wallet signature acceptance test.
- `pnpm test:secrets`: PASS, no leaks (rerun with Docker access after sandbox denial).

Manual evidence remains separate: the user's pre-fix cancellation preserved the
signed-out state; post-fix real Meteor signing-popup cancellation and successful
retry are NOT YET VERIFIED. Repeat on desktop, then Android where available. The
new automated dialog test does not prove the human wallet popup's runtime error
shape. Existing real-wallet login success remains recorded above. Rust/database
checks were not rerun for this frontend-only follow-up; prior results above are
historical, not new evidence. Changes remain local; PR #5 is not merged or deployed.

## Current review verification — 2026-11-01

This section supersedes earlier manual NOT RUN/local-only statements only for the
observations listed here. Owner authorized commit/push to the existing feature
branch and update of draft PR #5 against staging; no merge/deployment is authorized.

### Confirmed human observations

Owner tested Meteor Wallet on NEAR Testnet using `ajayfrizzy.testnet` at
`http://127.0.0.1:3000/workspace` (desktop Chrome/macOS reproduction context).
The owner confirmed all of these observations:

1. Real NEP-413 wallet login succeeded.
2. Organization creation and retrieval after refresh succeeded.
3. Agent registration and persistence succeeded.
4. Disabled agent status remained visible.
5. Logout returned to the signed-out interface.
6. Signing in again restored existing organizations and agents.
7. Canceling the signing prompt displayed “Wallet sign-in canceled. No transaction was sent.”
8. Retrying after cancellation successfully authenticated.

These are owner-reported UI/real-wallet observations, not a claim of manual DB,
RPC, nonce, session invalidation, CSRF or cross-tenant verification. Exact version
numbers and per-case timestamps were not supplied. The earlier login audit evidence
is separately recorded above. No owner proof/cookie/token was collected or replayed.

### Review and strengthened automated evidence

Reviewed the full local diff, including previously untracked normalizer, typed
wallet errors, allowlisted schema diagnostics and regression tests. Serialization
accepts only the installed SDK's PublicKey object and 64-byte Uint8Array/Buffer,
then emits strict canonical string fields; backend cryptographic policy is unchanged.
Cancellation remains a rejected adapter operation before `/auth/verify`, with a
neutral status and fresh-challenge retry. Popup failures are not labeled canceled.
There was no separate uncommitted organization-selection implementation to absorb:
reviewed existing selection/reset/request-version handling and added a browser
regression for delayed org A results arriving after selection of org B, including
read-only control visibility and clearing the selection.

New review finding: installed Meteor SDK has two unconditional V1 console calls
that expose connection data and successful response payload despite logging being
set to none. The reviewed pnpm patch removes those calls from both ESM/CommonJS
entrypoints. Package version remains 3.24.1; lockfile changes only record the patch
hash, with no dependency upgrades. Installed-artifact regression and frozen clean
container installation verify application of the patch. No raw wallet responses
were collected to demonstrate this source-confirmed issue. The owner observations
precede this logging-only patch; fresh human smoke after reloading it is advisable.

The PostgreSQL suite uses isolated temporary schemas, real Ed25519 signatures,
actual API handlers and actual SQL transactions. Six added cases and strengthened
assertions cover:

- Issued challenge lifetime approximately 300 seconds and session lifetime 900
  seconds; GET session does not extend expiry; expired sessions cannot mutate.
- Challenge expiry while key verification is in progress is rechecked at atomic
  consumption; no session or consumed nonce is left behind. Expiry tests move
  fixture timestamps rather than claiming a human five/fifteen-minute wait.
- Six concurrent attempts are synchronized at the key-check boundary; exactly
  one succeeds, one challenge is consumed, and one session/success audit exists.
- Logout persists revocation; retained pre-logout cookie/CSRF pairs cannot read
  sessions/organizations/agents or create organizations/register/disable agents.
- Exact wrong-account/network rejection, missing/incorrect browser cookie,
  missing/wrong/null/port-mismatched Origin, and missing/incorrect CSRF denial.
- Restricted, missing and unknown-account RPC responses pass through the actual
  finalized-key parser and route before rejection. RPC transport/results are
  explicit fixtures; this is not live finalized-chain negative-test evidence.
- Tenant read/write isolation, strict role-field rejection, demotion/disabled
  membership enforced on subsequent requests with the same session, idempotent
  agent disabling across logout/login, and no membership/authority granted by
  registering an agent account. M1 has no agent execution credential to revoke;
  app-record disabling does not revoke onchain rights.

Automated results from this review (not historical counts):

| Check | Result |
| --- | --- |
| Frozen install with scripts disabled | PASS; pinned patch applied, no lockfile drift |
| `pnpm check` | PASS: lint/typechecks, 25 unit + 5 integration + 13 adversarial tests |
| `pnpm test:identity-db` | PASS: 21 real PostgreSQL tests (17 identity + 4 migration) |
| `pnpm build` | PASS: production Next frontend and TypeScript |
| `pnpm test:e2e` | PASS: 8 Chromium tests, including real installed SDK dialog cancellation with fixture API and stale selection response regression |
| Rust fmt / Clippy / workspace tests | PASS: 1 disabled-foundation scaffold test |
| Wasm build / interface test | PASS: no transfer/upgrade host calls; simulated host, not settlement |
| Workflow validation | PASS |

Total: **64 TypeScript/API/database tests, 8 browser tests, 1 Rust scaffold test**.
Initial database invocation failed with connection refused because the local DB
service was stopped; starting the existing service and rerunning passed all 21.
Initial patch creation needed registry access beyond the sandbox; the authorized
retry succeeded. No acceptance assertion or security control was removed.

### Remaining acceptance requirements

- Actual Android Chrome and iOS Safari wallet flows remain unverified; viewport
  simulations do not establish device compatibility. Native mobile bridge stays off.
- Trusted private HTTPS and real-browser Secure/__Host- cookie enforcement remain
  unverified. Server cookie-header assertions pass, but do not prove browser TLS
  behavior. Loopback HTTP is only the explicit development exception.
- Second-wallet manual account substitution/tenant isolation, other-network and
  existing restricted/absent-key fixtures, detailed prompt review, human timed
  expiry/replay/browser-binding checks, and separate popup blocking/closure tests
  remain pending. No new privileged keys should be created to complete them.
- Independent security review is still required. Trusted finalized RPC, bounded
  stale sessions after key removal, shared proxy-IP rate limits, retention/ingress
  policy and deployment least privilege remain documented operational limitations.
- Final M1 acceptance is not claimed. Financial S01–S20 tests and custody/settlement
  remain later milestones; no onchain transaction or financial implementation occurred.

Hosted checks for the commit containing this report must be read on PR #5;
previous SHA results do not attest to this update. The final push/CI result will
be recorded in the PR description and delivery response after GitHub completes.

Final local gates for this update: `docker compose up --build -d --wait` passed
with the pinned patch applied in a clean frozen install; explicit migration exited
successfully. `pnpm test:containers`, `pnpm test:database`, `pnpm test:smoke` passed.
Controlled database stop produced 503 readiness and 200 liveness; guaranteed restore
and smoke passed, with web/API/database healthy and volumes preserved. Redacted
`pnpm test:secrets` found no leaks in the entire reviewable source tree, including
untracked patch/tests/docs. `git diff --check` passed. No `.env`, credentials,
node_modules, build output or browser artifacts are included; the small SDK patch
and its lock metadata are intentional reviewable dependency artifacts.
