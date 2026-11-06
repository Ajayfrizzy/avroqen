# M8 deployment authorization package — NOT AUTHORIZED

> **November 6, 2026 safety-gate update:** one-key observations and signer instructions below are historical, not the current deployment authorization. The owner now approves exactly Primary `ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz` AND Testing `ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G`, both FullAccess, for the DEPLOYMENT phase. Only Testing may sign deployment. POST_REVOCATION expects only Primary, after separately authorized removal of Testing. See [current CLI gate, owner commands and receipt/revocation procedure](NEAR_CLI_DEPLOYMENT.md) and [fresh evidence/results](DEPLOYMENT_KEY_GATE_REPORT.md). No live operation is enabled or authorized. Historical observations remain intact; they must not be used as fresh checks.


This is a reviewable proposal, not permission to deploy, fund, sign, alter keys or enable live submissions. No public transaction was performed. Revalidate immediately before any separately authorized execution; account state, gas and artifact may change.

## Fresh read-only evidence

`node scripts/observe-testnet.mjs` performs only status/block/query/protocol/gas RPC and hashes the local release artifact. Evidence: [M8_TESTNET_ACCOUNT.json](evidence/M8_TESTNET_ACCOUNT.json).

Observed **2026-11-02 23:42:56.763 UTC / 2026-11-03 00:42:56.763 Africa/Lagos**, RPC `https://rpc.testnet.near.org`, reported chain ID `testnet`, finalized height **275969229**, hash **37MFWf1Df6UbLekt4kWPWMVyADNXH6JNB8dydudjDfph**. Account and key queries are pinned to that finalized hash.

- Account/expected deployment signer and receiver: **avroqen-vault.testnet**.
- Amount **4500000000000000000000000 yoctoNEAR = 4.5 NEAR**, locked 0; storage **182 bytes**.
- Code hash `11111111111111111111111111111111`: no code deployed.
- One **FullAccess** public key: `ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz`.
- Permission fingerprint (M6 convention): `01323ff188aed5cb6d5d74e27131a25f6b77ede4556b06bb89bac9360012ab82`.
- Protocol **88**, storage **10000000000000000000 yoctoNEAR/byte**, gas **100000000 yoctoNEAR/gas**. Full deployment fee configuration retained in public evidence.

RPC account/key existence does not prove human control. If needed, owner demonstrates the account in their own wallet or signs a fresh domain-bound NEP-413 control challenge verified against the finalized key. Do not export a secret key, create an access key, send a transaction or retain signed authentication material as proof. Such a control check grants no deployment permission.

## Exact proposed artifact and atomic transaction

Build from this PR's final reviewed commit using pinned Rust **1.96.1**, locked Cargo dependencies and `.cargo/config.toml`:

```sh
cargo build -p mandate-vault --target wasm32-unknown-unknown --release --locked
pnpm test:wasm
shasum -a 256 target/wasm32-unknown-unknown/release/mandate_vault.wasm
node scripts/observe-testnet.mjs
```

Artifact: `target/wasm32-unknown-unknown/release/mandate_vault.wasm`, **366735 bytes**, SHA-256 **b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48**. No Rust source/toolchain/contract change in M8; same measured M6/M7 artifact. Build provenance is the final M8 Git commit plus locked source/toolchain; cross-host byte identity is not claimed without comparing hashes.

Proposed single **Testnet** transaction signed directly by **avroqen-vault.testnet**, receiver **avroqen-vault.testnet**, actions in this order:

1. `DeployContract`: exact bytes of the above artifact/hash.
2. `FunctionCall`: method `new`, exact UTF-8 JSON arguments `{"network":"testnet"}`, base64 `eyJuZXR3b3JrIjoidGVzdG5ldCJ9`, attached deposit **0 yoctoNEAR**, prepaid gas **100000000000000 (100 Tgas)**.

Wallet assigns a fresh account-key nonce and recent Testnet block hash after the final preflight. They must not be pre-signed or invented in this document. Direct initialization requires signer = predecessor = contract account. Use atomic deploy+init to avoid an initialization gap; do not split it. No AddKey/DeleteKey/Transfer action is included. The contract initialization defines no platform administrator. The actual deploy transport/tool must support exact artifact bytes and both actions; select and inspect it with the owner before authorization rather than assuming Meteor supports deployment.

