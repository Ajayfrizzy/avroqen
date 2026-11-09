# M3 testnet preparation — NOT AUTHORIZED TO EXECUTE

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

This is a reviewable future plan, not permission to deploy, create keys, sign or
spend. Approximately 20 testnet NEAR is owner-reported availability, not an approved
budget. No mainnet or paid service is involved. Never export keys to the app, agent,
terminal transcript, repository or this runbook.

## Reproduce the tested artifact locally

```sh
rustup show
pnpm install --frozen-lockfile --ignore-scripts
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build -p mandate-vault --target wasm32-unknown-unknown --release --locked
cargo test --workspace --locked -- --nocapture
pnpm test:wasm
shasum -a 256 target/wasm32-unknown-unknown/release/mandate_vault.wasm
wc -c target/wasm32-unknown-unknown/release/mandate_vault.wasm
```

`.cargo/config.toml` must remain in place: the Wasm target needs `--cfg near`.
Sandbox downloads its pinned node on first use and creates ephemeral local-only
accounts. Do not replace `sandbox()` with a public-network runner. The tested
local artifact is 366735 bytes, SHA-256
`b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`.
Use the hash produced by the final approved reproducible build, not an unverified
artifact downloaded from a comment or message. Build outputs are not committed.

## Measured cost basis and proposed ceilings

Sandbox 2.14.0 reports storage byte cost `10000000000000000000` yoctoNEAR.
This is a measurement, not a promise about future testnet protocol parameters.

| Item | Measured/proposed amount |
| --- | --- |
| Code + initialized storage | 367086 bytes × byte cost = **3.67086 NEAR** storage backing |
| Complete multi-mandate test scenario | 375976 bytes = **3.75976 NEAR** total backing |
| Incremental records in that scenario | 8890 bytes = **0.0889 NEAR**, paid from owner storage credits |
| Contract protocol reserve | **0.1 NEAR**, nonwithdrawable minimum |
| Sample execute + receipts | 6221311232387 gas; transaction price must be read from target network |
| Callback allocation / dispatch minimum | 20 Tgas callback / at least 60 Tgas remaining before dispatch |
| Suggested initial vault balance ceiling | **5 NEAR**, includes code storage and protocol reserve; not payment allocation |
| Suggested separate owner storage credit | **0.1 NEAR**; only unused credit is withdrawable |
| Suggested first payment allocation | **0.003 NEAR**, under 0.01 budget and 0.002 per-payment cap |
| Separate proposed caller gas allowance | **0.1 NEAR** maximum for the reviewed test plan, halt/reassess if inadequate |

Proposed total ceiling **5.203 NEAR**, NOT AUTHORIZED. This leaves most of the
reported test tokens unused. The vault deployment balance has **no admin sweep**;
surplus/code/root-state reserve is not recorded as withdrawable owner allocation.
Storage backing for retained records stays locked. Review these consequences before
funding the contract account. Registration `storage_limit` may be 0.05 NEAR for
one controlled mandate, within its owner's 0.1 credit. Stop on credit exhaustion;
do not charge payment allocations or automatically top up.

Before authorization, fetch finalized testnet protocol configuration, gas price,
account balance/code/storage usage and network status using a read-only RPC client.
Record the block hash, `chain_id`, storage price, artifact hash and fee estimate.
Compute all amounts as integers. Gas fee upper bound = requested gas × current
network gas price with an explicit reviewed margin; the measured gas above is only
one scenario, not a worst-case quotation. Review account creation/deployment fee
separately if the owner does not already have a suitable account.

## Owner decisions required before any public transaction

1. Owner identifies the actual testnet deployment account and its wallet controller;
   no invented account, faucet or privileged key. Read-only inspection verifies it.
   The dedicated contract account must differ from mandate owner, agent and recipient.
2. Decide key governance. No Rust upgrade method exists, but a retained full-access
   deployment key can transfer native funds directly, add keys, redeploy code or
   delete the contract externally, bypassing every Rust role and accounting guard.
   Removing keys can be irreversible and requires a separate reviewed ceremony; do not claim immutability.
3. Approve the exact code hash, initialization `{ "network": "testnet" }`, actual
   network, owner/agent/verifier/recipient accounts, optional stop-only guardian,
   canonical policy/digest, deposits, method gas and total ceiling. Owner must be
   able to sign directly: DAO/multisig/relay callers are unsupported v1.
4. Obtain explicit approval for each concrete public-chain action plan. An approval
   of M3 design or a passing sandbox test is not transaction authorization.

## Deployment and call recipe (after authorization only)

Use the owner's trusted NEAR wallet or independently reviewed deployment tooling.
Keep signing inside the wallet. The app contains no transaction sender in M3.
Construct one transaction to the **approved contract account itself**, signed by
that same account, with the following ordered actions:

