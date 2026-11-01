# M1 real-wallet acceptance runbook

Review branch: `feat/m1-identity-access`, draft PR #5 targeting `staging`.
Baseline before the reviewed fixes: `1026b0b5e9e7f2a4e3766ce9bec104a262d6838e`.
Use the commit containing this update (and the PR head/checks) for current source.
The owner confirmed the desktop observations in the ledger below using Meteor
Wallet on NEAR Testnet with `ajayfrizzy.testnet` at the loopback workspace URL.
These are human-reported results, not agent-performed wallet interactions. Exact
browser/wallet versions and individual observation timestamps were not supplied.
Automated security evidence is separate in M1_REPORT.md. No transaction was needed.

## Start the local environment

Exact desktop URL: **http://127.0.0.1:3000/workspace**.
Use `127.0.0.1`, not `localhost`, a LAN IP or another port: the server binds the
login message and mutation Origin to `http://127.0.0.1:3000`.

Docker Desktop must be running. This machine has Node 24.22.1, pnpm 9.15.9,
Rust 1.96.1 and Android platform-tools (`adb`) installed.

```sh
cd /Users/oluwaseun/Desktop/avroqen
CI=true pnpm install --frozen-lockfile --ignore-scripts
pnpm setup:env
docker compose up --build -d --wait
pnpm test:smoke
curl -fsS http://127.0.0.1:3001/ready
curl -fsS http://127.0.0.1:3000/api/auth/config
```

Expected: web/API/database healthy, migration service exits successfully, readiness
returns `ready`, auth config shows `testnet` and `http://127.0.0.1:3000`. The Compose
API uses those public settings explicitly; editing `.env` does not override them.
`setup:env` preserves an existing `.env`. Never display or copy that file into
screenshots, issues or chat. No wallet keys belong there.

The web/API/database ports bind only to this computer's loopback interface. Docker
builds local development images; this is not a public deployment. The database
volume is preserved across restarts. No faucet, deposit, transaction fee or paid
service is needed. Internet is required for the wallet provider and read-only RPC.

For optional hot reload (use Compose above for acceptance consistency):

```sh
docker compose stop web api
docker compose up -d --wait database
pnpm db:migrate
PUBLIC_ORIGIN=http://127.0.0.1:3000 AUTH_ALLOW_INSECURE_LOCALHOST=true NEAR_NETWORK=testnet pnpm dev
```

Stop hot-reload processes before starting Compose web/API again. To stop Compose
without deleting application data: `docker compose down` (do not add `--volumes`).

## Desktop: guided first login

Prerequisite: an existing, unfunded NEAR **testnet** account, already available in
a human-controlled compatible wallet with an active **full-access Ed25519** key.
Use the wallet's existing profile. Do not create an account, import/export keys,
add access keys or fund an account for this run. If the connector cannot use the
existing wallet, record `BLOCKED — wallet compatibility`.

1. Open the exact URL above in desktop Chrome. Start signed out of Avroqen; a
   separate browser profile can isolate the test from other app sessions.
2. Confirm “Application access only”, network `testnet` and the no-payments notice.
3. Enter your existing public testnet account ID in **NEAR account**. This is not
   a seed phrase/private key. Select **Connect wallet & sign message**.
4. Allow the wallet/connector popup for this origin if prompted. Select the
   existing wallet/account offered by the connector. The integration uses Meteor's
   message-signing connector; exact wallet UI labels depend on the installed version.
   Native mobile bridge, transactions and access-key creation are not enabled.
5. Inspect the wallet request before signing. It must be an offchain login message
   containing your account, `testnet`, origin `http://127.0.0.1:3000`, challenge ID,
   expiry, and the no-financial-authority statement. Recipient must match that
   origin. Never approve AddKey, function-call permission, transfer, transaction,
   spending allowance or any request to enter a key into Avroqen. Cancel and mark
   failure if any such request appears.
6. Sign only that message in your wallet. Expected: same account/testnet shown in
   the app, a session expiry about 15 minutes away, and an empty organization list
   if the account has none. There must be no blockchain transaction receipt.
7. Create an application organization with a non-sensitive test name. Select it.
   Register an agent record using an existing public testnet account you control
   (the same account may be used: this creates only a record, no key or authority).
   Expected: record shows “Registered — no execution authority”. Disable it and
   reload; it must stay disabled. No wallet transaction should be requested.
8. Log out, refresh and visit `/api/auth/session` in that browser. Expected: HTTP
   401 and `SESSION_REQUIRED`; the workspace offers login again. Do not screenshot
   a successful session response: it contains the CSRF token.

If login fails, record the sanitized error, HTTP status and failing step; do not
mark wallet compatibility passed merely because unit tests passed. Wait at least a
minute on 429 before retrying. Tests share the conservative proxy-IP rate budget.

## Android Chrome over USB (no public endpoint)

Status at preparation: `adb` is installed; **no Android device connected**.
Device forwarding and wallet return behavior have not been verified.

1. On an Android device with the existing wallet already available, enable Developer
   options and USB debugging. Connect with a data-capable USB cable. Unlock the
   device and approve USB debugging only for this trusted computer.
