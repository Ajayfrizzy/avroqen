# NEAR Testnet deployment preflight — no live authorization

**November 7, 2026 status:** this preflight is historical. See the [verified owner-provided deployment/initialization evidence](DEPLOYMENT_KEY_GATE_REPORT.md#owner-verified-testnet-deployment--november-7-2026), which supersedes its undeployed-state conclusions. Financial operations remain disabled. Both Primary and Testing FullAccess keys remain present; no third key. No independent security audit is claimed.

> **November 6, 2026 safety-gate update:** one-key observations and signer instructions below are historical, not the current deployment authorization. The owner now approves exactly Primary `ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz` AND Testing `ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G`, both FullAccess, for the DEPLOYMENT phase. Only Testing may sign deployment. POST_REVOCATION expects only Primary, after separately authorized removal of Testing. See [current CLI gate, owner commands and receipt/revocation procedure](NEAR_CLI_DEPLOYMENT.md) and [fresh evidence/results](DEPLOYMENT_KEY_GATE_REPORT.md). No live operation is enabled or authorized. Historical observations remain intact; they must not be used as fresh checks.


Prepared **November 4, 2026 (Africa/Lagos)**. Recommendation: **BLOCKED for live authorization until a dedicated Meteor deployment-review path and wallet batch review are verified.** The artifact, account and local atomic-deployment checks pass. This is not a deployed vault and does not begin live financial acceptance.

## Repository and artifact provenance

Latest fetched staging: `8462eae367a4e15f569d3377b669a3ad6dfc5d19`, including merged monitoring fix PR #14. Staging CI [41916177238](https://github.com/Ajayfrizzy/avroqen/actions/runs/41916177238) succeeded. Preparation branch: `feat/testnet-deployment-preflight`, created directly from that commit; main/staging untouched. Final preparation commit and exact-head CI are recorded in the draft PR and delivery message (a document cannot contain its own final commit hash).

Contract source, Cargo.lock, toolchain and production configuration are unchanged. New Rust tests use the archived approved release binary; existing sandbox tests independently exercise the fresh host build. No test-specific contract is substituted for the reviewed candidate. Pinned Rust **1.96.1**, near-sdk **5.30.0**, near-workspaces **0.24.0**, target-scoped `--cfg near`:

```sh
cargo build -p mandate-vault --target wasm32-unknown-unknown --release --locked
pnpm test:wasm
shasum -a 256 target/wasm32-unknown-unknown/release/mandate_vault.wasm
```

Release path: `target/wasm32-unknown-unknown/release/mandate_vault.wasm`.
Archived identical candidate: [`docs/evidence/mandate-vault-approved.wasm`](evidence/mandate-vault-approved.wasm). Size **366735 bytes**. SHA-256 **b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48** matches the previously reviewed candidate exactly. Reject any replacement hash; a hosted/local build success is not permission to deploy different bytes. Inspection found embedded absolute Cargo dependency paths, so cross-host builds are not byte-reproducible with the current settings. The archive preserves the exact approved local bytes; its SHA-256 is asserted in the deployment tests on every host. Host-built artifacts used by the existing sandbox suite are test evidence only, not replacement deployment candidates. Reproducible path normalization would produce a newly reviewed artifact and is deliberately not introduced here.

## Fresh finalized public observation

[Public RPC evidence](evidence/TESTNET_DEPLOYMENT_PREFLIGHT_ACCOUNT.json), using only status/block/account/key/protocol/gas queries at `https://rpc.testnet.near.org`:

| Field | Observed value |
|---|---|
| Observation | 2026-11-04 22:06:55.714 UTC / **23:06:55.714 Lagos** |
| Actual RPC chain ID | `testnet` |
| Finalized block | **276254646**, `8dcpk7vagNTLKEo5TSGs88tjEdt6yPsUnJpTAkkHH14A` |
| Account | `avroqen-vault.testnet` |
| Amount | `4500000000000000000000000` yoctoNEAR = **4.5 NEAR** |
| Locked (validator stake field) | `0`; this field is not the storage-backing amount |
| Storage usage | **182 bytes** |
| Code hash | `11111111111111111111111111111111` — no deployed code |
| Public keys | Exactly one, listed below |
| Protocol | **88** |
| Storage price | `10000000000000000000` yoctoNEAR per byte |
| Gas price | `100000000` yoctoNEAR per gas |

Public key: `ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz`, permission **FullAccess**. Permission fingerprint: `01323ff188aed5cb6d5d74e27131a25f6b77ede4556b06bb89bac9360012ab82`, SHA-256 of `publicKey + ':' + JSON.stringify(permission)` using the existing M6 convention. No extra/restricted keys or code appeared. Balance, storage, key and protocol/gas parameters match the November 2/3 observations; block/time are fresh. RPC state does not prove human custody; owner asserts wallet control.

Repeat read-only preflight immediately before any later authorized action, preserving historical evidence:

```sh
node scripts/observe-testnet.mjs /tmp/avroqen-vault-fresh-observation.json
```

Stop on an unexpected key/permission, code, network, artifact, balance shortfall or unpinned query result. Never automatically top up or change keys.

## Exact proposed transaction

One ordinary NEAR transaction, **not** a delegated/meta transaction:

- Network: **testnet**; signer and receiver: **avroqen-vault.testnet**.
- Public signing key must equal the currently finalized FullAccess key above.
- Action 1: **DeployContract**, exact 366735 archived reviewed Wasm bytes (recheck the archive hash immediately before loading it).
- Action 2: **FunctionCall**, method **new**, exact UTF-8 arguments **`{"network":"testnet"}`** (21 bytes), base64 **`eyJuZXR3b3JrIjoidGVzdG5ldCJ9`**.
- Function-call gas: **100000000000000 (100 Tgas)**; attached deposit: **0 yoctoNEAR**.
- **Exactly two actions in this order.** No Transfer, AddKey, DeleteKey, CreateAccount, Delegate, Stake, global-code reference or DeleteAccount action.
- Fresh nonce and recent block hash must be obtained for this key/network after final review. This package deliberately contains neither a reusable nonce nor a signed transaction.

Contract `new` requires signer = predecessor = current account, rejects reinitialization, and accepts only the configured `testnet`/`sandbox` domain. The VM domain string alone cannot prove actual network: verify RPC chain ID and transaction transport separately. Initialization writes root state before checking storage backing plus the 0.1 NEAR reserve. There is no admin/upgrade method; retained account keys remain outside these restrictions.

## Tool selection and owner-controlled signing

**Owner confirmed: Meteor/browser wallet only. Selected compatible preparation direction: a dedicated local review interface using the already-pinned Meteor SDK, with the existing vault key remaining entirely inside Meteor.** Do not migrate/export it to CLI/keychain or add another key. The SDK can represent the exact batch, but a dedicated reviewed deployment interface and actual Meteor large-payload/action review have not been verified. Consequently this is a selected direction, not a ready-to-sign transport.

The existing application transaction adapter deliberately accepts typed M6 FunctionCall operations, not deployment. Do not add DeployContract to that financial API or bypass its checks. A separate owner-only, locally served preparation interface would verify the pinned Wasm bytes/hash, fresh account/key/network and exact two actions; use in-memory connector state, disabled logging, `useFunctionCallKey: false`, no key-store writes and no automatic retry. It must not request key transfer, account creation or new access keys. No such signing interface or wallet prompt was enabled by this preflight.

No `near` binary was found on PATH; nothing was installed. CLI remains a researched alternative only if the owner independently chooses a compatible existing local/hardware signer later. No change of key custody is assumed or requested.

| Method | Verified capability | Assessment |
|---|---|---|
| near-cli-rs v0.30.1 | Official source sets signer=receiver and appends DeployContract followed by FunctionCall in one action vector; `sign-later` prepares unsigned output | Verified atomic construction, but **not usable with the confirmed browser-only setup** without a separately reviewed signing arrangement |
| near-api-js v7.4.0 | Maintained SDK supports separate transaction construction/signing/broadcast and ordered action arrays | Technically suitable; custom signing code increases review surface. Do not use example plaintext keys, log signed transactions or place a signer in the backend |
| Meteor SDK 3.24.1 already in this repository | Types/serialization support DeployContract and ordered transaction actions | Selected to preserve current wallet custody; this does **not** prove the wallet UI supports/reviews this 366735-byte deploy+init request. NEP-413 login is unrelated. No deployment prompt was opened; no claim of end-to-end wallet deployment support |
| Ledger via CLI | Official CLI has Ledger signing | Requires the existing finalized key to belong to that Ledger and exact batch support/review confirmation. Do not add/rotate a key to choose this route |

Official sources inspected read-only on November 4:

- [CLI v0.30.1 release (September 2)](https://github.com/near/near-cli-rs/releases/tag/v0.30.1).
- [CLI deploy source](https://github.com/near/near-cli-rs/blob/v0.30.1/src/commands/contract/deploy/mod.rs), [atomic init action vector](https://github.com/near/near-cli-rs/blob/v0.30.1/src/commands/contract/deploy/initialize_mode/call_function_type/mod.rs).
- [Unsigned sign-later implementation](https://github.com/near/near-cli-rs/blob/v0.30.1/src/transaction_signature_options/sign_later/mod.rs), [keychain implementation](https://github.com/near/near-cli-rs/blob/v0.30.1/src/transaction_signature_options/sign_with_keychain/mod.rs).
- [near-api-js v7.4.0 release (October 23)](https://github.com/near/near-api-js/releases/tag/near-api-js%407.4.0), [SDK transaction construction documentation](https://github.com/near/near-api-js#transaction-building-and-offline-signing).

Alternative CLI unsigned command shape for a later separately approved installation/signing arrangement, **not run here and not required for the selected Meteor direction**:

```text
near contract deploy avroqen-vault.testnet
  use-file <absolute-reviewed-wasm-path>
  with-init-call new json-args '{"network":"testnet"}'
  prepaid-gas '100 Tgas' attached-deposit '0 yoctoNEAR'
  network-config testnet
  sign-later --signer-public-key <above-public-key>
  --nonce <fresh-next-nonce> --block-hash <fresh-testnet-block-hash> display
```

This is a command shape with placeholders, not a copy/paste signing command. Verify v0.30.1 help and downloaded release provenance locally after approving installation. `sign-later` does not sign or broadcast; a later separate authorization is needed to select any signing option. Merely omitting `send` is **not** sufficient: `sign-with-*` can sign before selecting its output destination.

Keychain warning from source review: `sign-with-keychain` falls back to legacy plaintext credential files if an entry is absent. The owner must use an isolated trusted OS account/config with an empty legacy credentials directory and a confirmed matching keychain entry; stop if fallback is offered. Do not import a key into the repository, agent runtime, API, worker, CI or hosted deployment environment. Do not put keys/seed phrases in command arguments, shell history, environment files or chat. If only a browser wallet controls the existing key, pause and separately review a wallet-supported deployment path; do not demand key export. Hardware signing is appropriate only if it already controls the current key.

For control proof if needed, the owner can show the account/network and matching public key in their wallet, or approve a fresh domain-bound NEP-413 control challenge through the existing verifier, retaining only account/fingerprint/outcome. No seed/private key disclosure, new access key or public transfer is needed. This has not been performed by this preflight.

## Atomic local sandbox evidence

[Machine-readable local measurements](evidence/TESTNET_DEPLOYMENT_PREFLIGHT_SANDBOX.json). `contracts/mandate-vault/tests/deployment_preflight.rs` creates a **sandbox-only** `testnet` namespace and `avroqen-vault.testnet` account using ephemeral sandbox keys, with exactly 4.5 local NEAR. The identical textual account ID is not the public account. No wallet credentials or public endpoint are used.

- Exact reviewed release hash/size, one self-signed deploy+init batch, `new` 100 Tgas/0 deposit, successful Testnet domain and vault identity.
- Deployed bytes equal original Wasm; key list/permissions unchanged; all payment/withdrawal/credit aggregates zero; reserve 0.1 NEAR; storage backing satisfied.
- Initialized storage **367086 bytes** = **3.67086 NEAR** at current byte price.
- Total measured batch gas **28429737344682** (~28.429737344682 Tgas); burned cost **2842973734468200000000** yoctoNEAR = **0.0028429737344682 NEAR**.
- After waiting five local blocks for the unused-gas refund, account balance **4497157026265531800000000** yoctoNEAR = **4.4971570262655318 NEAR**. Balance decrease equals gas burned exactly: no deployment deposit or transfer. An immediate post-execution balance temporarily included prepaid gas; it is not the final economic cost.
- Unsupported `mainnet` initialization and 3.7-NEAR insufficient liquid backing both fail; code remains absent, storage returns to its original usage, no usable accounting state remains and key permissions are unchanged. Gas is still charged on failure.
- Reinitialization fails after successful initialization. Existing financial sandbox tests separately cover outsider init, owner/agent/verifier/guardian boundaries, reservations, callbacks, insolvency and quarantine.

These are local protocol executions, not genuine public Testnet deployment receipts. The harness initially required SDK API/assertion corrections; final passing results—not those failed development attempts—are the evidence. Release contract source and Wasm never changed.

## Cost recommendation at observed protocol parameters

All arithmetic uses integer atomic amounts. Storage is backing retained inside account balance, not a second transfer; the `locked` RPC field describes staking and must not be mistaken for storage.

| Item | NEAR | Basis |
|---|---:|---|
| Measured initialized backing | 3.67086 | 367086 bytes × 10^19 yocto/byte |
| Conservative deployment backing | **3.67268** | 182 current bytes + 366735 code + 351 full measured non-code overhead; deliberately overcounts 182 bytes |
| Contract protocol reserve | **0.1** | Fixed contract invariant |
| Deployment gas at sandbox measured burn/current price | **0.0028429737344682** | Estimate only; public execution not measured |
| Proposed deployment-only gas ceiling | **0.03** | 300 Tgas equivalent at observed price; reprice immediately before signing, not extra attached deposit |
| Additional unallocated safety margin | **0.2** | Proposed operational minimum, not contract reserve or owner storage credit |
| Conservative minimum including gas ceiling/margin | **4.00268** | 3.67268 + 0.1 + 0.03 + 0.2 |
| Existing account amount | **4.5** | Finalized RPC |
| Headroom after backing/reserve/gas ceiling | **0.69732** | Before reserving the additional 0.2 safety margin |
| Headroom after all above, including margin | **0.49732** | No top-up recommended |

Current fee decomposition for signer=receiver: deployment base+byte send/execution **26549255306105 gas** (0.0026549255306105 NEAR); function-call base+24 method/argument bytes **980107324832 gas**; action-receipt base send/execution **216119000000 gas**. Adding the full **100000000000000** prepaid initialization gas gives a conservative fixed-fee-plus-prepaid subtotal **127745481630937 gas**, **0.0127745481630937 NEAR** at current price. This deliberately does not present an exact predicted execution bill; future protocol/receipt costs and gas pricing must be checked. Initialization's 100 Tgas is validated by the real local batch; actual combined burn was ~28.43 Tgas. Refund timing must be handled separately from cost estimation.

Expected post-refund account amount at the measured burn is **4.4971570262655318 NEAR**; conservative amount after the deployment gas ceiling is **4.47 NEAR**. Conservative spendable headroom is as above, not an owner-withdrawable allocation. Current contract reports unallocated owner balance zero; excess deployment funds are not a mandate payment budget.

**4.5 NEAR is sufficient under these verified assumptions.** No transfer/top-up is recommended or authorized. Keep separately proposed **0.2 NEAR owner storage credit**, **0.15 NEAR mandate storage ceiling**, **0.003 NEAR mandate funding**, and **0.001 NEAR first payment** outside deployment approval. They are not performed or approved here. The prior 0.1 NEAR aggregate future-operation gas budget is not silently spent or replaced by the deployment-only ceiling.

## Future read-only post-deployment verification

Only after a separately authorized transaction, record its **actual public hash** and query `EXPERIMENTAL_tx_status` with `{ "tx_hash": "<actual hash>", "sender_account_id": "avroqen-vault.testnet", "wait_until": "FINAL" }`. Use the trusted Testnet RPC. Inspect in memory; do not save/print full signed transactions or authentication material. Verify:

1. Response hash and signer/public key/receiver match the approved account/key; exactly DeployContract and FunctionCall, correct order, raw code SHA-256/size and exact `new` arguments, 100 Tgas and zero deposit. No additional actions.
2. `final_execution_status` is FINAL, transaction/receipt outcomes are successful, and the transaction's receipt graph reaches the successful init receipt. Obtain each outcome block and confirm its hash at the same canonical finalized height; do not infer success from a wallet response or hash alone.
3. Check receipt executors/receivers, refunds and total burned gas/tokens. Confirm no transfers except protocol gas refunds, no unexpected contract calls or key changes. Receipt IDs and amounts are safe evidence; signed transaction blobs are not report material.
4. Independently run current finalized code/key/domain verification using the existing read-only `NearReader.deployment` (below). Also verify at the finalized deployment receipt block, then compare fresh current state.
5. View `get_accounting`: exact vault/network, all six initial aggregate fields zero, reserve `100000000000000000000000`. Compare account storage and amount with measured reserve + storage backing. Wait for gas refund completion before reconciling account delta; do not count storage backing twice.

Read-only current-state check (does not enable the manifest or sign anything):

```sh
node --import tsx --input-type=module <<'JS'
import { NearReader } from './services/chain/rpc.ts';
const reader = new NearReader();
const result = await reader.deployment({
  account: 'avroqen-vault.testnet', network: 'testnet',
  wasmSha256: 'b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48',
  keyFingerprints: ['01323ff188aed5cb6d5d74e27131a25f6b77ede4556b06bb89bac9360012ab82'],
  authorization: 'READ-ONLY-POSTCHECK-NOT-AUTHORIZATION'
});
console.log(JSON.stringify(result)); // public block/account/accounting only
JS
```

This code is expected to fail before deployment. It verifies code bytes/hash, every public key permission and domain at one finalized block, **not** the deployment receipt graph by itself. The transaction/receipt checks above remain mandatory. Safe repeated account/protocol observation is the `observe-testnet.mjs` command above; never treat that account-only observation as receipt verification.

Keep `M6_TRANSACTIONS_ENABLED` disabled until genuine deployment receipts, current code/key/domain, solvency and the approved manifest/reference all pass. This preflight does not change `.env` or any transaction-enabled setting. Existing M6 receipt verification is built for its typed operational calls; do not pretend it already verifies arbitrary deployment batches.

## Stop, failure recovery and owner actions

- No live signature, submission, deployment, funding, key modification or financial acceptance is authorized. No signed payload was generated or stored by this preflight.
- Owner confirmed Meteor/browser-only custody. Remain **BLOCKED** until a separate local deployment-review interface is reviewed and Meteor support for the exact ordered batch, artifact size and transparent approval is confirmed. Arrange an explicitly authorized review/cancel-only wallet check first; do not invoke a signing-capable prompt under this preflight authorization. Do not export secrets or install tools silently.
- Owner reviews the final PR commit, artifact hash/size, network/account/key, exact two actions, zero deposit, 100 Tgas, deployment cost ceiling, postcheck plan and retained-key risk in the local reviewer and Meteor. If Meteor hides, changes or cannot support the batch, cancel and do not proceed. Separately approve any tool installation/setup; separately authorize the one deployment transaction only after fresh preflight.
- Reconfirm RPC state immediately before signing; changed code/key/network/hash/solvency or an unsupported wallet preview stops the operation.
- On timeout/missing receipts, classify outcome unknown. Query the actual hash and finalized account/code/state; do not automatically retry, redeploy, initialize separately or release funds.
- On definitive initialization failure, prove atomic rollback and original key/code/storage state, account for burned gas, investigate and obtain fresh authorization before retry. Sandbox rollback does not justify guessing public rollback.
- Retained FullAccess permits replacing code, direct transfers, key changes and account deletion outside MandateVault. This controlled low-value demonstration is neither immutable nor fully noncustodial. No admin recovery/upgrade is introduced; replacing code is not an approved rollback strategy.
- Trusted RPC, tool supply chain, owner device/key custody, wallet deployment support, public execution/refund timing and independent security review remain residual risks. Public deployment and live M1–M7 acceptance remain pending. iOS remains deferred.

## Verification evidence

Final local command results and exact-head hosted CI are recorded below and in the draft PR. Only local sandbox and read-only public observations count as completed here. No invented transaction hash, receipt or deployment success is reported.

Local checks completed: `pnpm check` PASS (lint/typecheck, **166 unit + 19 integration + 13 adversarial**); `pnpm build` PASS; `pnpm test:workflow` PASS; `cargo fmt --all -- --check`, Clippy all targets with warnings denied, locked release Wasm build and `pnpm test:wasm` PASS. Full Rust run: **33 unit + 7 existing financial sandbox + 2 new deployment sandbox tests**, all passing; the final gas-conservation assertion was also rerun in the two focused deployment cases. No tests were disabled. The locked near-sandbox dependency defaults to local nearcore **2.14.0**. Testnet protocol and sandbox implementation may differ; measurements are estimates for public execution, not a public dry-run guarantee. Hosted CI reruns the database/browser and Rust gates on the preparation head.

Final secret scan: PASS, no leaks. No private key, seed, signed transaction, reusable authentication signature or session token is present in the public evidence.
