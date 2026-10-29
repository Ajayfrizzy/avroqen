# MandateVault contract specification v1

**Status:** design contract; not deployed, implemented, tested, or audited.

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
2. `available_allocated = total_budget - spent - reserved`, subject to actual vault balance and obligations.
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
