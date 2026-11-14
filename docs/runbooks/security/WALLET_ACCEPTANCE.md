# M1 real-wallet acceptance runbook

Historical M1 review context: `feat/m1-identity-access`, then-draft PR #5 targeting `staging`.
Historical baseline before the reviewed fixes: `1026b0b5e9e7f2a4e3766ce9bec104a262d6838e`.
These references do not establish current PR status; no fresh PR-status check is claimed.
The owner confirmed the desktop observations in the ledger below using Meteor
Wallet on NEAR Testnet with `ajayfrizzy.testnet` at the loopback workspace URL.
These are human-reported results, not agent-performed wallet interactions. Exact
browser/wallet versions and individual observation timestamps were not supplied.
Automated security evidence is separate in ../../archive/milestones/M1_REPORT.md. No transaction was needed.

## Current status — Step 108J

**Primary-key proof BLOCKED; temporary Testing key RETAINED. Financial operations remain disabled.** The owner has stopped continuation or activation of the private transformed-MeteorConnect browser integration for this one-time proof. Existing source/tests and the preparation/procedures below are preserved as historical research, not a production-ready or authorized signing workflow. The [architecture decision D026](../../DECISIONS.md#d026--primary-proof-blocked-private-browser-integration-stopped) records the unresolved bundling/Node/dynamic-compilation, realm/custom-element and hosted-origin concerns and the required safe Node verifier boundary.

Prefer investigating Meteor's supported public off-chain message-signing interface only if a future proof is required; it remains unverified and grants no signing authorization. A separately reviewed and explicitly authorized verification method is required before reconsidering the block or Testing-key retention. No live Primary control, independent security audit or Testing-key retirement readiness is claimed. The historical PR #5 ledger below is separate from this current status.

## Primary-key control verification proposal — November 7, 2026

**REVIEW ONLY — no executable signing flow is provided or authorized.** The isolated preparation modules are implemented below; the owner must review the full diff, rendered challenge and transport approach before any real signing entrypoint is produced or enabled. No live wallet, Keychain, private key, signature or signed transaction file was accessed for this review. Deployment evidence remains in [the existing deployment report](../../DEPLOYMENT_KEY_GATE_REPORT.md#owner-verified-testnet-deployment--november-7-2026). Financial operations remain disabled. This is source/self-review, not an independent security audit.

### Existing code findings

- `apps/web/app/workspace/wallet.ts` uses pinned **@meteorwallet/sdk 3.24.1 MeteorConnect**, not a directly imported wallet-selector instance. `signChallenge` creates `near::sign_in_and_sign_message`, passes message/recipient/decoded nonce and challenge ID as `state`, disables logging/mobile bridge, uses memory storage and rejects application key custody. It supplies no contract, addFunctionCallKey or transaction actions.
- The installed SDK's `dist/index.d.ts` exposes legacy `signMessage` returning `accountId`, signing `publicKey`, base64 `signature`, optional `state`; its MeteorConnect `near::sign_message` and combined sign-in action hydrate `SignedMessage` into a PublicKey object and 64-byte signature. `dist/index.js` converts the wire key/signature accordingly. Thus the signing key is available for cryptographic verification, but a returned key string alone is an untrusted claim. No reviewed input pins the signing key: account selection is not Primary-key selection. If Meteor signs with Testing, reject; do not rotate/export/import keys or retry automatically.
- Neither `SignedMessage` nor `normalizeWalletProof` returns message, nonce, recipient or callback. The original challenge must be retained independently. `normalizeWalletProof` returns only accountId/publicKey/base64 signature and discards state. SDK code can restore state from the request; state is correlation metadata, **not signed evidence**. Challenge ID must be inside the signed message.
- `apps/api/src/identity/crypto.ts`: `messageDigest` serializes NEP-413 tag **2147484061**, UTF-8 length-prefixed message, exactly 32 nonce bytes, recipient and optional callback, then hashes SHA-256. `verifyMessage` validates Ed25519 key/signature encoding and length and uses Node crypto Ed25519 verification over that digest. It cryptographically binds the exact original challenge to the supplied key. It does not check freshness, account ownership or a particular Primary key by itself.
- `apps/api/src/identity/routes.ts`: login uses a random UUID and 32 random nonce bytes, a five-minute server-stored challenge bound to account/network/origin/browser cookie, empty callback, signature verification and injected key verification. Atomic expiry/unused checks consume the challenge once before session issuance. `apps/api/src/index.ts` wires `fullAccessVerifier(config.network)`; that verifier queries the **supplied key** under the supplied account at `finality: final` on fixed network RPC and requires literal `FullAccess`. This is more than account-ID matching, but **any qualifying FullAccess key, including Testing, can log in**. The API response does not expose the verified public key, though the session row stores it. Ordinary successful login cannot establish Primary-key control.
- The existing permission helper does not verify RPC chain ID, a pinned block timestamp/age, result block consistency, or the complete key set. The special procedure must add these checks without weakening or changing normal authentication.
- The installed SDK's legacy popup listener forwards `event.data` without checking `event.origin` and `event.source` at that listener (`ComWindow`); outbound messages do use the wallet origin. The existing privacy patch removes two logs, not this transport concern. See [the existing compatibility review](../../archive/investigations/METEOR_DEPLOYMENT_COMPATIBILITY.md). A valid signature still proves the matching key signed the challenge, but this listener does not establish trusted wallet-response provenance. Source/origin-bound transport and spoof-response regression tests must be reviewed before enabling the proposed flow. Extension transport is not established as a safe substitute by this review.

### Exact challenge text proposed for owner review

Intended recipient: **`https://127.0.0.1:8443`**, the existing private HTTPS origin. This is a proposal, not a claim that the service is running or its certificate is trusted. Do not change live configuration. If another recipient is needed, revise and review the text first. Do not send this challenge to `/api/auth/verify`: it must grant no application session or authority.

The following is the exact UTF-8/LF template (no trailing newline). Braced fields are not literal signing text. After approval, a separate reviewed implementation would insert fresh values and show the fully rendered exact text to the owner before any signing. No live challenge has been issued; there is no signature to inspect.

```text
Avroqen Primary-key control verification v1 — OFF-CHAIN TEST ONLY.
This message proves signing control only. It grants no login session, transaction, transfer, deployment, access-key change, policy authorization, mandate, attestation, or financial authority.
Account: avroqen-vault.testnet
Network: testnet
Expected signing key: ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz
Recipient: https://127.0.0.1:8443
Test ID: 4c2d686b-ca7f-4fc2-98c2-aeb73e51c552
Challenge ID: {fresh UUID}
Nonce (base64, 32 random bytes): {canonical nonce base64}
Issued at: {UTC ISO-8601 timestamp}
Expires at: {issued at plus 5 minutes, UTC ISO-8601 timestamp}
Purpose: Verify this exact Primary key has FullAccess on this Testnet account at a fresh finalized block. Do not submit this message or signature as a transaction.
```

NEP-413 parameters must independently use this exact rendered message, the same 32 nonce bytes, recipient `https://127.0.0.1:8443`, **no callback URL** (verifier `callback_url: ""`, Borsh option None), and challenge ID as optional correlation state. Network and expected key are explicitly in the signed message because NEP-413 has no separate signed network/key fields. The test ID above was generated for this proposal; it is not an issued nonce or transaction identifier.

Freshness design: generate nonce with Node `randomBytes(32)` and challenge ID with `randomUUID()` only after review, using existing dependencies. Store the immutable exact challenge, intended key/account/network/recipient, issue/expiry times and unused status in the local verifier's dedicated test state. Strict canonical base64 must decode to exactly 32 bytes; reject duplicate nonce/ID. Accept only within `[issuedAt, expiresAt)` with at most five seconds future clock skew, a maximum five-minute lifetime and a trusted local clock. Recheck expiry after RPC and atomically consume once on successful verification; concurrent/replayed results must fail. Invalidate on cancellation/timeout or state loss, do not reissue the same nonce, and require a newly reviewed attempt after failure. No current authentication schema or existing challenge is repurposed.

### Proposed owner-operated procedure after review and separate authorization

1. Review the implementation diff and rendered challenge before enabling any prompt. Verify trusted HTTPS and exact recipient, Testnet and target account. The UI must offer only this message operation and show the expected Primary key. Cancel any transaction, access-key permission, fee, key export/import or unexpected origin request. No signing commands are provided here.
2. A future isolated local verification tool would retain the immutable challenge and invoke only the existing message-only connector once, with no automatic retry, key store, persistent signature logging, transaction imports, app session issuance or financial integration. Keep proof material local to the owner's browser/verifier; never paste signatures into chat or commit them.
3. Treat the wallet result as untrusted. Require exact account **avroqen-vault.testnet**, and exact normalized key **ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz** before cryptographic verification. Do not infer the signing key from an account's key list, wallet label, first key or successful login. Verify using `verifyMessage` with the independently stored challenge and the expected Primary key. A Testing signature must fail even if Testing is FullAccess. Reject malformed proof or any field substitution; do not trust state as a signature binding.
4. Read-only RPC design: fixed `https://rpc.testnet.near.org`, no redirects; verify `status` reports `chain_id=testnet`, fetch `block` at finality final, require block timestamp within 120 seconds and at most five seconds future skew. Pin `view_access_key` for **the expected Primary key** under **avroqen-vault.testnet** and `view_access_key_list` to that block hash; validate response IDs/shapes, block hash/height consistency and literal `FullAccess` for Primary. Check the list against the owner-approved Primary+Testing set documented in the deployment gate; stop on a missing, restricted, substituted or third key. Do not assume the last deployment observation is fresh. Recheck block age and challenge expiry when finishing. RPC errors/mismatch/staleness mean NOT VERIFIED, never fallback success.
5. Only after both cryptographic verification and finalized permission checks pass, consume the challenge atomically and report **PRIMARY_KEY_CONTROL_VERIFIED_AT_FINALIZED_BLOCK** with public account/key/network, challenge ID/digest, verification time and block hash/height/permission. Retain no raw signature in reports. Record signature-valid and permission-valid separately on failure. This proves signing control and observed permission for that challenge/block, not exclusive human custody, immutable future permissions, wallet integrity, an independent audit or authorization for future actions. RPC authenticity remains an HTTPS/provider trust assumption; a stronger independent-provider check can be separately reviewed.

### Implemented isolated preparation — November 7, 2026

No UI, server, CLI entrypoint, application route, session issuer or wallet invocation was added. Importing these modules starts no RPC or filesystem access. `createPrimaryVerifier` requires an explicit fetch implementation, fixes account/Primary/Testing in source and accepts no network, recipient, account or key override. The generic engine exists internally for fixture-key testing; it is not the production-facing factory. No new dependencies or existing authentication/financial features changed.

- `scripts/primary-key-verification/verify.ts`: fixed production policy and isolated factory.
- `scripts/primary-key-verification/core.ts`: exact template rendering, Node CSPRNG issuance, frozen challenge records, five-minute expiry and clock-rollback rejection, reused nonce/ID rejection, one-time synchronous claim before any await, cancellation and terminal failure/success. Signature verification reuses the existing NEP-413 implementation. Only the stored challenge is verified; extra proof fields are rejected. Local state is process memory, capped at 128 records without evicting replay tombstones. Restart loses challenges and cannot resume a proof; this is deliberately **single-process**, not a distributed or durable store. Consumer code must not create multiple verifier instances for one challenge. Reports contain the NEP-413 digest and public block evidence, never signatures or login tokens. Failures expose only fixed error text and signatureValid/permissionValid diagnostic flags; flags are not a partial verification success.
- `scripts/primary-key-verification/rpc.ts`: only status/block/account/key-list/exact-Primary key read queries, fixed Testnet HTTPS endpoint, no redirects, four-second request abort signals, response-envelope validation, finalized block age at fetch and completion, pinned hash/height for all queries, exact two distinct FullAccess keys and matching Primary nonce. The checked malformed, unsafe-integer, missing or inconsistent responses fail closed. Research-only parsing limitation: `response.json()` does not reject duplicate object keys, and the envelope permits extra fields. Duplicate-key rejection and a strict field policy require separate review and adversarial coverage before any future execution; live RPC readiness is not established. No contract method is called. Error text/provider data is not propagated from the verification boundary. HTTPS RPC authenticity remains a provider trust assumption; no independent-provider quorum is implemented.
- `scripts/primary-key-verification/popup-guard.ts`: **unwired candidate**, not an applied SDK patch. It validates the exact popup object, connection UID and an immutable, explicitly reviewed origin/status route map, rejects unexpected network/operation metadata, blocks premature success and duplicate terminal callbacks, supports cancellation/expiry/clock rollback and isolates consumer errors. It supports separately reviewed HTTPS or exact extension-scheme origins without wildcard/suffix matching or learning origins from incoming messages. Synthetic extension origins in tests are not approved real extension identifiers.
- `tests/fixtures/primary-key.ts`: ephemeral fixture Ed25519 pairs, independent Borsh signature serialization and mock-only RPC. `tests/unit/primary-key-verification.test.ts`, `tests/unit/primary-challenge-randomness.test.ts`, `tests/integration/primary-key-verification.test.ts` and `tests/adversarial/primary-popup.test.ts` exercise the preparation. No real Primary or Testing signature is generated or used.

### Inspected transport and narrowly scoped fix design

Pinned installed SDK 3.24.1 source inspected: `dist/index.js` SHA-256 **fa86d0a665cd4c49984524fcd3524bb2f3ae88ec3f02495865a70a2e48766c1e**, `dist/index.cjs` SHA-256 **be6c782147f106a329c8e4bd74dd5786980078b559c292b1f93e47c1f02bd4c6**. These describe local source inspection, not a new package approval or live transport verification.

`ComWindow` opens the configured base URL's `/connect/<network>/<action>` in a popup. The default is `https://wallet.meteorwallet.app`; SDK configuration, the `DEV__METEOR_WALLET_BASE_URL` localStorage setting and forced localhost targets can select other URLs. Its current global message listener passes `event.data` without source/origin validation. The messenger correlates `data.uid` and statuses, not browser provenance. The popup WindowProxy can survive navigation; a matching source alone is insufficient. Outbound targetOrigin does not authenticate inbound responses. The installed hosted wallet's possible redirects and extension-popup responses were not observed, so **a blanket single-origin patch is not asserted compatible**.

There are distinct injected-extension paths: implicit `window.meteorCom.addMessageDataListener(listener)` with `sendMessageData`, and forced `v1_ext` using `window.meteorComV2.sendMessageDataAndRespond` then directly calling the stored listener. These are callbacks/promises, not MessageEvents carrying trustworthy event.origin/event.source. Mobile v2 bridge is a separate transport and remains out of scope. Do not fabricate event metadata from a callback payload or accept the page origin as extension authentication.

Proposed future SDK integration: isolate this test's message action and connection lifecycle, capture the actual returned popup WindowProxy, wrap the inbound listener with the tested guard, register only the reviewed origin/status routes for the selected transport, and remove the listener/close the guard on every terminal, timeout, cancellation or popup-close path. Reject localStorage/config URL substitution, stale connection reuse, unexpected transport fallback and unapproved redirects. Retain exact cryptographic verification afterward; UID/state is correlation only. Each actual responding origin and allowed handshake/terminal role must be reviewed; unknown extension IDs/origins block the test. The current candidate has **no default enabled route profile** and is not attached to any event listener.

Injected extension callbacks require a separate reviewed authenticated transport adapter and tests; this popup guard cannot secure them. A future owner-approved test may select a reviewed popup-only mode that refuses injection/fallback, or remain blocked until extension provenance is established. Neither choice changes the existing app in this preparation. Applying a global SDK patch, changing wallet selection, or enabling any prompt requires owner review of its exact diff. Hosted wallet behavior, extension implementation integrity and host/page compromise remain unresolved risks. A valid Primary signature proves key control for this exact challenge; it does not establish exclusive human custody or an independent security audit.

### Step 108F — isolated popup-only adapter preparation

**Preparation only; live integration remains blocked.** `popup-preparation.ts` fixes the real Primary verifier and overrides the event predicate with `nativePopupEvent`. Its `REVIEWED_HOSTED_RESPONSE_ORIGINS` is deliberately an empty frozen array. No real hosted response origin is approved by this change, including the expected wallet base. Session execution through this facade stops before SDK evaluation, popup opening or RPC. Challenge issuance is only a library capability, as in the existing isolated verifier; no live challenge was issued in this task. There is no browser loader, server, app route, prompt UI, build configuration change or executable command for signing.

New `sdk-preparation.ts` is an offline, CJS-source-hash-pinned transformation recipe. It reads no files and evaluates/writes nothing itself. It accepts only the previously inspected SDK source hash, and produces a private factory body with these changes:

1. Remove the entire legacy `ComWindow`/`MeteorPostMessenger` region and module singleton, replacing `getMeteorPostMessenger()` with the injected per-proof messenger. The original unguarded listener is **absent**, not supplemented with a second listener.
2. Reject any present `DEV__METEOR_WALLET_BASE_URL` override and freeze the production wallet base. The source is separate; installed SDK files are untouched.
3. Restrict the V1 client's target enumeration to this combined message action and `v1_web` only. The returned wrapper initializes memory storage/mobile-disabled/no-key-custody configuration, asserts that target list and invokes **`action.execute("v1_web")`** directly. It exposes no SDK exports or transaction/session methods to its caller. The installed app login continues using the original package.

New `popup-session.ts` owns one messenger, one popup, one listener and one timer per attempt. It validates the challenge against `verifier.getChallenge()` before doing I/O; no caller-provided nonce/message/purpose/recipient/callback replacement can be prompted. It validates the actual SDK request's exact messageParams, no access-key options, **`actionType: login`**, Testnet and explicit `v1_web`. The URL is pinned to `https://wallet.meteorwallet.app/connect/testnet/login`; pageUri contains only the approved recipient, not the current browser URL. No extension, localhost target or fallback exists in this messenger.

The native predicate requires a local native `MessageEvent`, type `message` and `isTrusted`; the session then requires the captured WindowProxy, exact origin and UID. Unrelated windows/synthetic events/wrong UID are ignored. Native responses from that popup at an unreviewed origin terminate the proof. Unknown status/wrong action/network metadata from the correlated popup fail closed. Missing optional echo metadata is not treated as evidence: the fixed request and exact cryptographic challenge remain authoritative. No origins are inferred from redirects, payloads or extension callbacks.

**Terminal-first success:** the inspected SDK accepts `closed_success` while its connection is still `initializing`. The guard now matches that behavior instead of requiring a `connected` prelude. It still requires the same native provenance/origin/source/UID and never treats the terminal payload alone as Primary proof; normalized output must pass the existing isolated signature/permission verifier. `attempting_reconnect` retransmits the same initializing request/nonce/UID to the same popup; it does not invoke another SDK action, create a new window or issue a new challenge. Hosted-wallet handling of repeated messages for one UID has not been observed. Duplicate terminals are stopped before callbacks. Error/cancellation/disconnection, expiry, clock rollback, popup closure or configuration override close the attempt and cancel its challenge.

Timeout is the earlier of **120 seconds from transport start** and the challenge's five-minute expiry. Every event/send and final result rechecks time; the 500 ms polling timer also detects popup closure/timeouts. Cleanup closes the guard, removes the listener, clears the timer and closes the popup on success/failure; cleanup failure prohibits success. A session can run only once. RPC occurs only after terminal transport cleanup and signature normalization; no `/api/auth/verify`, application session, contract call or financial operation is invoked.

**Fixture evidence and remaining blockers:** `tests/fixtures/primary-popup.ts` evaluates the transformed actual SDK in a fresh Node VM/module for each proof, with only mock popup/event/timer ports, fixture signatures and mock RPC. UI element registration is explicitly mocked because SDK/Lit dependencies otherwise share a custom-element registry across evaluations. Native event provenance is represented by a fixture-only event brand; the actual predicate separately rejects synthetic MessageEvents. These are not browser/live-origin tests and Node VM is not a security sandbox.

`tests/integration/primary-popup-sdk.test.ts` covers actual combined-action serialization/normalization, explicit popup selection even in a development fixture, no original listener or extension API access, terminal-first/connected-first success, reconnect, source-hash mismatch, blocked public facade and Testing rejection. `tests/adversarial/primary-popup-session.test.ts` covers spoofing, unreviewed response origins, cancellation/closure/timeout/expiry, wrong operation/nonce/recipient/callback/purpose/transport, stale RPC, simultaneous isolated sessions, replay, concurrent consumption and cleanup failure. Existing `primary-popup.test.ts` expectations were corrected for login and SDK-compatible terminal ordering; signed challenge text is unchanged.

**Step 108F validation:** `pnpm check` passed: lint, root/web typechecks, **253 unit + 66 integration + 75 adversarial = 394 tests**. The workflow checker and redacted source secret scan passed. SDK ESM/CJS SHA-256 remain unchanged from the inspected values. New tests exercised only fixture challenges/signatures and mock wallet/RPC ports; native browser/live-hosted acceptance is pending. Git whitespace and documentation link/fence checks passed.

Before any real entrypoint, the owner must review this full source transformation/session diff and actual rendered fresh challenge, and approve a separate browser loading/provenance approach. No production browser evaluator or bundler integration is provided. A future loader must use a separately scoped document/realm rather than import another SDK copy beside existing auth: Lit custom-element registration can share or modify registered components in the same document. It must also provide reviewed native browser ports, CSPRNG UIDs, trusted HTTPS and a safe local verifier boundary; the current verifier is Node-only. Actual hosted response origins/redirect behavior remain unknown and blocked. Cross-origin navigation itself cannot be exhaustively inspected through a WindowProxy: this adapter rejects unreviewed response origins or times out silently redirected windows, and does not claim to detect every navigation. No guessed extension origin is approved. No independent audit or live Primary proof is claimed.

### Step 108H — actual lookup contract and challenge ownership

Read-only inspection found `getChallenge(id)` already present in the actual working-tree `core.ts` (lines 101–105 at review). It returns the same frozen challenge only when its local entry is `issued` and its original five-minute lifetime has not expired. It issues no replacement, refreshes no nonce/timestamp, consumes nothing, and rejects missing/cancelled/verifying/closed entries. Expired records fail; clock rollback fails closed rather than reviving them. **No replacement method or core state-machine change was needed.**

Why prior typechecks passed: `verify.ts` returns `createEngine` directly with its inferred complete return type; the fixture harness also calls the actual `createEngine` and does not add a mock lookup. Root `tsconfig.json` includes `scripts/**/*.ts` and `tests/**/*.ts`. `tsc --noEmit --listFilesOnly` confirms core/verify/popup-session/popup-preparation and fixtures are in the root project. The separate web project does not prove these scripts browser-compatible. The preparation sources remain untracked in Git, so a committed-only or earlier source snapshot is not the current workspace; the independent review's exact snapshot was not supplied and cannot be reconstructed from this inspection. The current source supports the reported typecheck result; an absent required lookup would not satisfy the session contract.

`verify.ts` now exports a canonical `PrimaryVerifier` type inferred from the real factory. `popup-session.ts` derives its required methods from that type rather than maintaining a separate handwritten interface. The new type regression asserts both that the real verifier satisfies the session contract and that a verifier with `getChallenge` omitted does not.

A related actual gap was repaired: field equality alone previously accepted an exact caller-created copy of an issued challenge. The session now additionally requires **the original frozen object returned by the same verifier instance** (`challengeInput === stored`), retaining exact field/shape checks before SDK evaluation or popup opening. Caller-created copies, foreign-instance challenges, changed nonce/recipient/callback/expiry/purpose and deceptive serializers are rejected. The session still copies the approved data into its internal frozen snapshot and builds handshake inputs from that snapshot. No application authentication or financial code changes.

`tests/unit/primary-challenge-lookup.test.ts` covers immutable same-object repeated reads, no issuance/consumption/replacement/refresh, missing IDs, expiry boundaries, cancellation, verifying state, mid-flight cancellation, closed success/failure, replay, same-policy cross-instance lookup and clock rollback. Popup adversarial regressions reject exact clones and altered/foreign challenges before any SDK factory/popup/RPC call. Existing successful SDK fixtures pass the actual issued object from their real fixture engine.

**Browser/build assumptions remain unresolved and live loading stays blocked:**

- `core.ts` uses Node crypto; the isolated verifier is not a browser module. `popup-session.ts` uses free `Buffer` references for nonce conversion; the generated SDK wrapper and installed CJS SDK also use `Buffer`. Root `types: ["node"]` makes these names typecheck; it does not provide a browser runtime or polyfill.
- The SDK recipe is generated CJS function-body text using `require`/`exports`, not a browser bundle. TypeScript does not compile/check the JavaScript inside that string. Its fixture VM supplies Node `Buffer`, require, crypto and timers, and mocks UI registration. The added no-Buffer regression fails closed before popup/RPC, explicitly demonstrating that VM success is not browser compatibility. No polyfill, dependency, loader, bundler configuration or installed SDK change is introduced.
- A future browser/local-verifier bridge must preserve issuance authority in the owner verifier process; serialized/cloned challenge objects cannot be passed back as authoritative session inputs. Dedicated document/realm isolation, native event/WindowProxy behavior, dependency/CSP/bundle evaluation and actual hosted response origins still require review. The real response-origin allowlist remains empty. No signing/browser entrypoint, live challenge, wallet call or independent audit is claimed.

**Step 108H results:** `pnpm check` passed: lint, root/web typechecks, **264 unit + 67 integration + 81 adversarial = 412 tests**. The focused lookup/popup suites passed 62 tests. Source secret scan, documentation link/fence checks and Git whitespace validation passed. Installed ESM/CJS SDK hashes are unchanged. No browser loading, live challenge, real signing or hosted CI result is claimed.

### Fully rendered review specimen — not an issued challenge

The following exact output was rendered locally from the production policy with a **deterministic fixture nonce/ID and expired fixture timestamps**. It is for reviewing the complete human-readable text only and must never be signed. A future reviewed flow must generate fresh CSPRNG values and show its actual complete challenge before any authorized prompt. Code/template review does not authorize signing this specimen or any later challenge.

```text
Avroqen Primary-key control verification v1 — OFF-CHAIN TEST ONLY.
This message proves signing control only. It grants no login session, transaction, transfer, deployment, access-key change, policy authorization, mandate, attestation, or financial authority.
Account: avroqen-vault.testnet
Network: testnet
Expected signing key: ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz
Recipient: https://127.0.0.1:8443
Test ID: 4c2d686b-ca7f-4fc2-98c2-aeb73e51c552
Challenge ID: 00000000-0000-4000-8000-000000000001
Nonce (base64, 32 random bytes): ERERERERERERERERERERERERERERERERERERERERERE=
Issued at: 2026-11-07T00:00:00.000Z
Expires at: 2026-11-07T00:05:00.000Z
Purpose: Verify this exact Primary key has FullAccess on this Testnet account at a fresh finalized block. Do not submit this message or signature as a transaction.
```

### Validation commands and evidence

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:adversarial
pnpm test:workflow
git diff --check
```

New coverage includes independent fixture-key/Borsh success; valid Testing-analogue signature and wrong expected-key claims; account/network/purpose/test/challenge/time/nonce/recipient/callback substitution; malformed and extra proof fields; CSPRNG failure and nonce/ID collisions; expiry boundary/clock rollback; cancellation, concurrent replay and state loss; RPC network/envelope/error/timeout/missing/restricted/third/duplicate keys, nonce inconsistency and block hash/height/age mismatch; exact freshness boundaries and reversed approved key order; spoofed popup source/origin/UID/operation, explicit two-origin routing, unapproved redirects, reentrant/duplicate terminal results and consumer failures. Production-policy tests reject fixture signers without any RPC. A real Primary positive test is intentionally absent: it requires separately authorized owner signing, which has not happened here.

**Preparation results:** repository lint and root/web typechecks passed; **253 unit + 59 integration + 38 adversarial = 350 tests passed**. Offline pinned workflow validation passed; redacted source secret scan found no leaks. Initial integration execution hit sandbox loopback `EPERM`; the unchanged fixture suite passed with local-listener permission. Workflow/secret containers required Docker permission and then passed. Markdown link/fence checks and Git whitespace validation passed. No Rust/contract, database or live-wallet acceptance is claimed by these checks.

Existing `tests/database/identity.test.ts` coverage remains separate; no database schema/session code changed, and no database service/configuration is needed for this isolated preparation. Fixture/mock results are not live Primary-control evidence. No public RPC, wallet, protected deployment directory or sensitive contents were accessed by these tests. No commit or push is authorized.

## Private Android HTTPS follow-up

A separate [Android HTTPS guide](ANDROID_HTTPS.md) now provides a local CA,
loopback-only TLS proxy and USB forwarding steps. The host TLS/secure-cookie
header checks pass; Android user-CA trust, browser enforcement and wallet return
behavior remain pending. Use that guide for Android acceptance instead of the
older HTTP port-3000 USB recipe below. While the HTTPS override is active, the API
requires `https://127.0.0.1:8443`; old HTTP-origin sessions cannot authenticate.
See the separate [security-review evidence package](../../security-review/m1/README.md).

## Start the local environment

Exact desktop URL: **http://127.0.0.1:3000/workspace**.
Use `127.0.0.1`, not `localhost`, a LAN IP or another port: the server binds the
login message and mutation Origin to `http://127.0.0.1:3000`.

Docker Desktop must be running. This machine has Node 24.22.1, pnpm 9.15.9,
Rust 1.96.1 and Android platform-tools (`adb`) installed.

```sh
cd ~/Desktop/avroqen
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
| W07 | Automated replay with isolated fixtures | HTTP 401; no second session | No human proof handling required |
| W08 | Automated substitution of another valid browser cookie | Rejected; no session | No human proof handling required |
| W09 | Logout and reload; separately wait beyond 15 minutes after a new login | `/api/auth/session` 401; privileged operations require login; refresh does not extend expiry | Time to wait; successful login prerequisite |
| W10 | Inspect cookie attributes on loopback HTTP | HttpOnly, SameSite=Strict, Path=/, no Domain; non-__Host names, no Secure is intentional here | DevTools; record attributes only, never values |
| W11 | Inspect cookie attributes and real login over trusted local HTTPS | Secure, HttpOnly, SameSite=Strict, Path=/, __Host- names, no Domain | Trusted local HTTPS; NOT CONFIGURED |
| W12 | Create/select org, register/disable record, reload | Persistently disabled app record; no claim of onchain revocation or new execution rights | One existing wallet is enough |
| W13 | Sign in with wallet B and access wallet A's org URL | Organization absent from B's list; direct org operation denied (403) | Second existing wallet with no membership |
| W14 | Repeat W01/W02/W09/W12 on actual Android Chrome | Correct wallet return, readable UI, correct session/agent behavior | Android device, USB data cable, authorized reverse mapping |
| W15 | Repeat W01/W02/W09/W12 on actual iOS Safari | Correct wallet return, readable UI, correct session/agent behavior | iOS device and trusted private HTTPS origin; Android USB reverse instructions do not apply |

For W07/W08, use the automated synthetic replay/browser-substitution tests.
Do not copy or resend human proof bodies, cookies or signatures. Their automated
passes do not claim manual execution; no additional human proof handling is required.

For W13 note the public org UUID while signed in as A. After logout/sign-in as B,
open `/api/organizations/ORG_UUID/agents` on the same origin (replace ORG_UUID with
that actual public ID). Expected 403. Do not grant B membership for this test.

### HTTPS boundary

The initial preparation had no HTTPS setup. The new private HTTPS follow-up is
now host-verified; see ANDROID_HTTPS.md. W11 remains pending until actual
Android trust and real-browser behavior are observed. The text below describes
the original configuration boundary, not a claim that HTTPS is still unconfigured. A future
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

Results are recorded after the rerun in ../../archive/milestones/M1_REPORT.md. Real PostgreSQL/Ed25519 tests
exercise authorization; browser API responses and wallet/RPC test boundaries are
explicit simulations. A public RPC `status` call confirmed testnet reachability,
not control of any human account/key. Contract checks cover the disabled M0 scaffold;
S01–S20 custody/settlement integration is not implemented in M1 and is not claimed.

## Current manual evidence — owner confirmations, 2026-11-01

These results supersede earlier pending statuses for the listed observations only.
No proof/cookie/token values were collected. Exact Chrome/Meteor versions and most
per-case timestamps were not supplied. All results below are human observations,
not independent review or manual proof of every server-internal check.

| Case | Desktop Chrome/macOS | Android Chrome over private HTTPS |
| --- | --- | --- |
| NEP-413 login | PASS, account A (`ajayfrizzy.testnet`) | PASS, different existing account B (ID not collected); expected testnet/account/origin message confirmed |
| Organization/agent persistence | PASS after refresh and re-login | PASS after refresh and re-login; disabled agent status persisted |
| Logout | PASS, signed-out UI | PASS, signed-out UI after refresh; retained-cookie rejection is automated evidence |
| Signing cancellation/retry | PASS, neutral message and successful retry | PASS, neutral message and successful retry |
| Second-wallet read isolation | Not separately claimed | PASS: A's org absent from B's list and direct agents endpoint showed ACCESS_DENIED; HTTP 403 itself was not separately captured |
| TLS/certificate details | Not separately claimed | PASS: supplied remote DevTools screenshot shows TLS 1.3, 127.0.0.1 subject/SAN, local CA issuer and green main-origin lock; owner explicitly confirmed Inspect targeted the connected phone |
| Session-cookie displayed attributes | Not separately claimed | PASS: Secure, HttpOnly, SameSite Strict, Path / for __Host-avroqen_session |
| Challenge-cookie/host-only metadata | Automated server response checks PASS; no human pass claimed | No additional human metadata inspection claimed; DevTools Domain column alone does not establish a Domain attribute was sent |
| Popup-blocking and actual wallet-window closure | NOT RUN separately | NOT RUN separately |
| Timed expiry / account-mismatch / existing restricted or other-network fixtures | NOT RUN manually; automated server cases pass | NOT RUN manually; automated server cases pass |
| iOS | **DEFERRED by owner**, not passed and not part of current Android verification | — |
| Independent security review | **NOT PERFORMED** | **NOT PERFORMED** |

Desktop origin was `http://127.0.0.1:3000`; Android origin is
`https://127.0.0.1:8443`. The owner reported CA installation and phone reachability;
USB forwarding had intermittent issues before successful testing. No cause beyond
the observed transport state is asserted. Explicit remote-DevTools provenance was
subsequently confirmed and is no longer an open uncertainty.

For remaining cases use [NEGATIVE_AUTH_CASES.md](../../security-review/m1/NEGATIVE_AUTH_CASES.md).
It separates completed automated negatives from real-wallet compatibility procedures.
Do not export or manually copy/replay real authentication payloads to reproduce tests
already covered with synthetic fixtures. Host-only/no-Domain semantics are verified
by route headers throughout issuance and deletion, independently of the human
session-cookie attribute observation. More browser evidence remains optional/pending,
not silently marked passed. At the time of this historical M1 ledger, PR #5 was
draft and unmerged and final M1 acceptance required remaining review/acceptance
decisions. This is not a current PR-status assertion or Primary-key proof.