1. `DeployContract`: code bytes from the approved Wasm artifact.
2. `FunctionCall`: method `new`, UTF-8 JSON args `{"network":"testnet"}`, attached
   deposit `"0"`, prepaid gas `"100000000000000"` (100 Tgas).

The existing account balance must already cover the measured code/base storage and
reserve. Deployment plus init in one transaction avoids an initialization gap.
Initialization rejects a different predecessor/signer. Reinitialization must fail.
Do not use an unlocked backend key or execute copied unreviewed shell signing commands.

After finality, compare RPC `view_code` bytes SHA-256 to the approved artifact
(RPC code hashes are base58-encoded hashes, not hex strings). Check actual chain
ID and account, then `get_accounting`, `payments_enabled`, and empty mandate lookup.
`payments_enabled=true` means contract capability, not proof the UI is connected
or that any particular mandate has authority. Save only public hashes/sanitized views.

For each later call, target only that verified account and inspect exact args in
the wallet. Amounts/deposits below are strings of atomic units, never floats:

| Caller | Method and arguments | Attached deposit |
| --- | --- | --- |
| Owner directly | `storage_deposit {}` | Reviewed credit, e.g. `100000000000000000000000` |
| Owner directly | `register_mandate {canonical_policy, expected_digest, guardian, storage_limit}` | `1` |
| Owner directly | `fund_mandate {mandate_id}` | Reviewed payment allocation |
| Registered agent directly | `submit_proposal {mandate_id, proposal_id, recipient, amount, evidence_digest}` | `0` |
| Selected verifier directly | `attest_proposal {evidence}` (exact MAP-1 fields) | `0` |
| Owner directly | Separate `attest_proposal` with `OWNER_APPROVED`, if required | `1` |
| Owner directly | `authorize_and_execute {mandate_id, proposal_id}` | `1` |
| Owner / stop-only guardian | `pause_mandate {mandate_id}` | `1` |
| Owner directly | `resume_mandate` / `revoke_mandate {mandate_id}` | `1` |
| Owner directly | `withdraw_available {mandate_id, amount}` or `withdraw_storage_credit {amount}` | `1` |

Use 100 Tgas per call for the small reviewed test scenario, subject to the caller
fee ceiling. Registration arguments must contain exact canonical M2 bytes and
SHA-256, correct owner/vault/network, fresh UUID, explicit immutable limits and
quorum; sign a fresh transaction. Never reuse an M2 NEP-413 consent as authority.
No deployed identity is inferred from an application session or organization role.

## Positive and negative procedures

- Register, fund less than the policy ceiling, propose one permitted amount,
  independently attest each selected claim/quorum, obtain separate owner approval,
  then owner dispatches. M5 evidence acquisition is pending: any controlled test
  claim must be explicitly labeled a diagnostic fixture, not real service delivery.
- Verify the native transfer receipt and callback receipt succeed, recipient receives
  exactly the expected amount, reserved becomes spent, and the slot is counted once.
- Attempt wrong caller, wrong recipient/asset/amount, insufficient funding, excess
  cumulative spend, missing/expired proof, wrong domain/digest/nonce and replay.
  Each must reject with protected accounting unchanged, apart from legitimate fees.
- Race two permitted proposals for one allocation: at most one succeeds. Reject
  callback invocation from any external account. Do not intentionally induce unknown
  outcomes on public funds merely to reproduce a local harness test.
- Pause/revoke then attempt a fresh dispatch: reject. Withdraw only available funds.
  An already dispatched transfer may still succeed. A confirmed failed transfer
  releases its funds/slot but the proposal stays terminal; new attempt needs new
  proposal and proofs, never an automatic retry.
- Compare the actual account balance/storage stake with available allocations and
  unused storage credits. Pending transfers may already have left the account;
  do not count them as available or demand double backing for them.

## Evidence, timeout and emergency handling

Record reviewed commit, Wasm hash, actual chain/account, policy digest, public tx
and receipt IDs, caller roles (no keys), gas/deposit amounts, finalized before/after
views and exact balance differences. Check the entire receipt graph; an RPC success
or event log alone is not a successful payment. On timeout, query views/receipts:
never replay the transfer. Pending/unknown obligations stay quarantined indefinitely.

Guardian can pause only; owner can pause/revoke and withdraw unreserved balances.
There is no admin recovery, rollback, force-settlement or unilateral Rust upgrade.
A broken callback can strand obligations permanently. Stop testing and document the
observed state instead of introducing an emergency bypass. Public deployment,
wallet transaction review, actual testnet receipts and independent security review
remain pending; nothing in this document marks them passed.