2. With exactly one USB Android device attached, run on the computer:

   ```sh
   adb -d get-state
   adb -d reverse tcp:3000 tcp:3000
   ```

   Expected first output: `device`; reverse completes without error. If unauthorized,
   accept the device's trust dialog and retry. If multiple USB devices are attached,
   disconnect extras. No device serial needs to be recorded as evidence.
3. In **Android Chrome**, open **http://127.0.0.1:3000/workspace**. USB reverse maps
   that device loopback port to the computer's web port. The same-origin `/api`
   proxy handles API access; do not forward ports 3001 or 55432. Without USB reverse,
   Android's `127.0.0.1` addresses the phone itself and cannot reach this app.
4. Repeat desktop steps 2–8. Record Chrome/Android and wallet versions. Check popup
   visibility, return to Chrome, cancellation, keyboard/form usability, organization
   selection and agent disabling, with no horizontal overflow.
5. If Chrome blocks a popup, allow it for this origin and retry with a fresh
   challenge. If the connector/wallet requires HTTPS or native bridge support,
   record the case as blocked; do not weaken Origin/cookie policy or enable key
   transfer features. A mobile viewport simulation is not a real-device pass.
6. After testing, remove only this mapping and turn off USB debugging if desired:

   ```sh
   adb -d reverse --remove tcp:3000
   ```

USB loopback can exercise the explicit HTTP development exception. It cannot
establish production Secure-cookie behavior. It avoids any public tunnel, paid
service, LAN-wide binding or new deployment. The wallet/provider itself still
uses its own network service; provider availability is a separate dependency.

## Case matrix and expected outcomes

The ledger below records confirmed observations. Unobserved parts of a combined
case remain pending, regardless of automated coverage.

| ID | Manual action | Expected result | Extra prerequisite |
| --- | --- | --- | --- |
| W01 | Desktop login; inspect signed message | Correct account/testnet/origin, session issued, no transaction or access key | Existing full-access testnet wallet |
| W02 | Cancel prompt; separately block popup, then allow and retry | No new session on cancellation; fresh retry works | Desktop and Android separately |
| W03 | Enter account A, choose existing account B in wallet | Wallet refusal or API rejection; no substituted identity | Second existing account/wallet |
| W04 | Select a different existing network identity while app remains testnet | Refusal/rejection; mainnet-only key state cannot authorize testnet session | Existing other-network identity; no transaction |
| W05 | Attempt login with pre-existing restricted or absent key fixture | Wallet refuses, or API returns 401; no session | Existing fixture and signing-capable wallet; do not create/remove/import keys |
| W06 | Leave fresh message prompt open longer than 5 minutes, then sign | Expired challenge rejected; fresh login needed | Desktop or Android; wait measured from challenge creation |
| W07 | Resend successful verification once in browser devtools | HTTP 401; no second session | Browser devtools; proof kept local only |
| W08 | Repeat a pending verification in a separate browser context without its login cookie | Rejected; no session | Second profile/incognito context, not necessarily second device |
| W09 | Logout and reload; separately wait beyond 15 minutes after a new login | `/api/auth/session` 401; privileged operations require login; refresh does not extend expiry | Time to wait; successful login prerequisite |
| W10 | Inspect cookie attributes on loopback HTTP | HttpOnly, SameSite=Strict, Path=/, no Domain; non-__Host names, no Secure is intentional here | DevTools; record attributes only, never values |
| W11 | Inspect cookie attributes and real login over trusted local HTTPS | Secure, HttpOnly, SameSite=Strict, Path=/, __Host- names, no Domain | Trusted local HTTPS; NOT CONFIGURED |
| W12 | Create/select org, register/disable record, reload | Persistently disabled app record; no claim of onchain revocation or new execution rights | One existing wallet is enough |
| W13 | Sign in with wallet B and access wallet A's org URL | Organization absent from B's list; direct org operation denied (403) | Second existing wallet with no membership |
| W14 | Repeat W01/W02/W09/W12 on actual Android Chrome | Correct wallet return, readable UI, correct session/agent behavior | Android device, USB data cable, authorized reverse mapping |
| W15 | Repeat W01/W02/W09/W12 on actual iOS Safari | Correct wallet return, readable UI, correct session/agent behavior | iOS device and trusted private HTTPS origin; Android USB reverse instructions do not apply |

For W07 use the browser's local Network request resend/replay facility if supported;
otherwise mark the manual case blocked, retaining the automated replay test result
separately. Do not export “Copy as cURL” payloads or HAR files into reports. For W08
use a separate context's local devtools to replay only the pending request body,
without copying cookies; Origin must still be the exact app origin. If the browser
has no safe local replay facility, leave this manual row pending. Automated
PostgreSQL/crypto tests already exercise both failures, but are not manual evidence.

For W13 note the public org UUID while signed in as A. After logout/sign-in as B,
open `/api/organizations/ORG_UUID/agents` on the same origin (replace ORG_UUID with
that actual public ID). Expected 403. Do not grant B membership for this test.

### HTTPS boundary

