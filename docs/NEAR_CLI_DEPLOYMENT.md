# NEAR CLI deployment — final owner safety gate

Status: preparation only. No signing, deployment, key removal, funding or live financial operation is authorized by this document or its PR. The owner must approve the exact fresh transaction separately. See [gate evidence](DEPLOYMENT_KEY_GATE_REPORT.md), [governance](VAULT_GOVERNANCE.md) and [historical preflight](TESTNET_DEPLOYMENT_PREFLIGHT.md).

## Approved phases (November 6, 2026)

Account and receiver: `avroqen-vault.testnet`, NEAR **Testnet** only.

| Phase | Exact FullAccess key set | Deployment signer |
|---|---|---|
| DEPLOYMENT | Primary AND Testing below | Testing only |
| POST_REVOCATION | Primary only | No deployment permitted by this phase |

Primary: `ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz`.
Testing: `ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G`.

The owner confirmed the second key was intentionally created through Meteor and independently checked. No key was added by this task. Missing, duplicate, additional, restricted or substituted keys stop the gate. Key order is irrelevant. The post-revocation key validator is NOT proof of code, receipts, initialization or solvency; those require their own checks below. Primary still permits code replacement and account-level transfers after Testing is removed; this remains a low-value hackathon architecture, not immutable or fully noncustodial production deployment.

## CLI provenance and custody

