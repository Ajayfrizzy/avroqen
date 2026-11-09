# Deployment key safety gate — November 6, 2026

Scope: review-only preparation on `feat/deployment-key-safety-gate`, targeting staging. No signing, Keychain access, live transaction, key change, deployment or financial enablement. This is implementation self-review and automated verification, not an independent external audit.

## Owner-verified Testnet deployment — November 7, 2026

This update records only verified owner-provided evidence. No RPC refresh or independent chain verification was performed for this documentation update. The preparation results below remain historical; their undeployed-state and unperformed-deployment statements are superseded only by the evidence recorded here.

- Network: **Testnet**; account: **`avroqen-vault.testnet`**.
- Finalized transaction: **`4PtZ7AoK1yVCFKit8LXJ8m4MqgCCh7JtwFu3gy2R7JD5`**.
- Transaction execution status: **FINAL**, with **SuccessValue** and **successful receipt outcomes**.
- Deployed approved Wasm: **366735 bytes**, SHA-256 **`b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`**.
- Original Meteor **Primary** and temporary **Testing** keys are both present with **FullAccess**; **no third key**. Testing has not been revoked. Retained FullAccess keys permit code replacement and direct account transfers outside the contract's restrictions.

Initialized `get_accounting` evidence (amounts in integer yoctoNEAR; storage usage in bytes):

| Field | Owner-verified value |
| --- | --- |
| `network` | `testnet` |
| `vault` | `avroqen-vault.testnet` |
| `available` | `0` |
| `payment_reserved` | `0` |
| `withdrawal_pending` | `0` |
| `storage_credit` | `0` |
| `storage_locked` | `0` |
| `unallocated_owner_balance` | `0` |
| `protocol_reserve_minimum` | `100000000000000000000000` |
| `storage_usage_bytes` | `367168` |
| `storage_byte_cost` | `10000000000000000000` |
| `account_balance` | `4497113237340531800000000` |

**Financial operations remain disabled.** Deployment/initialization success does not authorize a manifest/configuration change, funding, mandates, attestations, payments, withdrawals or key removal, and does not pass integrated financial acceptance. **No independent security audit is claimed.**

The old and new protected deployment directories are preserved without accessing or modifying their sensitive contents. This documentation update did not inspect Keychain, private keys, signatures or signed transaction files, and did not sign, broadcast, revoke, deploy or change live configuration. No deployment procedure should be rerun on the basis of this report.

## Changes and findings

- DEPLOYMENT requires exactly the owner-approved Primary and temporary Testing FullAccess keys, in either order, and the transaction candidate must select Testing. Strict transaction schema retains the approved 366735-byte artifact, SHA-256 b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48 and exactly ordered DeployContract + new({"network":"testnet"}),100Tgas,0deposit. Primary is rejected as a deployment signer.
- POST_REVOCATION expects only Primary and is a separate account/key-state check, not deployment or receipt approval. The same exact identity, permission, finality and freshness checks apply. It cannot be used as a deployment candidate phase.
- Domain validation now checks observation age and finalized block age (120 seconds, at most five seconds future skew). Previously the network observer checked freshness but a stale object supplied directly to the domain inspector could pass. Historical previews remain explicitly marked and are checked against their recorded observation time; they never claim live readiness.
- The actual pinned Meteor serializer round-trip now explicitly checks the serialized public key and exact reserialization, in addition to action/hash/argument invariants. This is offline compatibility evidence, not a wallet invocation.
- Historical one-key docs are labeled and superseded by archive/deployment/NEAR_CLI_DEPLOYMENT.md. Existing M6 adapter and financial authorization are unchanged.
- Official CLI v0.31.0 online Keychain selection can choose another accessible FullAccess key. Offline mode selects the exact requested item but cannot directly send. The documented alternative uses a protected signed file followed by exact-file submission, requiring a separate owner decision accepting that executable authorization artifact. No such file was created. A Keychain dialog alone is not transaction approval.

## Fresh public evidence and budgets

[Finalized public observation](evidence/DEPLOYMENT_KEY_GATE_ACCOUNT.json), recorded **2026-11-06 19:21:06.367 UTC / 20:21:06.367 Lagos**:

- Testnet block **276527142**, `5dEo4ZqbS5akyG7r1YNVXxXrTB6JBQjQUHd5B3JHiD11`.
- Account `avroqen-vault.testnet`, both exact approved FullAccess keys, no deployed code, no staked balance, storage **264 bytes**.
- Balance **4.499958035075 NEAR**; protocol88, storage price 10^19 yoctoNEAR/byte, gas price 10^8 yoctoNEAR/gas.
- Conservative storage **3.6735**, reserve **0.1**, gas ceiling **0.03**, margin **0.2**, total **4.0035 NEAR**. Headroom after margin **0.496458035075 NEAR**. This is not mandate/payment funding or measured public execution cost. Refresh before authorization; archived evidence expires for live readiness.

The earlier unsigned owner transaction passed 14 independently decoded Borsh checks; this was another check within the same coding-assistant workflow, not an external security assessment. Its old nonce/block is inspection evidence only. No public deployment receipt exists from this task.

## Verification

- Full application lint, typechecks and production build: passed.
- Unit tests: 226 total (224 full-suite pass, then two added backing/permission tests included in the final focused run); integration:27; adversarial:13.
- Browser tests:139 passed, including desktop/mobile isolated no-wallet reviewer and existing auth/consent/security flows; these are automated browser fixtures, not real-wallet manual acceptance.
- Rust:33 unit tests,2 approved-archive deployment/rollback sandbox tests,7 financial sandbox tests passed. Rustfmt, Clippy with warnings denied, release Wasm build and method allowlist passed.
- Secret scan: no leaks. Workflow check and Git whitespace validation passed.
- Final focused deployment unit/integration run: **68/68 passed**. PostgreSQL integration: **176/176 passed** across seven files. Docker images built; non-root/image-secret isolation, connectivity, readiness smoke and monitoring isolation passed. Database outage correctly failed API/worker readiness while retaining liveness; recovery smoke passed. Database volume retained.
- Archived artifact and installed CLI binary SHA-256 were rechecked and match the documented values. Hosted CI is checked on the final PR commit; see the PR checks for immutable run evidence.

## Remaining owner gates

No confirmed blocking implementation defect found in this scope. Merge readiness requires green final-head foundation/rust CI and owner review; merging this PR authorizes no deployment. The draft PR remains unmerged.

Live deployment requires: verified CLI binary/config and owner-only Testing credential setup; fresh exact-key/code/balance/protocol checks and nonce/block/height; independently inspected unsigned hash; explicit approval of exact actions, fee ceiling, retained Primary risks, protected signed-file workflow and bounded same-hash retry behavior; private signed-artifact comparison; separately authorized broadcast. Final receipts/code/init/accounting/solvency must pass before any later key-removal approval. Removal must target Testing only and be verified at finality. M6 financial operations stay disabled until a separate approved manifest and financial-operation authorization, not merely deployment success.

Owner real-key import/signing, public deployment, post-deployment receipts/solvency and actual Testing revocation remain unperformed by this task. Retained Primary FullAccess can replace code/transfer funds. Independent audit and production governance remain separate future work; they are not misrepresented as hackathon merge prerequisites.
