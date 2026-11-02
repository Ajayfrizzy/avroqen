# M6 controlled Testnet authorization package

**NOT AUTHORIZED TO EXECUTE. No live deployment or financial transaction has been performed.** The owner selected the target account and governance design, not transaction execution. M8 integrates physical Android, desktop wallet, genuine verifier signing and independently retrieved source acceptance. iOS remains deferred.

## Target and artifact

- Intended account: `avroqen-vault.testnet`.
- Read-only inspection November 2, 2026: public RPC `status.chain_id = testnet`; finalized account lookup returned `UNKNOWN_ACCOUNT`. Ownership, balance and access keys are therefore **unverified**, not empty/secure. Obtain separate authorization to create/fund this exact account, or select an existing owner-controlled account and update the authorization package. Do not invent credentials.
- Release artifact: `target/wasm32-unknown-unknown/release/mandate_vault.wasm`, 366,735 bytes.
- Locally rebuilt SHA-256: `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`.
- Rebuild: `cargo build -p mandate-vault --target wasm32-unknown-unknown --release --locked`; verify `pnpm test:wasm` and `shasum -a 256 target/wasm32-unknown-unknown/release/mandate_vault.wasm`. Repeat after any Rust/toolchain change. Cross-host bitwise reproduction must be checked against the approved release artifact before deployment; a local hash is not proof of hosted byte-for-byte identity.

## Governance accepted by owner

Retain an owner-controlled deployment full-access key for the small demonstration. This permits code replacement, direct fund transfer, and account deletion outside contract controls. Backend, agent, worker and verifier never receive it. No key is created/deleted/rotated by M6. Alternative immutable-key-removal or DAO governance was not selected and must not be silently substituted. A deployment account should not be used as a routine agent or verifier identity.

Initialization is direct vault-account signing only. Prefer deployment plus `new({"network":"testnet"})` in one owner-reviewed transaction, preventing a separate initialization window. Verify the actual RPC network before signing; the VM's configured network string is not itself proof of network. No unilateral admin recovery or upgrade method exists. Retaining the deployment key is **not** an approved rollback mechanism: replacing code cannot reverse paid transfers and can corrupt retained state.

## Proposed small budget — requires approval, not an expenditure

Local sandbox measured base initialized storage: 367,086 bytes at 10,000,000,000,000,000,000 yoctoNEAR/byte = **3.67086 NEAR**, plus the contract **0.1 NEAR** protocol reserve. These are sandbox measurements; re-query current testnet protocol storage price and gas price and measure actual account storage before approval. Proposed deployment account backing: **4 NEAR**, conditional on those measurements. This is vault storage/reserve backing, not spendable mandate funding.

Proposed separate owner storage credit: **0.2 NEAR**; registered mandate storage ceiling **0.15 NEAR**. Local full workflow grew storage from 367,086 to 375,976 bytes; this is evidence for sizing, not a guarantee for arbitrary policy sizes. Retained records permanently lock their measured backing. Proposed mandate funding **0.003 NEAR**, successful payment **0.001 NEAR**, total policy budget **0.003 NEAR**, two successful-or-pending execution slots. Keep all storage and payment accounting separate. Proposed aggregate transaction gas ceiling **0.1 NEAR**, measured against actual protocol gas price before signing; pause if that cap would be exceeded. Do not automatically top up any account.

Required public identities: original owner, policy-designated agent, independent verifier(s), separate recipient, optional guardian. Each actor uses their own existing testnet wallet. App bearer credentials never sign transactions. Ensure verifier quorum per third-party claim and distinct original-owner per-payment approval when required. Genuine independent evidence must be retrieved outside the agent-produced payload; synthetic exercises are ineligible.

## Later authorized execution sequence

1. Record written approval for account creation (if needed), exact artifact, deployment/initialization, each funding/storage cap, participating public accounts and retained-key risk. Confirm no mainnet account/provider.
2. Inspect finalized account and every access key. Record **public-key/permission fingerprints**, using SHA-256 of `public_key + ':' + JSON.stringify(access_key.permission)`. Verify owner control separately with their wallet; RPC key listing alone does not prove human custody. Never collect keys or wallet secrets.
3. Owner deploys/initializes using their wallet/tool under the separate approval. Record actual transaction hash, finalized receipts, account code hash and `get_accounting` domain/reserve. Compare decoded code SHA-256 with the approved artifact.
4. Configure API `M6_TRANSACTIONS_ENABLED=true`, `NEAR_NETWORK=testnet`, exact `M6_VAULT_ACCOUNT`, `M6_WASM_SHA256`, `M6_KEY_FINGERPRINTS`, `M6_AUTHORIZATION_REFERENCE`. Until then submission remains disabled. Apply these only to the approved testnet environment. The worker requires no wallet keys and continues reconciling existing intents even when new submissions are disabled.
5. At `/workspace/settlement`, select the immutable mandate. Deposit owner storage credit, register exact terms, then fund that mandate. Each step has a distinct review and wallet prompt. Wait for verified finality before the next operation.
6. Agent wallet submits the exact M4 proposal. Designated verifier reviews genuine source evidence through M5, signs the separate onchain attestation through M6, and owner signs the separate per-payment approval if required. Ensure the actual onchain attestations, identities and expiries are visible; backend readiness is insufficient.
7. Original owner executes the eligible proposal. Capture actual recipient pre/post finalized balance, transaction hash, all receipt IDs, callback outcome and mandate accounting. A verified successful receipt and matching `Succeeded` state are required. Record explorer URLs only for actual verified hashes.
8. Try one prohibited action under the same explicit gas authorization (e.g. execute a proposal missing owner approval). Require a finalized contract failure, unchanged recipient balance and unchanged protected availability/reserve/spent accounting. Do not counterfeit success or deliberately create an uncertain double payment.
9. Owner pauses/revokes, confirms finalized state, and withdraws only available funds. Test pending withdrawal recovery with receipt/state evidence. Locked storage backing cannot be withdrawn. Pausing does not cancel already-dispatched transfers; unknown callbacks retain obligations indefinitely.
10. Disable new submissions at the end. Keep the read-only worker operating until every known operation is terminal or explicitly quarantined. Record unresolved operations rather than forcing settlement. No automated retries, timeout reserve release, or admin withdrawal.

## Evidence checklist

Store public account IDs, approved policy/proposal/review references, actual tx hashes, receipt IDs, finalized block hashes/heights, amounts, costs and recipient balance deltas in the M6 report. Exclude session/cookie tokens, signed message bodies, private keys and wallet backups. Label sandbox evidence, synthetic fixtures, human assertions and genuine live results separately. There are currently **no live transaction or explorer references** for M6.
