# M1 — identity, organizations and agent access

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

**Assessment:** M1 meets hackathon testnet integration acceptance; no confirmed
critical/high-severity blocking defect was identified in the reviewed paths.
This is implementation-team review, not independent security or production approval.
**Branch:** `feat/m1-identity-access`; PR #5 targets `staging`.
**Implementation reviewed:** `c0d4063197432a65bd9a936a526b7c1ef51ee338`.
**M0 baseline:** `84ffd209d767660d0cae5c369aa2aa52a54148e8`.
**Integration decision date:** November 1, 2026.

The **Hackathon integration disposition** below supersedes historical draft-only,
unpushed and independent-review-as-merge-gate statements in this report. Earlier
entries remain evidence history, not current delivery instructions. The owner
explicitly clarified that external independent audit is not a prerequisite for M1
hackathon integration. Independent review remains NOT PERFORMED; iOS is DEFERRED.

## Hackathon integration disposition

Reviewed NEP-413 serialization and Ed25519 verification, finalized FullAccess RPC
checks, account/network/origin/browser binding, atomic challenge consumption and
session issuance, expiry/logout/CSRF, role/tenant-scoped queries, agent disabling,
and message-only SDK integration with rejecting key custody and patched logging.
No confirmed critical or high-severity vulnerability was identified in those paths.
This bounded source/evidence review does not assert that no vulnerabilities exist.
No runtime controls or authority boundaries changed for this disposition.

