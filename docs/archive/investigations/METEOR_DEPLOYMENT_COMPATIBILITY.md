# Meteor deployment compatibility — preview only

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

> **November 6, 2026 safety-gate update:** one-key observations and signer instructions below are historical, not the current deployment authorization. The owner now approves exactly Primary `ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz` AND Testing `ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G`, both FullAccess, for the DEPLOYMENT phase. Only Testing may sign deployment. POST_REVOCATION expects only Primary, after separately authorized removal of Testing. See [current CLI gate, owner commands and receipt/revocation procedure](../deployment/NEAR_CLI_DEPLOYMENT.md) and [fresh evidence/results](../../DEPLOYMENT_KEY_GATE_REPORT.md). No live operation is enabled or authorized. Historical observations remain intact; they must not be used as fresh checks.


Prepared November 5, 2026 (Africa/Lagos). **Compatibility path: BLOCKED for a signing-capable wallet session. The isolated local preview is ready for owner inspection.** No wallet prompt, signature, broadcast, deployment, transfer or key change was performed. No tool or dependency was installed. M6 financial adapters and transaction enablement are unchanged.

PR #15 merged as `a8a697ecc014a2b76eb760fc418a99c32b93f501`; staging [CI 42005209724](https://github.com/Ajayfrizzy/avroqen/actions/runs/42005209724) passed. This work branches from that commit. Final feature SHA and exact-head CI are recorded in the draft PR/delivery, not embedded self-referentially in this document.

## What was established

| Layer | Evidence | Result |
| --- | --- | --- |
| Approved artifact | Archived 366,735 bytes, SHA-256 `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48` | Exact bytes retained; no replacement build authorized |
| Actual pinned SDK | Installed patched `@meteorwallet/sdk` 3.24.1, actual `MeteorWallet.prototype.transformTransactions` and NEAR transaction decode | One ordered deploy/init transaction round-trips full artifact, account, exact init bytes, gas and deposit |
| Serialization size | 366,924 unsigned bytes; 489,232 base64 characters | Within successful local serialization/decoding test; no signature created |
| Browser transport primitive | Chromium MessageChannel structured clone of full SDK-produced payload | Local byte-for-byte delivery; **not** Meteor wallet endpoint/extension acceptance |
| Local review UI | Desktop 1280px and mobile 390px browser tests | Exact terms, historical label, responsive layout, no scripts/wallet buttons/cookies/external requests |
| Actual Meteor transport and review | No wallet invocation permitted in this phase | **NOT TESTED / BLOCKED**; do not infer support from SDK types or NEP-413 login |
| Atomic deploy/init | Existing PR #15 actual Wasm sandbox success and rollback tests rerun | Local sandbox evidence only; not public Testnet execution |

[Exact SDK inspection evidence](../../evidence/METEOR_DEPLOYMENT_INSPECTION.json) includes the patched SDK ESM source digest. Test nonce zero and all-zero placeholder block are used only in memory for serialization; no unsigned envelope is persisted. They are not fresh public transaction parameters. The runtime reviewer does not load the SDK or construct a serialized transaction.

## Actual SDK implementation findings

Inspect `apps/web/node_modules/@meteorwallet/sdk/dist/index.js` (installed source pinned by lockfile and existing privacy patch):

