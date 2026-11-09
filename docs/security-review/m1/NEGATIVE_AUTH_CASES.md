# M1 negative authentication and cookie verification

Scope: existing M1 only. These procedures do not require transactions, new wallet
keys, funding, public deployment, or sending proof material to anyone. iOS is
**DEFERRED** by the owner. Independent security review is **NOT PERFORMED**.

## Automated verification is the primary evidence for server negatives

Run `pnpm check` and `pnpm test:identity-db` with local PostgreSQL. Tests create
isolated schemas and ephemeral in-memory signing fixtures; they never replay the
owner's actual proof. All cases below are automated, not claims of human execution.

| Case | Executed evidence | Required result / limits |
| --- | --- | --- |
| Five-minute challenge expiry | Issued TTL checked; already-expired fixture and expiry occurring during RPC verification | 401, no session, no nonce consumption. Fixture timestamps are moved; this is not a human five-minute wait |
| Replay | Successful proof resubmitted; old signature attached to a different valid challenge; six synchronized consumers | Replay/substitution 401; one winner/session/audit for concurrent same-challenge attempts |
| Browser substitution | Missing/random cookie and cookie from another valid same-account challenge | 401 and no sessions/consumption; each original proof still succeeds in its own browser context |
| Wrong account/network | Valid proof with account/network fields substituted; fixed network RPC request assertions | 401 for wrong proof binding; schema invalidity stays distinct from crypto/identity failure |
| Restricted/missing key | Actual RPC parser plus route and PostgreSQL with restricted/UNKNOWN_ACCESS_KEY/UNKNOWN_ACCOUNT fixture replies | 401 and no issued session; unavailable RPC fails closed 503. RPC responses are fixtures, not live-chain negative evidence |
| Popup blocking/refusal/closure | Adapter receives pinned SDK POPUP_WINDOW_OPEN_FAILED, POPUP_WINDOW_REFUSED, WINDOW_CLOSED, USER_CANCELLED, EXT_DIRECT_RESPONSE_FAILED shapes | Rejects with correct sanitized kind, permits fresh retry; actual SDK dialog cancellation also has browser regression. Real browser popup policy/remote wallet behavior remains a manual compatibility check |
| Cookie security | Real route response headers for challenge issuance, successful verification, challenge deletion and logout | `__Host-`, Secure, HttpOnly, SameSite=Strict, Path=/, **no Domain**. Challenge max-age 300, session 900. No Domain establishes host-only cookie scope under cookie semantics; not a claim of every browser enforcement attack tested |
| Expiry/logout/CSRF/roles | Real PostgreSQL session expiry/retained-cookie denial/Origin-CSRF/role-tenant tests | Expired or revoked session cannot read/mutate; no role or organization selector acts as authorization |
| Revocation contention | PostgreSQL lock wait observed before committing session or membership revocation | Waiting agent mutation rechecks state, returns 401/403 and inserts no agent. Tests cover these scheduled orderings, not every possible interleaving |

Do not ask the owner to copy, export, edit, retain, or resend real signatures,
nonces, cookie headers or request bodies to duplicate automated replay/substitution
cases. Raw HAR/console exports and “Copy as cURL” are not acceptance artifacts.

## Human wallet compatibility procedures still pending

Use `https://127.0.0.1:8443/workspace` on the private USB setup in
[M1_ANDROID_HTTPS.md](../../runbooks/security/ANDROID_HTTPS.md). Start signed out, use a fresh
challenge for each attempt, and record only case ID, browser/wallet versions,
public account alias, UTC time, visible result, request path/status/error code.
No credentials or proof contents are needed. Do not repeat already confirmed
login/cancel/logout/persistence/isolation flows merely to inflate evidence.

### N01 — Delayed signing beyond challenge expiry

1. Start login with the existing testnet wallet. Note the time the challenge request
   completes (Network timing only; do not open/copy its body).
2. Leave the NEP-413 signing prompt pending for more than **six minutes**.
3. Approve only that original login message, if the wallet still permits it.
4. Expect rejection/signed-out UI, no authenticated workspace; an API verification
   request, if sent, should return 401. Start a fresh login afterward and confirm
   normal recovery. A wallet timeout/refusal is recorded as wallet behavior, not a
   demonstrated API expiry rejection. The browser's login cookie may also expire;
   the SQL regressions separately isolate server challenge expiry.

### N02 — Account selection mismatch

1. Use existing testnet accounts A and B; do not create/import keys. Enter A in the
   app, then choose B in Meteor if its UI allows that choice.
2. Inspect the request; approve only an offchain login message if comfortable with
   the intentional mismatch. Expect wallet refusal or API 401, not a session for B.
3. Record which layer refused. If the wallet prevents account substitution before
   signing, backend substitution remains the automated result, not a manual API pass.

### N03 — Network/key permissions (existing eligible fixtures only)

Use only a pre-existing wallet/account whose signing key is independently known
not to be full-access on the application's **testnet**. A restricted-key or
mainnet-only fixture must already exist; do not provision, remove, revoke, import,
export or modify keys to satisfy this test. If unavailable, mark **BLOCKED: fixture
unavailable** and retain automated coverage separately. A wallet refusal to sign
is distinct from API rejection (401). An RPC outage is 503, not proof of key denial.

The authoritative network is the signed server challenge plus finalized lookup
on the fixed testnet RPC. Merely toggling the wallet's network label is not a valid
wrong-network test if the same account/key is also full-access on testnet. Do not
claim network isolation from a wallet UI label or loosen the approved key policy.

### N04 — Popup blocked, then recovered

1. In a browser that exposes this control, block popups for the exact local origin.
2. Start login and choose Meteor Web if offered. If the browser refuses the popup,
   expect the app's popup-unavailable/allow-popups message, no authenticated UI,
   and no `/api/auth/verify` request. Do not change global browser security settings.
3. Allow popups for this origin, start a fresh attempt, and approve only login.
   Confirm recovery. If Chrome opens the popup despite the setting because it was
   user-initiated, record **NOT EXERCISED**, not a passing popup-block test.

### N05 — Close wallet window/tab before signing

Start a fresh login. Close only the actual wallet popup/tab before approving the
NEP-413 request and return to Avroqen. Expect the neutral cancellation status and
signed-out UI; retry should work. Do not confuse closing the local connector dialog
(already automated) with closing the remote wallet tab. If the mobile SDK cannot
observe closure, record the actual pending/error state as a compatibility issue;
do not fabricate cancellation success or enable the native bridge to force a pass.

## Optional Android cookie inspection: metadata only

Server-side host-only/Domain/challenge-cookie checks are already automated. For
additional browser evidence, open the phone's tab via `chrome://inspect/#devices`.
Hide the **Value** column before inspecting Application → Cookies. While signed out,
start login and pause at the wallet prompt: `__Host-avroqen_login` should have Secure,
HttpOnly, SameSite Strict, Path / and about 5 minutes lifetime. After successful login
it should be removed and `__Host-avroqen_session` should have the same protections
and about 15 minutes lifetime. Logout removes that session cookie.

DevTools displaying `127.0.0.1` in its Domain column does **not** mean a Domain
attribute was sent. It shows the owning host even for host-only cookies. The
no-Domain response-header regression supplies that evidence without exposing
Set-Cookie values. Record a host-only flag only if the tool actually exposes it;
do not infer it solely from the column label or copy full response headers.

## Reporting limits

Confirmed desktop/Android positive results live in the current manual ledger.
N01–N05 are procedures, **not completed human tests**. Automated success is not an
independent audit. Owner acceptance/independent review may require selected manual
negative tests before merge; review-only push readiness does not waive those gates.