Implementation commit `c0d4063197432a65bd9a936a526b7c1ef51ee338` passed both
`foundation` and `rust` in [hosted run 41317104005](https://github.com/Ajayfrizzy/avroqen/actions/runs/41317104005).
The PR targets `staging`, was mergeable, and had zero review threads (including
zero unresolved threads) at this review. This documentation-only follow-up must
also receive green checks on its exact head before merge readiness is reported.
Final merge remains subject to the owner's authorization; no merge is authorized
by this report. Local evidence: 77 TypeScript/API/database, 8 Chromium and 1 Rust
scaffold tests, plus builds, container/database/outage, HTTPS and secret checks.

Desktop and Android owner-confirmed wallet results remain in the
[manual ledger](../../runbooks/security/WALLET_ACCEPTANCE.md#current-manual-evidence--owner-confirmations-2026-11-01).
[Negative wallet cases](../../security-review/m1/NEGATIVE_AUTH_CASES.md) remain NOT RUN
manually: delayed signing, existing account mismatch, eligible existing
network/restricted/missing-key fixtures, popup blocking and remote wallet-window
closure. Missing fixtures remain blocked; no keys should be created to fill that
gap. Automated negative tests are not mislabeled as human tests. iOS is explicitly
deferred. These compatibility evidence gaps are retained, not manufactured as
confirmed exploitable defects or waived as passed.

Residual risks remain: trusted finalized RPC, up to 15-minute session validity after
wallet-key removal, dependency-wide SDK review, other concurrency interleavings,
shared proxy rate budgets, retention, and production ingress/CSP/database privilege
policies. They are not confirmed critical/high defects blocking this limited
hackathon integration. Independent professional review and production-hardening
assessment remain necessary before meaningful real-money production use; M1 is
not approved for that use. The local HTTPS helper is development tooling only.

M2 and subsequent milestones retain every canonical invariant: app sessions/roles
never replace owner wallet transaction signatures; agents receive no custody,
verifier or policy authority; onchain policy/spending checks, independent evidence,
checked atomic accounting, authenticated callbacks, idempotency and conservative
unknown-outcome handling remain mandatory. This disposition does not waive future
milestone tests, authorize funding, mainnet deployment or repository publication.

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
Local guide: [M1_WALLET_ACCEPTANCE.md](../../runbooks/security/WALLET_ACCEPTANCE.md), including exact
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

## Private HTTPS and separate security-review package — 2026-11-01

Prepared [security-review/m1/README.md](../../security-review/m1/README.md) and its
[FINDINGS.md](../../security-review/m1/FINDINGS.md) as a separate handoff covering NEP-413,
finalized RPC permissions, nonce/browser/replay binding, sessions, CSRF, role
escalation, tenant isolation and SDK credential exposure. This is an implementation
self-review package, **not an independent audit**. It identifies evidence closed by
automation versus device observations, owner policy decisions and independent review.

Baseline PR head remains `64cad66d5a7dc4b6d716a05470c15347f166c082`, draft against
staging, unmerged. Its foundation/rust hosted run passed; these new local additions
are not attested by that historical run. No M2, merge, public deployment, financial
transaction, privileged wallet key or paid service was introduced.

### Private HTTPS setup

- Added explicit `compose.https.yaml` override: PUBLIC_ORIGIN
  `https://127.0.0.1:8443`, testnet, insecure HTTP exception disabled. Origin changes
  invalidate old-origin login/session use; database records/volumes are preserved.
- `pnpm setup:https` generates a local test CA (30 days) and IP-SAN server cert
  (7 days), retaining private files only under ignored `.local/https` (directory
  0700, keys 0600). Existing valid certificates are reused. No OS/device trust store
  is modified automatically. These are TLS certificates, not wallet access keys.
- `pnpm dev:https` binds only host loopback port 8443 and proxies to fixed loopback
  web port 3000. It checks Host, rejects absolute/open-proxy targets, removes spoofed
  forwarding headers, preserves Origin, bounds timeouts and does not log requests,
  headers, cookies, proofs or raw errors. It is a private acceptance helper, not a
  production ingress implementation. All Compose published ports stay loopback-only.
- `.local` is excluded from Git and Docker context; rebuilt non-root application
  images were checked to contain no `.env`, `.git` or `.local` material.
- [M1_ANDROID_HTTPS.md](../../runbooks/security/ANDROID_HTTPS.md) provides exact start/stop/rollback,
  public-CA-only transfer, Android manual trust, USB 8443 forwarding and Meteor
  login/cancellation/logout/persistence/second-wallet isolation steps. No public
  tunnel, LAN exposure, certificate-warning bypass or weakened cookie policy.

### Actual automated evidence for this supplement

| Executed check | Result and limit |
| --- | --- |
| `pnpm check` | PASS: lint/typechecks, 25 unit + 8 integration + 13 adversarial tests |
| `pnpm test:identity-db` | PASS: 22 real PostgreSQL tests, isolated temporary schemas |
| New TLS integration cases | PASS (3): untrusted CA rejected; explicit CA trusted with Origin preserved/spoofed forwarding removed; wrong Host/absolute targets rejected; upstream outage sanitized. No certificate validation bypass |
| New audit-failure SQL regression | PASS: failed success audit returns 503, creates no session, rolls back nonce consumption; a fresh verification of the same still-valid fixture succeeds after recovery |
| `pnpm build` | PASS: production Next build and TypeScript |
| `pnpm setup:https` | PASS: locally generated and chain-verified certificate material; no trust store change |
| `docker compose -f compose.yaml -f compose.https.yaml up --build -d --wait` | PASS: clean frozen installs, migration, healthy API/web/database |
| `pnpm test:https` | PASS: CA-verified real TLS endpoint, workspace/config, signed-out session 401, Secure/HttpOnly/SameSite=Strict/Path=/Max-Age=300/__Host challenge cookie and absent Domain; wrong HTTP Origin 403 |
| `pnpm test:containers`, `pnpm test:database` | PASS: non-root image isolation including absence of `.local`, actual DB connectivity |
| Parsed Compose exposure/config check | PASS: all published ports bind 127.0.0.1; fixed HTTPS origin; insecure exception false; no config secrets printed |

Total for the executed TS/API/DB suites: **68 tests**. TLS-client checks do not
establish Android Chrome trust or browser Secure-cookie enforcement. The live check
requests a synthetic unsigned challenge, discards its body and cookie values, and
never calls verification or creates a wallet/session. The 8 browser UI tests and
Rust/Wasm results from `64cad66` remain historical; UI/contract code was not changed
by this supplement and those suites were not rerun here.

Corrections during preparation: TypeScript required an explicit proxy header-map
type. Initial TLS integration run lacked sandbox loopback permission and failed;
authorized rerun used real sockets. A wrong-Host test initially also changed TLS
SNI implicitly; the test now keeps certificate identity on the loopback IP while
varying HTTP Host, without disabling chain/hostname verification. Final suites pass.

### Human/device and independent-review status

Owner confirmed an Android phone with the existing Meteor testnet wallet is
available and can be connected. At the last transport check no device was attached.
USB authorization/forwarding, Android public-CA installation/trust, A01–A07 wallet
flows and Secure-cookie browser enforcement remain **NOT RUN**, not passed by host
TLS tests. Unsupported Meteor mobile/native-bridge flows must remain pending; the
native bridge stays disabled. Desktop human results above remain valid for their
reported HTTP context, not automatically for Android/HTTPS.

Independent reviewer signoff remains **NOT RUN**. The package separately flags
broader SDK data-flow/message-origin review, trusted RPC/stale-session assumptions,
operational rate/retention/ingress policy and explicit concurrent logout/mutation
interleaving tests. No newly demonstrated backend authorization bypass was found;
that bounded self-review conclusion is not a security guarantee. M1 final acceptance
is not claimed. Changes in this supplement are kept local for review/device testing.

Final preparation checks: redacted `pnpm test:secrets` found no leaks; workflow
validation, lint and diff whitespace checks passed. Filesystem checks confirmed
`.local/https` mode 0700 and both private keys mode 0600; Git ignores CA/key/cert
material. Final Android check found zero authorized devices, so no certificate
transfer or USB forwarding was performed. The proxy and HTTPS-configured services
remain running locally for the human steps. No device trust/mobile pass is claimed.

Android connection follow-up (2026-11-01): exactly one authorized USB device was
observed. Copied only the public `root-ca.crt` to Android Downloads as
`avroqen-local-ca.crt` and configured USB reverse for 8443 → 8443. No private key,
API port or database port was transferred/forwarded. `pnpm test:https` passed again.
This supersedes the earlier no-device observation; Android CA installation, Chrome
trust, wallet flows and browser cookie enforcement still require human verification.

Android reachability follow-up (2026-11-01): owner reported CA installation succeeded
but Chrome could not reach the site. The device was authorized, but `adb reverse`
had no port mappings; the host CA-verified HTTPS check still passed. Restored and
verified only tcp:8443 → tcp:8443. The reason the mapping disappeared is unknown;
USB/ADB reconnection can require reapplying it. Device Chrome trust and page-load
success remain pending human retry; this was a missing transport mapping, not an
observed certificate rejection.
The first forwarding-restoration command returned a nonzero exit; a subsequent
retry succeeded and the mapping was read back as tcp:8443 → tcp:8443. The transient
ADB failure's cause was not established. Human Chrome retry is still required.

Android reachability confirmed (2026-11-01): after restoring forwarding and opening
`https://127.0.0.1:8443/workspace` explicitly in Android Chrome, the owner reported
“Avroqen workspace/sign-in page.” Three phone-side TCP probes reached 127.0.0.1:8443;
subsequent ADB queries checked return codes and confirmed the rule. Host TLS checks
passed. Earlier empty forwarding output was interpreted as a missing mapping but
not every initial list command's exit status was captured; intermittent ADB query
failure versus actual mapping loss is not conclusively distinguished. No cable,
Android or certificate defect is established. Current phone page reachability is
human-confirmed. Explicit certificate/site-information review, wallet login,
cancellation/logout, Secure-cookie enforcement and second-wallet isolation remain
pending; the visible sign-in page is not blanket Android wallet acceptance.


Android human login confirmation (2026-11-01): owner used a different existing
testnet account, labeled **B** (public account ID not collected). The owner confirmed
Meteor displayed the NEP-413 signing prompt with account B, testnet and
`https://127.0.0.1:8443`, and confirmed the requested signed-in account display in
Avroqen. **A02 Android real-wallet login: PASS, owner-reported.** This supersedes
prior pending-login statements only for this observed flow. Browser/wallet version
numbers and exact observation time were not supplied. No proof, nonce, cookie or
session token was collected, and no server-internal behavior is claimed manually
verified. A03 cancellation/retry, A04 logout, A05 persistence, A06 second-wallet
isolation, A07 browser cookie inspection and independent review remain pending.
Using B successfully does not prove isolation from A's organization. Detailed
certificate/site-information inspection is not inferred from successful login.


Android second-wallet read-isolation confirmation (2026-11-01): while signed in
as account B, the owner reported that account A's organization was absent from
the organization selector. A read-only local DB lookup identified the organization
owned by `ajayfrizzy.testnet`; no sessions or wallet proofs were accessed. The owner
then opened that organization's `/api/organizations/:orgId/agents` URL on the phone
and reported **access denied**. **A06/W13 list visibility and direct cross-account
agent-read denial: PASS, owner-reported.** The exact HTTP status was not separately
observed; do not claim a manually captured 403. This does not establish manual
unauthorized-write, role-escalation or other-network testing; those retain their
separate automated coverage and pending manual status. Android logout,
cancellation/retry, persistence, cookie-attribute inspection and independent review
remain pending. No sensitive request/response payloads were collected.


Android logout UI confirmation (2026-11-01): after being instructed to log out
and refresh the workspace, the owner confirmed return to the sign-in screen.
**A04/W09 logout-and-refresh UI: PASS, owner-reported.** No retained-cookie replay
or session-endpoint HTTP status was manually observed in this step; server-side
invalidation evidence remains the separate automated PostgreSQL tests. Android
cancellation/retry, persistence and browser cookie inspection remain pending.


Android cancellation/retry confirmation (2026-11-01): the owner confirmed that
canceling Meteor's NEP-413 signing prompt displayed “Wallet sign-in canceled.
No transaction was sent.” and left the app signed out, and that retrying with
account B and approving the login message authenticated successfully.
**A03/W02 signing cancellation and retry: PASS, owner-reported.** This confirms
observed wallet/UI behavior, not a manually inspected absence of session issuance
or nonce reuse; those remain separately tested automatically. Popup blocking and
window-close variants were not reported. Android persistence, explicit certificate
inspection, browser cookie attributes and independent security review remain pending.


Android persistence confirmation (2026-11-01): the owner confirmed all steps in
the immediately preceding persistence checklist: account B created a test
organization, registered an agent record, disabled it, refreshed, then logged out
and signed in again. The organization and agent remained visible and the agent
remained Disabled. **A05/W12 persistence: PASS, owner-reported.** “Everything listed”
refers to that checklist, not to every M1 acceptance requirement. No transaction,
onchain revocation, raw DB inspection or credential creation is inferred.

Current owner-confirmed Android results: real NEP-413 login with B; A's organization
absent from B's selector and direct agent-read access denied; logout/refresh to the
sign-in UI; neutral signing cancellation and successful retry; organization/agent
persistence with disabled status after refresh and reauthentication. Explicit
certificate/site-information inspection, browser Secure/HttpOnly/SameSite/__Host
cookie inspection, separate popup variants, other unobserved negative wallet cases,
iOS testing and independent security review remain pending. Manual results do not
replace automated server-side authorization evidence. Final M1 acceptance is not
claimed; PR #5 must remain draft and unmerged.


Browser TLS/cookie inspection follow-up (2026-11-01): the supplied DevTools
Security screenshot shows TLS 1.3, certificate subject/SAN 127.0.0.1, issuer
Avroqen local acceptance CA, validity November 1–8, 2026, and a green main-origin
lock indicator. After instructions to inspect `__Host-avroqen_session`, the owner
confirmed all listed attributes: Secure checked, HttpOnly checked, SameSite Strict,
and Path /. **Inspected-browser TLS details and session-cookie attributes:
confirmed by screenshot/owner report.** No cookie values or session tokens were
requested or collected. Cookie Domain/host-only status and login-challenge cookie
attributes were not part of this manual confirmation. This verifies displayed
attributes, not all adversarial browser cookie behavior.

The interaction is in the Android testing context, but the owner has not separately
and unambiguously confirmed that this particular DevTools target was opened using
Inspect under the connected phone. Preserve this provenance limitation rather than
claiming device-specific browser inspection solely from the screenshot. Prior
Android wallet/UI observations remain recorded independently.

Owner explicitly deferred iOS testing for now: **DEFERRED, not passed**, and not a
blocker to continuing current Android verification. Independent human security
review and other unobserved negative cases remain pending. This self-review is not
an independent audit; final M1 acceptance is not claimed.


Android DevTools provenance confirmed (2026-11-01): the owner explicitly confirmed
opening the inspected DevTools window through Inspect beneath the connected Android
phone at `chrome://inspect/#devices`. This resolves the preceding provenance
limitation. **Android TLS/certificate-detail inspection and displayed session-cookie
attributes (Secure, HttpOnly, SameSite=Strict, Path=/): PASS**, based on the supplied
Security screenshot and owner attribute confirmation. This does not extend to
unobserved cookie Domain/host-only metadata, challenge-cookie inspection or all
adversarial browser enforcement cases. No cookie values or tokens were collected.
Current Android human evidence includes login, second-wallet read isolation,
logout/refresh, cancellation/retry, persistence with disabled agent state, and the
TLS/session-cookie inspection above. iOS stays DEFERRED at owner request;
independent security review and remaining unobserved negative cases remain pending.
PR #5 must stay draft and unmerged; final M1 acceptance is not claimed.

## Final negative-case verification — 2026-11-01

**Disposition:** prepared for a review-only push of the existing feature branch,
not final M1 acceptance or merge. No application authentication/authorization rule
was weakened or changed. This review includes the previously local HTTPS tooling,
security package and owner-confirmed manual evidence. PR #5 must remain draft.

### Actual automated results for this review candidate

| Command/gate | Result |
| --- | --- |
| Frozen install (`--frozen-lockfile --ignore-scripts`) | PASS; no dependency/lock drift |
| `pnpm check` | PASS: lint/typechecks, **25 unit + 13 integration + 13 adversarial** |
| `pnpm test:identity-db` | PASS: **26 real PostgreSQL tests** (22 identity + 4 migrations) |
| `pnpm build` | PASS: production Next build and repository TypeScript |
| `pnpm test:e2e` | PASS: **8 Chromium tests** |
| Rust fmt / Clippy with warnings denied / workspace tests | PASS: **1 scaffold test** |
| `pnpm build:contract`, `pnpm test:wasm` | PASS: disabled scaffold only; no custody/settlement claim |
| `pnpm test:workflow`, HTTPS Compose config validation | PASS |
| Clean Docker Compose build/bootstrap with HTTPS override | PASS: frozen installs, migration, healthy web/API/database |
| Container isolation / database connectivity / HTTP smoke / trusted HTTPS check | PASS: non-root; no .env/.git/.local in images; HTTPS challenge cookie protection and wrong-Origin denial |
| Controlled database outage (`node scripts/check-outage.mjs`) and recovery | PASS: readiness 503 / health 200 while unavailable; database and HTTPS Compose services restored healthy; smoke and HTTPS checks passed again |
| Final `pnpm test:secrets`, `pnpm lint`, `git diff --check` | PASS: no leaks detected, lint clean, no whitespace errors |

**77 TypeScript/API/database tests + 8 browser tests + 1 Rust test passed.**
The first check/build attempt caught an incorrect test-only Fastify overload type
for a pending request. Corrected it to its actual Promise response type; the complete
checks and production build were rerun and passed. No runtime security policy or
assertion was relaxed. New regression evidence:

- Two valid same-account browser challenges cannot exchange cookies or signatures.
  Both attacks return 401 with zero sessions/consumption; each original proof can
  subsequently succeed in its own context, and subsequent replay fails.
- Challenge issuance, session issuance, challenge deletion and logout deletion use
  Secure, HttpOnly, SameSite=Strict, Path=/ and **no Domain attribute**. Names use
  `__Host-`; lifetimes are 300/900 seconds. Absence of Domain gives host-only scope.
  Assertions retain only metadata, never print cookie values. The live HTTPS check
  independently verifies challenge attributes/no Domain on the actual local stack.
- Five SDK error shapes (popup open failed/refused, window closed, user canceled,
  extension unavailable) reject with the expected sanitized error kind and permit
  a fresh challenge retry. These are pinned SDK response simulations; they do not
  claim human/browser popup-policy tests. Existing browser regression uses the real
  SDK dialog close handler with fixture API responses and observes zero verification
  calls on cancellation.
- Scheduled SQL contention tests observe actual lock waits behind session or
  membership revocation, commit that revocation, then require 401/403 and no agent
  insertion from the waiting mutation. These test two defined orderings, not every
  interleaving or an independent lock-graph assessment.

Existing cases were rerun: five-minute issued/expired challenge and expiry during
RPC; one-use replay and six concurrent consumers; wrong account/network; forged
and malformed proofs; finalized restricted/missing-key parser; RPC failure closed;
15-minute sessions, logout/rotation, Origin/CSRF, tenant/role/disabled-membership
checks, persistent disabling, migration constraints, audit secrecy and transactional
audit-failure rollback. Real cryptography/SQL run; RPC permission replies and wallet
failure objects are explicit fixtures. No real human proof was captured or replayed.

### Confirmed manual evidence and remaining requirements

The consolidated [manual ledger](../../runbooks/security/WALLET_ACCEPTANCE.md#current-manual-evidence--owner-confirmations-2026-11-01)
records desktop and Android login, persistence/disabled agents, logout and signing
cancellation/retry. Android additionally has owner-confirmed second-wallet list and
direct-read denial, TLS/certificate screenshot, and session Secure/HttpOnly/Strict/
Path attributes with explicitly confirmed remote-phone DevTools provenance. The
ACCESS_DENIED text is confirmed; the direct-access HTTP 403 was not separately
captured. No unobserved server-internal behavior is marked manually verified.

Remaining real-wallet compatibility procedures are precisely scoped in
[NEGATIVE_AUTH_CASES.md](../../security-review/m1/NEGATIVE_AUTH_CASES.md): delayed signing,
existing account mismatch, eligible existing network/restricted/missing-key fixtures,
popup blocking and actual wallet-window closure. They are **NOT RUN manually**;
missing fixtures are BLOCKED, not instructions to create privileged keys. Replay
and browser substitution need no manual proof handling; their automated evidence
is explicit. Additional manual challenge-cookie/host-only observation is not claimed;
server cookie lifecycle/no-Domain validation is complete and separate from the
owner's session-cookie observation. **iOS is DEFERRED at owner request.**

Independent human security review remains **NOT PERFORMED**. Residual trust/risk:
fixed finalized RPC service, app sessions valid up to 15 minutes after wallet-key
removal, SDK-wide message/credential data-flow review, shared proxy-IP rate limits,
retention and production ingress/CSP/DB least privilege. Further lock-interleaving
review remains appropriate. The local TLS helper is not production ingress; the
short-lived CA's private key stays local and device trust should be removed after
testing. No new backend authorization bypass was demonstrated by these tests, but
self-review is not independent assurance and cannot waive these review gates.

### Delivery boundary

The review candidate is to be committed locally on `feat/m1-identity-access` and
left **unpushed** for a review-only push. The previous hosted run on `64cad66` is
historical. New `foundation` and `rust` results are required on the new commit after
pushing; local passes are not reported as hosted CI. No merge, public deployment,
financial transaction, wallet-key provisioning or M2 implementation occurred.

Final source/diff review includes the local HTTPS helpers, ignore rules, regression
tests and evidence documents. No credentials, private TLS material, generated build
outputs or dependency directories are included in the review candidate. The branch
is ready for a review-only push, subject to new hosted CI and the remaining human
review requirements above; this is not a declaration of final M1 acceptance.
