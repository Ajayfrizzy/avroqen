# M1 Android Chrome — private trusted HTTPS acceptance

Originally prepared for then-draft PR #5 on November 1, 2026, this is a zero-cost
local setup retained for pending device acceptance. It is not a public deployment.
The Node TLS proxy binds **127.0.0.1:8443**, forwards only to the existing loopback
web server, and uses Android USB reverse forwarding. No LAN listener, public tunnel,
DNS service, faucet, wallet-key creation or paid service is needed. API and PostgreSQL
ports remain host-loopback only and must never be forwarded to the phone.

## Start/reproduce on the Mac

Prerequisites: existing project Node/pnpm dependencies, OpenSSL, Docker Desktop,
Android platform-tools (`adb`), a USB data cable, and an existing unfunded testnet
wallet already available to the human on the device. Do not import/export/create
wallet keys for this test. SDK native mobile bridge remains disabled.

Run from the repository root:

```sh
pnpm setup:https
docker compose -f compose.yaml -f compose.https.yaml up --build -d --wait
pnpm dev:https
```

Keep the last command running in its own terminal. If the assistant's proxy is
already running, do not start another on port 8443. In a second terminal:

```sh
pnpm test:https
openssl x509 -in .local/https/root-ca.crt -noout -fingerprint -sha256
```

Expected test output: CA-verified TLS and workspace/config pass, signed-out session
401, challenge cookie has Secure/HttpOnly/SameSite=Strict/Path=/ and `__Host-` prefix,
and the old HTTP Origin is rejected. The test discards the challenge body, signs
nothing and creates no session. Its account string is only a synthetic challenge
fixture; no wallet account or access key is created. It is a Node TLS-client test,
not proof that Android Chrome has installed/trusted the certificate.

The API now binds **https://127.0.0.1:8443** and disables the insecure HTTP exception.
Old HTTP-origin sessions/challenges cannot be used at the new origin. Existing
organizations/agent records remain in the preserved database. `.env` is unchanged.
Use the HTTPS URL for wallet testing; the HTTP workspace no longer has matching
origin configuration. No certificate-validation bypass (`-k`, ignoreHTTPS errors,
browser warning bypass) is permitted as acceptance evidence.

## Connect and trust the test CA on Android

1. Enable a screen lock, Developer options and USB debugging on the test phone.
   Connect USB, unlock it and approve debugging for this trusted computer.
2. With exactly one USB Android device attached, run:

   ```sh
   adb -d get-state
   adb -d push .local/https/root-ca.crt /sdcard/Download/avroqen-local-ca.crt
   adb -d reverse tcp:8443 tcp:8443
   ```

   Expect `device`. If unauthorized, approve the computer on the phone. If multiple
   devices are attached, disconnect extras. Do not collect device serials as evidence.
   **Transfer only `root-ca.crt`. Never transfer `root-ca.key`, `server.key`, `.env`,
   the whole `.local` directory, wallet secrets or session data.**
3. On Android, open Settings → Security & privacy → More security settings →
   Encryption & credentials → Install a certificate → **CA certificate**.
   Labels vary by Android vendor/version; search Settings for “CA certificate”.
   Select `avroqen-local-ca.crt`. Confirm only the dedicated test CA named
   **Avroqen local acceptance CA**. Compare its SHA-256 fingerprint with the Mac's
   public-certificate fingerprint where Android exposes certificate details.
   This is a deliberate user-trust installation, not a wallet operation. It grants
   trust to certificates signed by this local test CA; remove it after testing.
   No system trust store was modified automatically by the setup scripts.
4. Restart Chrome if needed; visit **https://127.0.0.1:8443/workspace**.
   Inspect Chrome's site/certificate information. There must be no certificate
   warning, and the issuer/chain must match the installed local CA. Record versions,
   certificate trust result and the visible origin only. Do not bypass a warning.
5. If device management prevents CA installation, Chrome does not trust user CAs,
   USB forwarding fails, or Meteor requires an unsupported mobile bridge/flow,
   record **BLOCKED**, including the non-sensitive error category. Do not weaken
   Origin, cookie, key-permission or certificate validation to turn it into a pass.

Only this phone's USB loopback port is forwarded. `127.0.0.1` on the phone otherwise
means the phone, not the Mac. Do not forward 3001/55432 or expose Docker to the LAN.
The wallet provider and NEAR RPC still require their normal internet access.

## Exact human acceptance steps

Start a fresh challenge for every attempt; wait at least a minute if rate limited.
Use only existing accounts and message signing. Stop if asked for AddKey, a transfer,
transaction, deposit, fee or private key in Avroqen.