Reviewed installed executable: `/opt/homebrew/Cellar/near/0.31.0/bin/near`, Homebrew ARM64 bottle, SHA-256 `223203d439644cfe4fa077360a9d5161534dd02194e6b773397f89da07789088`. `/opt/homebrew/bin/near` resolves to it. Official upstream [v0.31.0 source](https://github.com/near/near-cli-rs/tree/v0.31.0), tag commit `8d6e72f6ca7b989363479e2de5bd15146416f518`. Existing release JSON for v0.30.1 is historical research, NOT the current executable approval. Do not silently install, upgrade or substitute a binary. Reverify this executable hash/version before owner use; mismatch requires new review.

The native importer was separately tested with disposable credentials, including actual installed CLI read-only Keychain retrieval. It uses the user-domain default Keychain, service `near-testnet-avroqen-vault.testnet`, account `avroqen-vault.testnet:<Testing public key>`, and JSON `public_key`/`private_key`. The importer accepts only a key deriving Testing, validates the exact two-key finalized set and does not overwrite existing entries. Its local source/runbook is `/tmp/avroqen-native-importer-build/README.md`; temporary files may disappear. Real import/setup was not observed or performed by this review. No private key, seed, Keychain password, signature or signed envelope may be sent to Codex, GitHub, backend or CI.

Do NOT use the built-in private-key/seed importer: visible input, reconstructed command logs and plaintext fallback are unsafe. A Keychain copy remains exportable to authorized processes, not Secure Enclave signing. Owner-only setup and machine/ACL integrity remain prerequisites.

## Mandatory legacy isolation

Owner privately verifies the CLI's actual loaded config, normally `~/Library/Application Support/near-cli/config.toml`, has this top-level setting, a valid `testnet` connection pointing to the official HTTPS RPC, network name `testnet`, and no relayer:

```toml
credentials_home_dir = "/dev/null/avroqen-no-legacy"
```

Disposable testing verified native Keychain retrieval works with this path while legacy reads/writes fail. An empty writable directory is NOT sufficient. Fallback code still exists; missing/malformed config, a config change, another version or a symlink/path substitution invalidates the assurance. Do not use root, secret arguments, debug/teach-me logging, screen recording, `tee`, or an agent-controlled terminal for signing. This task does not inspect or modify the owner's config/Keychain. The earlier disposable harness restored the original config; isolation must not be assumed to be configured now.

## Signer selection: avoid online auto-selection

[Official v0.31.0 Keychain signer](https://github.com/near/near-cli-rs/blob/v0.31.0/src/transaction_signature_options/sign_with_keychain/mod.rs) searches available FullAccess credentials in online mode; a public-key flag does not pin that selection. **Do not use online `contract deploy ... sign-with-keychain send` with this two-key account.**

Offline mode selects the exact Keychain item named by `--signer-public-key` and requires explicit nonce, block hash AND block height. However, [the CLI rejects `send` in offline mode](https://github.com/near/near-cli-rs/blob/v0.31.0/src/transaction_signature_options/send/mod.rs). Therefore the proposed owner workflow is offline signing to a protected temporary signed file, followed by separate submission of those exact bytes. It does not generate or change any access key. This is source-verified syntax/behavior, NOT an executed real-key signing test.

**Additional owner approval required:** a signed file is an executable transaction authorization, even though it contains no private key. The owner must explicitly accept this two-step workflow and protect the file (private 0700 directory, 0600 file, no cloud sync, backup, git, logs or assistant access). If that is unacceptable, this CLI deployment path is BLOCKED; do not revert to automatic signer selection. No signed file is created by this task.

## Fresh preflight and exact transaction

Approved archive only: `docs/evidence/mandate-vault-approved.wasm`, **366735 bytes**, SHA-256 `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`. CI builds do not replace this approved archive.

Run the isolated reviewer with `node --import tsx scripts/deployment-review/server.ts --live-read-only`, then open `http://127.0.0.1:3456/inspection.json`. It queries only public RPC, pins account/keys to one recent finalized block and fails on existing code, wrong keys/network/account, changed protocol/gas/storage costs or insufficient backing. Archived preview is explicitly historical and never proves current readiness. No wallet button exists.

Read-only fresh evidence additionally needs `view_access_key` for Testing at that same finalized block: require FullAccess and choose **current nonce + 1** using integer arithmetic. Record that block's hash/height and verify actual RPC `chain_id=testnet`. NEAR transaction bytes have no explicit network-ID field. Do not reuse the earlier saved block or nonce merely because the unsigned inspection passed. Stop if nonce is consumed, key changes, code appears, the block ages out, price changes or any observation is inconsistent. Recreate and independently inspect an unsigned envelope with the fresh values before approval.

The November 6 owner-supplied unsigned envelope passed all 14 independent Borsh checks: signer/receiver, Testing public key, nonce `276402391000001`, ordered DeployContract+FunctionCall, exact archive and arguments, gas/deposit, no other actions/trailing bytes and exact reconstruction/hash. Hash `a15115a885e86b3c0688410f25e39374c3d704e338919c391d57baa1f62e1f6d` is **historical inspection evidence only**, not approval to reuse its block. No unsigned/signed envelope is committed here.

Fresh observed balance **4.499958035075 NEAR**, account storage **264 bytes**, protocol88, storage price `10000000000000000000` yoctoNEAR/byte, gas price `100000000` yoctoNEAR/gas. Conservative requirement:

- `(264 + 366735 + 351) × storage price` = **3.6735 NEAR** storage backing (351-byte conservative initialization allowance from sandbox).
- Protocol reserve **0.1 NEAR**, deployment gas ceiling **0.03 NEAR**, safety margin **0.2 NEAR**.
- Total **4.0035 NEAR**; headroom after margin **0.496458035075 NEAR**. No funding action needed under this observation.

These are preflight budgets, not fee-cap flags or public deployment measurements. Actual gas and storage must be reconciled after receipts/refunds. Separate mandate storage credit, allocations and payment budgets remain unapproved.

## Exact future owner commands — DO NOT EXECUTE NOW

Before either command, the owner approves the reviewed commit/artifact, fresh unsigned hash, nonce/block/height, exact two actions, Testing signer, fee ceiling, retained-key governance, signed-file risk and bounded same-hash retries. No authorization for additional transactions, mainnet, key deletion or financial enablement is implied.

In a private owner-only terminal, set `deployment_nonce`, `deployment_block_hash`, `deployment_block_height` to the **fresh independently inspected public values**. They are deliberately not supplied as stale executable defaults. Reverify the artifact immediately before signing. The command reconstructs the inspected deployment; it does not read the earlier unsigned file. Source/argument integrity and fresh inspection must agree.

```sh
# OWNER ONLY, AFTER SEPARATE EXPLICIT AUTHORIZATION. Never run via Codex.
: "${deployment_nonce:?Fresh inspected nonce required}"
: "${deployment_block_hash:?Fresh inspected Testnet block hash required}"
: "${deployment_block_height:?Matching finalized block height required}"
umask 077
deployment_private_dir="$(mktemp -d /private/tmp/avroqen-owner-deployment.XXXXXX)"
/opt/homebrew/Cellar/near/0.31.0/bin/near --offline --quiet \
  contract deploy avroqen-vault.testnet \
  use-file /Users/oluwaseun/Desktop/avroqen/docs/evidence/mandate-vault-approved.wasm \
  with-init-call new json-args '{"network":"testnet"}' \
  prepaid-gas '100 Tgas' attached-deposit '0 yoctoNEAR' \
  network-config testnet sign-with-keychain \
  --signer-public-key ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G \
  --nonce "$deployment_nonce" --block-hash "$deployment_block_hash" \
  --block-height "$deployment_block_height" \
  save-to-file "$deployment_private_dir/signed.json"
```

Stop on any error or unexpected Keychain dialog; never approve Primary access. The owner must privately verify the signed envelope's unsigned portion/hash/public key against the freshly approved inspection without printing or sharing its signature. This final signed-artifact check and owner machine handling remain manual, not automated evidence from this PR. If the file is absent, partial, altered or mismatched, **do not submit**.

After that checkpoint, the separately authorized submission command reads the protected file, not a signed Base64 argument (which would leak into process/command logs):

```sh
/opt/homebrew/Cellar/near/0.31.0/bin/near --quiet transaction send-signed-transaction \
  file-with-base64-signed-transaction "$deployment_private_dir/signed.json" \
  network-config testnet send
```

[Official file submission source](https://github.com/near/near-cli-rs/blob/v0.31.0/src/commands/transaction/send_signed_transaction/network/mod.rs) waits for `Final`; there is no `--wait-until` flag on this particular subcommand. The sender may make an initial request and five bounded retries of the **same signed hash**, not new signatures/nonces. Never restart deployment or create another envelope following uncertainty. Record only the public transaction hash and sanitized receipt evidence. Remove the protected signed file after reconciliation/expiry according to the owner's incident plan; deletion is not guaranteed forensic erasure. Do not expose it for troubleshooting.

## Receipt, code, state and key-removal checkpoints

1. Query public RPC `tx` with the known transaction hash, sender `avroqen-vault.testnet`, `wait_until: "FINAL"`. Verify final execution, transaction identity/public key, exact actions/archive/init/gas/zero deposit and all transaction/receipt outcomes. No `Failure`, unresolved `SuccessReceiptId` or missing outcome may be treated as completion. A CLI success line is insufficient.
2. At a fresh finalized block, `view_code` for this account: Base64-decode bytes and verify SHA-256 equals the approved archive. Verify `view_account.code_hash` equals Base58 of that SHA-256 digest. Use `call_function` for `get_accounting` with Base64 `{}` (`e30=`): require network `testnet`, vault `avroqen-vault.testnet`, zero available/payment_reserved/withdrawal_pending/storage_credit/storage_locked/unallocated_owner_balance, protocol_reserve_minimum `100000000000000000000000`, and actual account/storage/liquid solvency. Check every expected receipt, code and initialized state, not just account existence. Reconcile actual burned gas and refunds separately; do not invent success or compare only gross balance delta.
3. Verify both expected FullAccess keys are still present after deployment. Keep `M6_TRANSACTIONS_ENABLED=false`; do not populate/enable a live financial manifest automatically.
4. **Separate key-removal authorization:** after verified deployment, the owner uses Meteor's account access-key management for this exact Testnet account. Verify the full Testing public key, retain Primary, and review exactly one `DeleteKey` action targeting Testing with signer/receiver this account. Prefer Primary to authorize it. No AddKey, Transfer, DeployContract or extra action is approved. If Meteor cannot show the exact key/action, stop. This is a separate gas-consuming transaction, not included in deployment approval and not performed here.
5. Reconcile deletion receipt to FINAL, then refresh finalized keys. Run `validateKeyPhase(observation, "POST_REVOCATION")`; exactly Primary FullAccess must remain. Separately repeat approved code/state checks. A missing receipt or still-visible Testing key is pending/unknown, never a passed revocation. Local Keychain removal is not onchain revocation and is owner-only, separately handled.

Example read-only key-phase check after an authorized revocation (no wallet access):

```sh
node --import tsx --input-type=module - <<'JS'
import {observe} from './scripts/deployment-review/server.ts';
import {validateKeyPhase} from './packages/domain/src/deployment-preview.ts';
validateKeyPhase(await observe(), 'POST_REVOCATION');
console.log('POST_REVOCATION_KEY_SET_VERIFIED_ONLY');
JS
```

Timeout, missing hash, dropped RPC, unknown receipts or lost callback evidence means UNKNOWN. Quarantine the attempt, inspect finalized public history/code/state, and never automatically re-sign/redeploy. Definitive failure requires receipt evidence and atomic rollback verification; gas can still be burned. A new attempt needs fresh owner approval. No platform recovery key, force-settlement, automatic code replacement or payment enablement is introduced.
