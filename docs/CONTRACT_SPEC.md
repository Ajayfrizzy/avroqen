# MandateVault contract specification v1

**Status:** M3 implemented and locally verified; not publicly deployed or independently audited. See M3_REPORT.md for exact evidence and M3_DESIGN.md / D014 for approved v1 decisions.

## Custody and roles
Owner-funded NEAR accounting, logical sub-ledger per owner+mandate. Owner wallet signs create/fund/revoke/withdraw. Agent registered for proposal calls only. Verifier registered by owner for narrow claims. Guardian stop-only. Platform admin cannot withdraw, reassign ownership or raise a budget. If deposit and allocation are split, specify and test custody of unallocated funds and storage/gas reserves.

## Types (illustrative, final Rust names may differ)
```
Mandate { id, owner, agent, allowed_recipient, asset: NativeNear,
  max_per_payment:u128, total_budget:u128, spent:u128, reserved:u128,
  expires_at_ns:u64, max_executions:u32, executed_count:u32,
  pending_count:u32, policy_version:u32, verifier_policy,
  status:Active|Paused|Revoked }
Proposal { id, mandate_id, agent, recipient, amount:u128, evidence_hash,
  created_at_ns, state }
Attestation { mandate_id, proposal_id, policy_version, verifier,
  evidence_hash, claim, expires_at_ns, nonce, status }
Execution { id, proposal_id, mandate_id, amount, recipient, status,
  outgoing_receipt_id?, created_at_ns, updated_at_ns }
```
Avoid ambiguous `max_executions`: count **reserved + successful** execution slots to prevent concurrency cap bypass; document whether failed attempts consume slots and recovery policy. Canonical mandate changes require revocation + a NEW mandate/version; active pending records remain immutable.

## Accounting invariants
1. `spent + reserved <= total_budget`, all operations checked with overflow-safe integer arithmetic.
2. `available_allocated = deposited - reserved - spent - withdrawal_pending - withdrawn`. Budget is an authorization ceiling, never a deposit. `spent + reserved <= total_budget`; never infer available funds from unused budget.
3. All earmarked user funds + pending obligations + unallocated user balances + protocol reserves must be reconciled against contract assets. Account for gas/storage costs separately from user entitlements.
4. Reservations are created **before** external transfer within the originating transaction, committed only on authenticated callback.
5. No owner withdrawals from reserved amounts. No hidden admin sweep.
6. Approval ID, proposal ID, and attestation nonce cannot be replayed across mandates or execution attempts.
7. `asset_id`, network, vault account, policy version, amount and recipient domain-bind any attestation.
8. Revoked/paused/expired mandate cannot create new reservations. Already dispatched transfers may still settle.

## Interface candidates
- `create_mandate(args)` owner-auth, no agent supplied owner identity.
- `fund_mandate(id)` payable owner-auth, validated attachment and accounting.
- `set_agent(id, agent)` owner-auth, disabled when pending transition would be unsafe.
- `submit_proposal(args)` predecessor in registered agent; unique ID and bounded data.
- `attest_proposal(args)` caller is owner-designated verifier; unique attestation and verification policy.
- `authorize_and_execute(proposal_id)` atomic revalidation, reservation, execution-limit allocation, outbound transfer, chained private callback.
- `on_settlement_result(execution_id, callback_result)` **private**, idempotent only where safe, reconcile success/failure; never callable by agent.
- `pause_mandate(id)`, `revoke_mandate(id)`, `withdraw_available(...)`, `get_mandate`, `get_execution`, `get_balance`.

## Settlement states
PROPOSED -> EVIDENCE_READY -> (atomic policy authorization + reserve) RESERVED -> PENDING -> SUCCEEDED or CONFIRMED_FAILED; UNKNOWN means operator/read model has insufficient information, not necessarily a writable onchain state. Contract must never erase the only record of an unresolved obligation. Explicitly model rejects, cancellation before dispatch, and owner revocation.

## Async edge cases and tests
- Callback failure/no receipt in worker must not cause automatic retry or double transfer.
- Promise failures must not finalize spend; reservation released only if transfer failure can be established from chain result.
- When the outgoing transfer might have happened, **never** assume failure or reissue funds automatically.
- Any `ft_transfer` extension needs registration and cross-contract callback semantics independently modeled.
- Gas/storage reserve under low-balance case; gas griefing; storage deposit refund behavior; attached deposit spoofing.
- Prohibit self-upgrade/self-destruct, permission escalation, unrestricted `Promise::new(...).transfer(...)` caller paths.

## Rust engineering gates
`cargo fmt --check`, `clippy`, Rust unit tests, workspaces sandbox integration, invariant/property/fuzz tests where feasible. Deploy compiled artifact to testnet only after owner approval. Record wasm hash + network/account and exact contract revision.

## Implemented M3 v1 interface and limits

The candidate list above is superseded by the explicit v1 implementation:
`new`, `storage_deposit`, `register_mandate`, `fund_mandate`, `submit_proposal`,
`attest_proposal`, `authorize_and_execute`, `pause_mandate`, `resume_mandate`,
`revoke_mandate`, `withdraw_available`, `withdraw_storage_credit`, private
`on_settlement_result` / `on_withdrawal_result`, and read-only `get_*` views.
There is no `set_agent`, policy editor, key manager, admin transfer or upgrade.
M2 canonical bytes and SHA-256 bind fresh direct owner authorization; organization
and agent UUIDs are metadata, not chain-authenticated application memberships.

Exactly one native transfer attempt per proposal. Confirmed failure restores funds
and execution slot; unknown callback outcomes remain reserved. Quorum applies to
each required claim; separate OWNER_APPROVED is owner-only when selected. Dispute
is terminal before dispatch. Guardian pauses only. Owner resumes/revokes and is
sole execution/withdrawal caller. Direct signer=predecessor excludes relays/DAOs.
Owner nonfunding mutations attach exactly 1 yocto; that dust is nonwithdrawable
protocol surplus. Agent/verifier zero-deposit calls use bounded owner storage.

128 lifetime proposals per mandate, 16 verifiers, 2 third-party claims, at most
34 attestations per proposal, 8 KiB canonical policy input. Retained records have
no deletion/refund path. Withdrawals charge owner credit outside agent allowance.
Policy changes require a new mandate. IDs/nonces cannot be recycled. M3 narrows
UUIDs to lowercase canonical form; clients should use generated normalized UUIDs.
Amounts and u64 view identifiers/timestamps use decimal JSON strings; counters are
u32. Native transfer results must be empty successful results or definitive failures.

Minimum protocol reserve is 0.1 NEAR, separate from storage and all owner balances.
Execution/withdrawal requires at least 60 Tgas remaining and allocates 20 Tgas to
its callback. A native transfer may have left the account before its callback;
liquid checks cover available allocations + unused storage credits + runtime
storage stake + protocol reserve + new outgoing amount, without counting already
dispatched pending liabilities twice. All liabilities remain visible in views.
Deployment keys, actual-network preflight and public testnet approval remain open.