## Measured budget and expected accounting

Local sandbox rerun measured initialized storage **367086 bytes**, full exercise **375976 bytes**. Conservative storage estimate: current account **182** + code **366735** + sandbox non-code overhead **351** = **367268 bytes**, costing **3.67268 NEAR** at observed price. This intentionally overcounts some baseline and is not deployed Testnet measurement.

| Purpose | Proposed amount | Accounting/approval |
|---|---:|---|
| Deployment storage backing | 3.67268 NEAR estimated | Existing vault balance; locked by protocol, not a payment allocation |
| Contract protocol reserve | 0.1 NEAR | Existing balance; no mandate may spend it |
| Aggregate transaction gas envelope | 0.1 NEAR maximum proposed | Across deployment and participating signers; stop before exceeding; not an automatic top-up |
| Initial vault backing recommendation | Maintain observed 4.5 NEAR | No additional funding recommended now; conservative headroom **0.62732 NEAR** after above storage/reserve/full gas envelope |
| Owner prepaid storage credit | 0.2 NEAR separately proposed | Owner wallet deposit, never taken from a mandate payment allocation |
| Mandate storage ceiling | 0.15 NEAR | Bounded consumption of prepaid credit; backing for retained records stays locked |
| Mandate funding/total policy limit | 0.003 NEAR | Separate owner wallet allocation, subject to explicit approval |
| First allowed payment | 0.001 NEAR | Exact recipient/claims/owner approval; max two successful-or-pending slots |

100 Tgas at observed price = **0.01 NEAR**; 300 Tgas = **0.03 NEAR**. Deployment byte/action send+execution fee for this artifact is **26549255306105 gas = 0.0026549255306105 NEAR**, before init execution and other receipt/action costs. The proposed 0.1 aggregate envelope is not a guaranteed measured total. Each participant needs their own approved gas balance. Owner-sensitive non-funding actions attach 1 yoctoNEAR; include them in actual cost accounting. Transaction costs are never quietly subtracted from authorized recipient amounts.

Immediately after deploy+init, expected aggregate available/payment_reserved/withdrawal_pending/storage_credit/storage_locked and unallocated_owner_balance are **0**; protocol minimum **0.1 NEAR**, network/vault exact. Actual account balance becomes **4.5 NEAR minus actual deployment gas**, with measured storage backing locked within that balance (do not subtract locked storage twice). After approved owner credit/funding, account increases by their attached deposits less fees; credit/locked storage/payment allocation must reconcile separately. Fresh protocol/state costs can invalidate this estimate. Do not assume 4 NEAR sufficient and do not fund automatically.

## Required approval and post-deployment gate

Owner must explicitly approve final Git/artifact hash, atomic transaction, target/network, current key fingerprint/retention risk, per-actor public identities, gas/credit/funding/payment ceilings and prohibited-action gas tests. Public identities for owner/agent/verifier/recipient/optional guardian remain to be recorded; do not manufacture accounts. Genuine independent source and verifier access must be arranged. Actual human independence must be disclosed if one person controls several accounts.

After separately authorized deployment, independently query finalized code, compute decoded SHA-256, compare account/key fingerprints, `get_accounting` identity/domain/reserve and measured solvency. Confirm init success, receipts and no unexpected actions/keys. Only after these pass may the approved environment set the M6 manifest and `M6_TRANSACTIONS_ENABLED=true` with the approval reference. Never bypass manifest failure.

Retained FullAccess permits replacing code, direct transfers and deletion outside MandateVault. This accepted low-value demo is neither immutable nor fully noncustodial. No automatic rollback: a key holder replacing code cannot reverse a transfer and may corrupt state. Unexpected state/code/key/receipt freezes new submissions and requires investigation; pending obligations stay reserved. Recovery/migration/key deletion require separate authorization. Production factory governance remains future work in VAULT_GOVERNANCE.