- `convertSelectorActionToNearAction` around lines 8152–8163 maps DeployContract directly to code bytes and FunctionCall to method, parsed bytes, bigint gas/deposit. String args mean **base64**, not raw JSON. The offline probe therefore supplies exact UTF-8 bytes for `{"network":"testnet"}`.
- `MeteorConnectV1Client` around lines 9196–9207 maps action arrays in order into `requestSignTransactions`; `nearActionToSdkV1Action` around 8961–8982 reconstructs FunctionCall and DeployContract. A future connector must verify the resulting exact bytes and force an explicitly reviewed transport; dynamic SDK target selection is not proof of equivalent wallet review.
- `transformTransactions` around 8802–8811 preserves each transaction's action order, binds signer from the connected account, uses a placeholder public key/nonce and an optimistic block. **The wallet completes the signing envelope**; this transport is not the final owner-reviewed signer/key/nonce proof. Our independent account check uses finalized RPC.
- `requestSignTransactions` around 8721–8737 encodes each unsigned transaction to base64 and joins multiple transactions with commas. This proposal has exactly one transaction. It requests action `sign` and returns `executionOutcomes`: it is potentially **sign-and-submit**, with no demonstrated enforceable review-only/cancel-only mode.
- `ComWindow` around 8207–8242 opens `/connect/<network>/<action>` with connection/page metadata. The ~489 KB payload travels in `postMessage` inputs, **not in the URL**. Outbound messages target the wallet origin; the extension path is distinct and untested here. No SDK-side payload limit was found in this reviewed path; wallet-side limits are unknown.
- The legacy web message listener around 8227 forwards `event.data` without validating `event.origin` or `event.source` at that listener. A connection UID alone is not equivalent to validating the wallet window. This is a concrete transport trust concern for a future deployment connector, not evidence of a successful exploit or unauthorized transaction. The isolated preview imports none of this code. Before enabling a signing-capable review, require source/origin-bound responses with regression tests or a separately reviewed supported transport. Do not modify or bypass M6 as a workaround.

This is a scoped source/self-review, not an independent security assessment. The hosted wallet implementation and its actual deployment review screen were not inspected dynamically. SDK encoding and a successful MessageChannel test cannot prove that Meteor exposes the bytecode digest, full actions or exact arguments to a human.

## Reviewer isolation and validation

See [usage instructions](METEOR_DEPLOYMENT_REVIEWER.md). Server binds **127.0.0.1:3456 only**. No app login/session, database, agent, worker, ordinary financial API, M6 adapter, environment file or custody credential is used. Routes are GET `/`, `/style.css`, `/inspection.json`; all other paths and non-GET methods are rejected. Host, Origin and Fetch-Metadata checks reject other origins/DNS rebinding. CSP denies scripts, forms, frames, browser connections and all nonlocal resources; there are no wallet imports in the runtime or inline scripts. The SDK probe is a separate offline test module, never a server route.

Default mode is deterministic **offline historical preview**, uses the PR #15 public snapshot, makes no network calls, and cannot imply current readiness. Optional `--live-read-only` performs only fixed HTTPS Testnet status/final-block/account/key/protocol/gas queries. Redirects and configurable RPC URLs are disallowed; account/key reads bind the same block; stale/future block observations fail closed. RPC failures produce a sanitized blocked page, never a cached success.

Strict transaction validation rejects different account/network/action count/order, extra fields, wrong method/args/encoding/gas/deposit, changed artifact bytes or size. Current account validation rejects unexpected/missing/restricted keys, existing code, staking, insufficient amount, mismatched blocks and changed protocol/gas/storage parameters. Checked decimal u128 strings and bigint arithmetic are used. No nonce or real signing block is prepared. Snapshots are point-in-time only: passing one never authorizes a later invocation.

## Fresh read-only public observation and budget

[Account evidence](../../evidence/METEOR_DEPLOYMENT_ACCOUNT.json): November 5, 2026 **10:20:02.770 UTC / 11:20:02.770 Lagos**, finalized Testnet block **276328269**, hash `FUdrmL77kALv8zC9Xh85gi8pPuPdfL7pbTgrUS3D9YsP`.

- `avroqen-vault.testnet`: **4.5 NEAR**, locked 0, storage 182 bytes, no code.
- Same single FullAccess key; fingerprint `01323ff188aed5cb6d5d74e27131a25f6b77ede4556b06bb89bac9360012ab82`.
- Protocol88, storage `10000000000000000000` yocto/byte, gas `100000000` yocto/gas unchanged.
- Conservative backing3.67268 + protocol reserve0.1 + deployment gas ceiling0.03 + safety margin0.2 = **4.00268 NEAR**. Headroom after this margin **0.49732 NEAR**. No top-up recommended or performed.
- Separate future owner credit/mandate funding/payment budgets remain unapproved. Retained FullAccess bypasses contract restrictions; see VAULT_GOVERNANCE.md. RPC state is not proof of human custody.