No trusted local HTTPS origin/certificate has been configured by this preparation.
W11 and any wallet that refuses loopback HTTP are **BLOCKED**, not passed. A future
private HTTPS setup must have a certificate trusted by the test browser/device,
proxy to the existing local web service, and set the API's exact PUBLIC_ORIGIN to
that HTTPS origin with the HTTP exception disabled. Compose currently hardcodes the
HTTP origin: a deliberate local override is needed, not just an `.env` edit.
Changing origin invalidates previous challenges/sessions. Do not bypass certificate
warnings, relax CSRF/origin checks, expose LAN HTTP or use a public tunnel as a
substitute. TLS setup and trust installation have not been performed or verified.

## Collect only non-sensitive evidence

Use a local notes document with one row per case and per device:

```text
Case ID: W01
Result: NOT RUN | PASS | FAIL | BLOCKED
UTC time:
Source SHA: record the tested local commit (git rev-parse HEAD)
Platform / browser / wallet versions:
Origin / network:
Public test account alias (A or B):
Action and observed result:
HTTP status / sanitized error code (if available):
Screenshot filename (optional, cropped and inspected):
Blocker / follow-up:
```

Capture only the visible app result or the message-signing request after checking
it contains no secrets. Public account IDs may be replaced by A/B for privacy.
Record request path, status, timing and cookie attribute **names**, not response
bodies/values. Never include seed phrases, private keys, wallet backup QR codes,
`.env`, cookie headers, session/CSRF tokens, signature proofs, full console dumps,
HAR exports or storage snapshots. Avoid screen-recording wallet unlock/backup UI.
A login message is not a payment: no transaction hash is expected or fabricated.

Do not commit evidence automatically. Review/crop artifacts locally first. Record
PASS only after observing the expected result on that exact device. A blocked
prerequisite stays BLOCKED; an automated pass cannot fill a manual result cell.

## Automated results for this preparation

Results are recorded after the rerun in M1_REPORT.md. Real PostgreSQL/Ed25519 tests
exercise authorization; browser API responses and wallet/RPC test boundaries are
explicit simulations. A public RPC `status` call confirmed testnet reachability,
not control of any human account/key. Contract checks cover the disabled M0 scaffold;
S01–S20 custody/settlement integration is not implemented in M1 and is not claimed.

## Manual result ledger — owner confirmation recorded 2026-11-01

| Scope | Confirmed human observation | Still unverified manually |
| --- | --- | --- |
| Desktop W01 | Real Meteor NEP-413 login succeeded on testnet | Detailed message-field/prompt inspection checklist |
| Desktop W02 | Signing cancellation displayed “Wallet sign-in canceled. No transaction was sent.”; retry authenticated successfully | Separate popup-blocking/window-close behavior; server-side absence of a new session on cancellation |
| Desktop W12 | Organization creation/retrieval after refresh; agent registration/persistence; disabled status remained visible | Second-wallet access denial and server-side enforcement (automated separately) |
| Desktop W09 (partial) | Logout returned to signed-out UI; sign-in restored existing organization and agent records | Retained-cookie replay after logout, session endpoint status and actual 15-minute wait |
| W03/W13 | NOT RUN | Second existing wallet/account substitution and manual tenant isolation |
| W04/W05 | NOT RUN | Existing other-network/restricted/absent-key fixtures; do not create privileged keys |
| W06/W07/W08/W10 | NOT RUN | Human challenge-expiry, replay, browser binding and cookie-attribute inspection |
| Android W14 | NOT RUN; device prerequisite unverified | Actual Android Chrome wallet behavior; USB forwarding is not a device pass |
| iOS W15 | NOT RUN; device/private HTTPS prerequisites unverified | Actual iOS Safari wallet behavior |
| HTTPS W11 | BLOCKED on trusted private HTTPS setup | Secure/__Host- cookie browser enforcement and real login over HTTPS |
| Independent security review | NOT RUN | Review by a reviewer independent of this implementation |

Confirmed account: `ajayfrizzy.testnet`, Meteor Wallet, desktop Chrome on macOS,
NEAR Testnet, `http://127.0.0.1:3000/workspace`. Device context comes from the
reported reproduction; exact version numbers were not supplied. No claim is made
that the owner inspected DB rows, retained cookies, signature encoding, RPC finality,
nonce atomicity, CSRF or tenant enforcement during these manual flows. Those are
covered by the explicitly automated suites. The owner did not report tests against
the subsequent logging-only SDK patch; frozen-install/browser checks validate that
patch automatically, and a fresh human smoke remains advisable after loading it.

Automated cancellation uses the actual installed SDK dialog close handler with
fixture challenge/session endpoints. It proves fresh retry challenges, neutral
status, enabled retry and no verification call for that simulated flow. It does
not stand in for the owner's separate real signing-popup observation.

For further manual validation, hard-refresh the rebuilt workspace, use only the
existing unfunded testnet wallet, and approve only NEP-413 login messages. Record
case ID, device/browser/wallet versions, tested commit, visible outcome and HTTP
path/status; never record cookies/tokens/proofs, raw console dumps, HARs or `.env`.
Keep PR #5 draft and unmerged; these results do not establish final M1 acceptance.
