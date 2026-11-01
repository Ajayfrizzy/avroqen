# M3 testnet preparation — NOT AUTHORIZED TO EXECUTE

No deploy, account/key creation, wallet transaction or token transfer is authorized
by this runbook. Approximately 20 testnet NEAR is owner-reported availability, not
a spending budget granted to this agent. No mainnet instructions are provided.

Before requesting deployment approval, fill this checklist with measured evidence:

1. Identify exact reviewed commit, complete green financial sandbox/unit/property
   and foundation/rust CI results, remaining risks and contract completeness.
2. Reproduce locked release build and compute `shasum -a 256
   target/wasm32-unknown-unknown/release/mandate_vault.wasm`. Record size and hash;
   compare deployed code hash via finalized RPC after authorized deployment.
3. Owner identifies testnet deployment account and controller in their wallet.
   Verify actual network, account existence and permissions using read-only RPC.
   Never request/export keys. Account key governance/removal needs separate explicit
   review: merely omitting a Rust upgrade method does not prevent key-based redeploy.
4. Estimate code/base-state storage using measured byte count times the current
   protocol storage price; add measured call gas at current gas price and an
   explicit reserve, bounded storage-credit allowance and small test allocations.
   Record source block/protocol values and upper bounds. No numbers or costs can
   yet be quoted because M3 artifact and storage measurements do not exist.
5. Present exact initialization domain, guardian choice, methods, arguments,
   deposits, gas, recipients, per-call and total maximum spend and reserve to owner.
   Get explicit authorization for that concrete transaction plan. Do not assume
   all available tokens should be deposited or that a faucet is approved.
6. Register one exact M2 policy with fresh onchain owner authorization. Confirm
   onchain owner/domain/policy bytes and digest; do not convert app consent to active
   state without finalized evidence. Fund a deliberately smaller amount than budget
   and verify allocation/storage separation before any authorized positive payment.
7. Execute approved test cases with narrow limits. Negative requests must leave
   protected balances unchanged except transaction fees. Positive execution needs
   real authorized verifier attestations and any required separate owner approval.
   M5 production evidence acquisition is not faked by fixture attestations.
8. Inspect actual transaction and receipt graph, private callback outcome, views,
   recipient balance changes and all accounting identities. Save public hashes and
   sanitized outputs only. Timeout is pending/unknown, never automatic retry.
9. Pause/revoke blocks new reservations only after inclusion; it does not claw back
   dispatched transfers. Withdraw only available owner funds using the approved
   guarded path. Unknown obligations may remain locked indefinitely. No admin repair,
   rollback or unilateral upgrade can be assumed to recover a broken contract.

Exact deploy commands, cost table, artifact hash and bounded funding plan remain
UNPREPARED until implementation, tests and the required owner design decisions.
