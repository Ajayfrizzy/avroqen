# M6 — Testnet orchestration and reconciliation

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

Status: implementation in progress; no live transaction or deployment authorized.

## Authority and deployment decision

The owner selected `avroqen-vault.testnet` and explicitly accepted retaining an owner-controlled deployment full-access key for the small hackathon demonstration. Such a key can replace the contract or transfer its funds directly, outside Rust policy enforcement. Application isolation cannot remove this risk. This is a design decision, not authorization to create the account, deploy, add/remove keys or transact. The initial November 2 lookup returned `UNKNOWN_ACCOUNT`; this is superseded by the finalized account observation in the final-review section below.

Only wallet-controlled, direct owner/agent/designated-verifier transactions are supported. No backend or worker signer exists. Agent bearer capabilities do not authorize blockchain signing. M2 consent and M5 review signatures remain offchain; each onchain operation requires a separate wallet prompt. LOCAL_EXERCISE evidence is ineligible.

## Immutable operation boundary

An intent binds one authenticated account, organization, testnet, pinned deployment, immutable canonical M2 policy/digest, optional M4 proposal and M5 review, and a single allowlisted FunctionCall with exact arguments, gas and deposit. Values are canonical integer strings. The client cannot choose a receiver, method, arbitrary arguments or transfer action. Emergency withdrawal/revocation must remain accessible after offchain consent expiry/revocation; these actions never restore spending authority.

Deployment configuration is absent/disabled by default. Enabled configuration must pin bytecode SHA-256, account and approved public-key fingerprints. Read-only finalized RPC verifies actual chain ID, bytecode, account keys and initialized contract domain. This relies on the trusted RPC provider, not a light-client proof; replacement through retained keys remains possible between verification and execution.

## Durable lifecycle and uncertainty

PREPARED → AWAITING_WALLET → BROADCAST_REPORTED → SUBMITTED → FINALIZING → CONFIRMED_SUCCESS / CONFIRMED_FAILED. Any RPC or wallet ambiguity becomes UNKNOWN, retaining the operation lock. Wallet output is only a hash claim. No timeout releases a financial reservation or creates another transaction. Cancellation before opening the transaction prompt can leave an unsigned intent; after opening, absence of a hash does not prove absence of broadcast.

A unique unresolved signer/vault operation prevents parallel retries through this application. Reconciliation is read-only, idempotent and restartable. Intent/event persistence is atomic. Reconciliation verifies exact signer/receiver/action bytes/deposit, finalized receipt descendants, and contract outcome. A top-level successful call is insufficient to prove an outgoing transfer. Failed/missing callbacks leave contract obligations quarantined. Worker cannot repair contract state or retry transfers.

Missing-hash recovery scans finalized blocks/chunks from the intent anchor for exact operation matches. Multiple matches, pruned history, stale/conflicting data or missing receipt bodies remain unresolved. Scans are bounded per cycle and never submit transactions. Verified hashes alone receive explorer links.

## Verification plan before enabling live submission

Tests must cover altered transaction identity and arguments, receipt graph gaps, callback failure, definitive transfer failure, repeated/reordered observations, conflicting finality, unknown hashes, database rollback/concurrency/restart, tenant/role isolation and existing contract conservation. Real PostgreSQL, browser, Rust/Wasm and sandbox gates remain mandatory. M8 covers genuine wallet/device and independent-source acceptance; no fixture is live evidence.

## Implementation review findings

The actual sandbox-to-application receipt test initially failed with `DISPATCH_NOT_CONFIRMED`: M3 calls `promise_return`, so the root outcome is `SuccessReceiptId`. The verifier now requires that reference to equal the exact settlement callback ID, then verifies callback dependencies, result and contract state. Actual successful and definitively failed sandbox transfers both pass without weakening settlement requirements.

Review also found that the initial M6 membership lookup omitted the existing `status='active'` predicate. This was corrected before delivery, authorization rows are read with shared locks, and a PostgreSQL regression denies disabled membership at preparation and prompt opening. New-submission disablement no longer stops the read-only worker. These are self-review findings and fixes, not an external audit.

## Final review clarification

See [VAULT_GOVERNANCE.md](../../VAULT_GOVERNANCE.md) and D019 for the dedicated demonstration account, retained FullAccess risks and unimplemented production factory direction. Existing M3 custody/initialization is unchanged. The earlier UNKNOWN_ACCOUNT observation is superseded by finalized block 275954911: 4.5 NEAR, no deployed code, one FullAccess key. Deployment and funding remain unauthorized.

Transaction attribution additionally requires inclusion strictly after the immutable intent creation anchor. The anchor hash must still match its canonical height. Identical historical transactions cannot satisfy a newer intent, including deposits with otherwise identical arguments.