Exact future proposal remains signer=receiver `avroqen-vault.testnet`, Testnet, action1 approved DeployContract, action2 FunctionCall `new`, exact21-byte UTF-8 `{"network":"testnet"}`,100Tgas,0yocto. No AddKey/DeleteKey/Transfer or third action.

## Can a review-and-cancel session establish compatibility?

**Conditionally, with separate explicit owner authorization and a reviewed connector, but not safely as an enforceable no-sign capability in this SDK path.** The real prompt could sign and submit if the owner clicks approval. This preview deliberately cannot open it. No cancel button in our application can guarantee a wallet never submits.

Before such a session:

1. Resolve the response source/origin trust boundary and review a dedicated connector that preserves existing Meteor custody, rejects all alternate actions/accounts/networks and has no local-key fallback. Do not reuse or extend M6 operation endpoints. This implementation phase does not provide that connector.
2. Establish from wallet support/documentation that deploy/init can be inspected without approval, including full artifact hash/size (or independently verifiable exact bytes), action order, signer/receiver/network, method/args, gas/deposit. If the wallet hides or truncates material terms, keep **BLOCKED**. Do not treat a generic “deploy contract” label as transparent review.
3. Owner separately authorizes an exact review-and-cancel session, acknowledges it opens a signing-capable UI, and agrees to **cancel/close only**, never approve. Revalidate finalized account/key/code/backing and artifact immediately before it. Do not initiate under the current task.
4. Future evidence may include wallet version/device, visible exact public terms, payload loading success and confirmed cancellation; omit authentication material, serialized payloads, signatures and private keys. Independently inspect account/code/key state afterward. No approval, retries, top-ups or deployment inferred from cancellation.
5. After compatibility is genuinely established, obtain a **different explicit authorization** for the one live deployment transaction. Public deployment receipt/code/key/accounting checks remain mandatory before M6 enablement.

No wallet prompts or manual compatibility results are marked passed. Live financial acceptance, authentic verifier flows and physical-device deployment review remain pending; iOS deferred.

## Alternatives without changing existing custody

- Ask Meteor maintainers whether an official wallet-native deploy/init review supports this exact batch and artifact size, and whether it exposes a trustworthy digest. Research/support inquiry only; no key export or account change. Any actual prompt still requires separate authorization.
- A maintained SDK can construct an unsigned batch offline (demonstrated here), but cannot make a wallet's opaque screen transparent. An independently reviewed wallet-native signing integration is still required.
- NEAR CLI0.30.1 supports atomic deploy/init, but browser-only Meteor custody is not a CLI signer. Do not import a seed/key into Node, CLI/keychain, GitHub, API or Codex to make it work. A future owner-controlled hardware/external signing integration is an alternative only if compatible with the existing custody and separately reviewed/approved; no such setup is claimed available.
- Do not split deploy/init, pre-sign/export a secret, add a new access key, use an agent/backend signer, or accept an opaque wallet prompt as a shortcut.

## Automated evidence

Local validation: `pnpm check` passed (**196 unit,27 integration,13 adversarial**); `pnpm build` passed; full Playwright suite **139 passed** including3 new preview/transport cases; real PostgreSQL suite **176 passed**. Rust format, all-target Clippy, locked release build/allowlist and **33 unit +2 deployment sandbox +7 financial sandbox** passed. Exact approved archive unchanged. Workflow checks passed. Container isolation, database connectivity, smoke and secret scanning passed. Hosted foundation/rust results are recorded against the final head in the draft PR/delivery.

Secret scanning initially flagged the public permission digest under the ambiguous field name `keyFingerprint`; it was renamed `permissionFingerprint` to accurately describe the public hash. No scanner exemption was introduced.

Development checks initially exposed test harness issues (Node fetch normalizes Host, sandbox disallowed loopback listeners, and existing web occupied3000); corrected Host test uses HTTP request, loopback tests ran with appropriate permissions, existing web was stopped only for browser tests and restored. No security gate was disabled and no database volume was deleted.
