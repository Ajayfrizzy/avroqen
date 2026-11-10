# MandateVault contract specification v1

**Status:** M3 is implemented and locally verified. [Owner-verified November 7, 2026 NEAR Testnet evidence](DEPLOYMENT_KEY_GATE_REPORT.md#owner-verified-testnet-deployment--november-7-2026) records deployment and initialization. Public payment acceptance and independent security audit remain incomplete; financial operations remain disabled. See archive/milestones/M3_REPORT.md for historical local evidence and archive/milestones/M3_DESIGN.md / D014 for approved v1 decisions.

## Custody and roles
Owner-funded NEAR accounting, logical sub-ledger per owner+mandate. Owner wallet signs create/fund/revoke/withdraw. Agent registered for proposal calls only. A verifier registered by the owner for narrow third-party claims must be distinct from the mandate owner, restricted agent, exact recipient and vault account. Guardian stop-only. Platform admin cannot withdraw, reassign ownership or raise a budget. If deposit and allocation are split, specify and test custody of unallocated funds and storage/gas reserves.

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
Deployment/key evidence is recorded separately; actual-network preflight and
explicit approval remain required for every future public Testnet action.

## Detailed v1 custody and execution requirements

These approved v1 requirements are preserved from [the historical M3 design](archive/milestones/M3_DESIGN.md).
The implemented interface and measured limits above take precedence over earlier
candidate wording. Historical implementation planning and test observations remain
in the archive; this consolidation changes no contract or financial policy.

### Existing obligations

Native NEAR only; checked u128 atomic units; immutable M2 policy; per-claim
verifier quorum plus separate per-payment owner approval when selected. Agent
proposes only. Owner signs actual onchain registration/funding/controls. Backend,
org role, M2 approval and NEP-413 message never authorize custody. All S01–S20
contract-relevant cases require actual Rust/Wasm/sandbox evidence. M5 supplies
independent evidence acquisition; M3 checks its narrow onchain attestations.

### Approved A — custody attribution and storage

Use direct owner funding into a specific registered mandate. Do not introduce an
unallocated deposit pool in v1: an attached deposit to fund_mandate is attributed
only to the verified owner and selected mandate. Reject third-party funding rather
than guessing who owns a refund. Wrong/missing mandate and excess funding reject
atomically, leaving deposit return to NEAR's failed-call semantics.

Keep spendable allocation separate from prepaid owner storage credit and protocol
reserve. Owner explicitly deposits storage credit through a distinct method.
The implemented nonpayable `new` checks existing account backing for measured
root-state storage and the protocol reserve; it does not require a new attached
initialization deposit or credit surplus to an owner. This is the deployed v1
realization of the design's storage-backing requirement, superseding its earlier
attached-deposit wording retained in the archived design. Charge actual measured storage
bytes at the runtime byte cost, with checked arithmetic; never charge storage to
mandate payment allocation. Agent/verifier calls attach zero deposit and can use
only that mandate's owner-approved bounded storage allowance. Bound strings,
verifier count, records and outstanding proposals; exhausted credit rejects without
partial state or a transfer. Preallocate callback state so settlement cannot need
new unpaid storage. Exact limits and gas minima will be measured in sandbox and
recorded; no fabricated fixed-cost quote.

Unspent storage credit is withdrawable only by its owner through the same guarded
asynchronous withdrawal mechanism. Storage backing for retained immutable/history
records remains locked while those records exist; disclose that cost, never promise
all storage deposits are refundable. No owner can withdraw protocol reserve,
other owners' storage credit, reserved or unresolved obligations. Initial deployment
balance backs code/base state and a non-spendable reserve; no admin sweep. Caller
transaction gas is distinct from vault storage and transfer obligations. Enforce
sufficient prepaid gas before dispatch and preserve safe callback gas.

Alternative: pooled unallocated owner balances with later allocation. This is
viable but needs additional allocation/refund transitions and accounting; it is
not necessary for the mandated owner+mandate funding flow. Alternative: contract
sponsors all storage. Rejected as a storage-drain risk unless tightly funded and
bounded under a separate explicit policy.

### Approved B — authority, domain and execution caller

Use direct-call authority for initial owner and verifier controls: require
predecessor == signer and expected owner/verifier. This deliberately excludes
multisig/DAO contracts and relayed/meta-transaction control for v1; supporting them
requires a separately reviewed predecessor-based capability model. Owner-sensitive
non-funding mutations require exactly one yoctoNEAR to exclude ordinary restricted
function-call keys; document that dust attribution outside user allocations.
Agent proposal calls use predecessor == registered agent and no attached deposit;
restricted proposal-only agent keys remain possible without granting custody.

Only the original owner may request execution of an eligible proposal in M3.
Verifier/agent/backend cannot initiate dispatch. All policy/proof/fund checks still
run atomically onchain. Alternative: permissionless keeper execution after proofs;
this is a substantive caller-authority choice, not an implicit backend permission.

The owner registers full canonical M2 bytes plus expected digest in a fresh
wallet-authorized transaction. Rust parses strictly, validates all typed fields,
reproduces canonical order/set normalization, verifies digest and requires exact
owner == caller and vaultAccount == current_account_id. Use cross-language byte
vectors, including Unicode escaping, rather than assuming JSON libraries agree.
Bind UUID mandate/org/agent identifiers as immutable metadata; contract roles come
from onchain accounts, not unverified organization membership claims. Same immutable
ID cannot be registered twice. Corrected policy needs a new mandate and consent.

Network is an immutable initialization domain checked against policy.network.
NEAR VM does not expose a trustworthy chain-id host call: a configured label cannot
prove the network. Deployment/client preflight must check actual RPC network,
account and bytecode, and wallet transaction must target that account. Do not claim
cryptographic cross-chain domain authentication from a configured string alone.
Initialization must be tied to the contract account's own authorized setup, not
open to an arbitrary first caller. No upgrade/delete-key/transfer-admin method.

Guardian: optional owner-selected stop-only account bound at registration, separate
from M2 policy and visibly reviewed as an additional onchain stop capability. It
can pause that mandate only, never change terms, fund, attest, execute, withdraw,
resume or revoke ownership. Only owner can resume a paused unexpired mandate;
revocation is terminal. Guardian replacement needs new authorization/design, not
an admin setter. Contract account full-access deployment keys can redeploy code
outside Rust methods: immutability cannot be claimed until an explicitly approved
key-removal/governance ceremony is completed. No such ceremony is authorized now.

### Approved C — failed execution and unresolved obligations

Each proposal has one immutable ID and at most one execution attempt. Execution
reserves amount and one execution slot before dispatch. Success moves reserved to
spent and pending slot to successful slot. Definitive promise failure releases
amount and slot; that proposal is terminal, and another attempt requires a NEW
proposal and fresh attestations/owner approval. No automatic retry or reuse of
old evidence. Alternative: failed attempts permanently consume an execution slot;
more restrictive, but differs from reserved+successful semantics in CONTRACT_SPEC.

A private callback requires predecessor == current_account_id, exactly one promise
result and an execution in the expected pending state. Caller-supplied booleans are
never settlement evidence. Duplicate callbacks cannot alter amounts or counts.
Missing callback, panic, timeout or inaccessible receipt leaves the obligation
reserved and nonwithdrawable. No force-success, force-failure, admin reconciliation
or timeout-release API. This can strand funds if the callback irrecoverably fails;
recovery would need a separately reviewed chain-proof mechanism. UI may label
unknown observation, but never convert it to a failed financial state.

Withdrawals are also asynchronous transfers: debit available credit into a distinct
pending-withdrawal obligation, transfer ONLY to its original owner, then finalize
or restore from actual callback result. Unknown withdrawals remain quarantined.
Withdrawal is allowed after pause/expiry/revocation but not from pending spending.
Funding credits are not budget ceilings: funding only 1 NEAR under a 10 NEAR policy
cannot make the other 9 spendable. No unused allowance can be counted twice.

### Accounting model to prove before implementation acceptance

Per mandate: authorized B, available A, payment reservation R, successful spending S,
pending owner withdrawal W, successful withdrawals X and total allocated deposits D.
Checked invariants: S+R <= B; D = A+R+S+W+X; no component underflows. Slots track
pending+successful <= maxExecutions. Funding/refunding cannot reset S or counters.
Storage available/locked and protocol reserve are separate global liabilities.

A dispatched amount may already have left the account while R/W remain pending;
never assert account_balance alone covers those pending obligations a second time.
Before dispatch prove liquid balance covers non-dispatched obligations plus storage
stake/reserve and the requested transfer. Track outbound pending gross amounts
conservatively, accounting for attached deposits and NEAR balance semantics. Prove
this against actual sandbox receipts at each relevant transition, including failure
refund order, rather than accepting a paper formula. Direct unsolicited transfers
are surplus, not automatically owner-credit or admin-withdrawable funds.

### Evidence/proposal bindings

Agent proposes exact mandate/version/domain/recipient/amount and evidence digest;
contract enforces policy at proposal and again at execution. IDs are mandate-scoped
and cannot be recycled. Store immutable bounded proposal data and consumed nonces.
Verifier predecessor must be selected by that policy; require matching network,
vault, mandate, policy, proposal, asset, recipient, amount, digest, claim, issue/expiry
and unique nonce. Count distinct valid verifiers for EACH required claim at dispatch;
expired proofs no longer count. Owner approval is a separate owner-authenticated
per-payment action bound to the same proposal and digest. M2 consent never counts.

DELIVERY_DISPUTED by an authorized verifier or owner makes that proposal permanently
non-executable before dispatch, without undoing already dispatched transfers.
Resolving a dispute needs a new proposal and fresh proofs, not a backend override.
Owner can stop a compromised verifier's mandate by pause/revoke; changing verifier
identities requires a new immutable policy. Verifiers cannot self-register.

### Implementation and testing

Retain near-sdk 5.30.0 scaffold/workspace conventions. Split policy, state/accounting,
authority, execution and tests into reviewable modules. Add exact pinned sandbox
tooling only after compatibility checks. Unit tests use the NEAR runtime harness;
sandbox tests deploy ONLY to ephemeral local accounts with valueless local balances,
exercise actual Wasm/native transfer receipts, callbacks and account balances.
No public testnet operation is covered by that testing authorization.

Test every requested adversarial category, plus cross-language canonical bytes,
funding attribution, locked/unlocked storage, withdrawal failures, conflict/race
orderings, callback replay and conservation under generated action sequences.
Preserve M1/M2 suites. Replace the M0-only Wasm allowlist assertion with an exact
reviewed M3 method/host-call gate plus real sandbox tests; do not simply delete the
no-transfer assertion while leaving no financial test gate. CI must fail if sandbox
or financial invariants fail; no skipped sandbox tests disguised as success.

### Implemented bounds and accounting details

See CONTRACT_SPEC.md for the exact exported methods, record/gas limits and amount
representations, and archive/milestones/M3_REPORT.md for actual evidence. The 0.1 NEAR protocol reserve
is a fixed nonwithdrawable minimum, not a dynamically estimated gas guarantee.
Callers prepay execution gas. Callback records use fixed-width outcome/accounting
updates; no new storage is allocated during settlement. Available owner withdrawal
records use separate owner credit, never the agent/verifier allowance. Record
storage remains locked indefinitely. Initial code/root state is deployment-funded.

Attestations are one per signer+claim+proposal; expired proofs cannot be refreshed
in-place. A new proposal and fresh nonces are required. The approved bounds can
exhaust lifetime proposal capacity; recovery is owner withdrawal and new mandate,
not history deletion. Known UUIDs can be preemptively registered by another owner:
this cannot redirect the authentic owner's funds, but can deny that ID. Clients
must check exact owner/policy and create a fresh UUID on collision. No app tenant
metadata is asserted to be independently authenticated by the chain.

Structured registration/status/dispatch/settlement events and persistent views
support later indexing. M6 must check receipt success and finalized state, not
interpret a log line or an RPC timeout as settlement. Direct native host calls
limit the Wasm capability surface to transfer plus a private self-callback.