| Case | Human steps | Expected observation; what it does not prove |
| --- | --- | --- |
| A01 Trust/config | Open the exact HTTPS URL and inspect site information | Trusted certificate, testnet UI, sign-in enabled; a Node check does not substitute for this |
| A02 Login | Enter existing account A, choose Connect wallet & sign message, select A in Meteor, inspect the NEP-413 message, approve only that message | Account A, testnet, HTTPS origin/recipient, challenge ID and expiration are correct; app displays signed-in A; no transaction/key-creation request |
| A03 Cancellation/retry | Log out if signed in; start login and cancel Meteor's **signing** prompt; then retry with a fresh challenge and approve | Neutral “Wallet sign-in canceled. No transaction was sent.”, signed-out UI, retry enabled; retry succeeds. Note popup vs browser return behavior separately |
| A04 Logout | Log out, refresh, then navigate to `https://127.0.0.1:8443/api/auth/session` | Signed-out UI and HTTP 401 / SESSION_REQUIRED. Do not copy the body if it unexpectedly returns a session. Retained-cookie server revocation is automated evidence, not inferred from the UI |
| A05 Persistence | Sign in as A, create/select a non-sensitive test org, register an agent record, disable it, refresh; log out/in again | Org and agent persist; disabled status persists. No onchain permission revocation or agent execution is claimed |
| A06 Second-wallet isolation | While A is logged in, note its public org UUID from the selected option/API request path; log out; sign in with a different **existing** testnet wallet B with no membership in A's org | A's org absent from B's list. Open `https://127.0.0.1:8443/api/organizations/ORG_UUID/agents` as B: HTTP 403 / ACCESS_DENIED. Register/disable mutations are separately covered by automated role/tenant tests |
| A07 Browser cookie enforcement | With USB Chrome remote debugging (`chrome://inspect/#devices` on desktop), inspect cookie **attributes only** after challenge/login | `__Host-avroqen_login` then `__Host-avroqen_session`, Secure, HttpOnly, SameSite=Strict, Path=/, no Domain. Never screenshot values, cookie headers or auth response bodies |

For A06, if only one account is available or B already belongs to the organization,
mark pending and choose another existing eligible account later. Do not create a
privileged wallet key, provision a new account, or change memberships for this test.
An incognito tab with the same wallet account is not second-wallet isolation.
A second phone is optional; wallet B can be used sequentially on the same phone.
Do not reveal seed phrases or restore/export keys to move a wallet onto this device.

If Meteor opens only a native-app/bridge handoff that the current connector cannot
complete, leave A02/A03 pending or blocked. Desktop success, Android viewport tests,
and an HTTPS landing-page pass are not proof of supported Android wallet login.
iOS Safari needs its own private connectivity/trust plan; Android `adb reverse`
does not establish iOS support.

## Record results without sensitive evidence

For each case, record: PASS/FAIL/BLOCKED/NOT RUN, UTC time, tested source revision,
Android/Chrome/Meteor versions, HTTPS origin, account alias A/B, action, visible
result, HTTP path/status/fixed error code, and optional cropped/redacted app image.
Do not retain HARs, raw console logs, proof bodies, nonces/signatures, cookies,
session/CSRF tokens, `.env`, TLS private keys, wallet backups or device serials.
Human observations belong in the manual ledger, separate from automated tests.
Independent security review must be signed off by someone independent of this work.

## Stop/clean up and certificate lifetime

```sh
adb -d reverse --remove tcp:8443
adb -d shell rm /sdcard/Download/avroqen-local-ca.crt
```

Remove **only Avroqen local acceptance CA** under Android's user trusted credentials;
do not clear all system/user certificates. Turn off USB debugging if desired.
Stop the proxy with Ctrl-C in its terminal. To return explicitly to HTTP development:

```sh
docker compose -f compose.yaml up -d --wait
```

This changes the origin again and invalidates prior-origin app sessions. Do not
add `--volumes` or delete the database. The TLS leaf lasts 7 days, CA 30 days;
`setup:https` reuses a valid installation and refuses a near-expired/incomplete one.
Before regenerating, stop the proxy, remove the old CA from the phone, and remove
only `.local/https`; rerun setup and re-install the new public CA. Never upload or
commit this directory. Existing `.local/https` is mode 0700 and keys mode 0600.

## Current evidence status

Owner confirmed Android NEP-413 login with B, organization/agent persistence and
persistent disabled state, logout/refresh, signing cancellation/retry, second-wallet
list/direct-read isolation, and remote DevTools TLS/session-cookie attributes.
See the [current manual ledger](WALLET_ACCEPTANCE.md#current-manual-evidence--owner-confirmations-2026-11-01)
and [the historical M1 report](../../archive/milestones/M1_REPORT.md) for evidence limits. This supersedes earlier NOT RUN statuses for
those observed flows only. iOS is DEFERRED by owner. Independent review is pending.

No-Domain/host-only and challenge-cookie lifecycle checks are automated with actual
API response headers; do not infer a sent Domain attribute from the DevTools Domain
column. The remaining safe procedures are in
[NEGATIVE_AUTH_CASES.md](../../security-review/m1/NEGATIVE_AUTH_CASES.md). Timed negative
wallet cases and popup variants are not marked manually passed.

If site reachability is lost after reconnecting USB, confirm `adb -d get-state`,
then reapply `adb -d reverse tcp:8443 tcp:8443`. Check command exit status; empty
forwarding output alone may reflect an ADB failure. Verify the host with
`pnpm test:https`. Do not reinstall the CA or bypass certificate validation merely
to troubleshoot transport. No public tunnel or LAN exposure is needed.
