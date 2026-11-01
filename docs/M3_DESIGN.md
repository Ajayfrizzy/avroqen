# M3 MandateVault — security design for owner decision

Status: proposed, not owner-approved and not implemented. M2 baseline is
`193ed2da6f14cd613fd1799752c37ac76c87e848`; branch `feat/m3-mandate-vault`.
This document does not authorize deployment, public-network transactions or spending.

## Existing obligations

Native NEAR only; checked u128 atomic units; immutable M2 policy; per-claim
verifier quorum plus separate per-payment owner approval when selected. Agent
proposes only. Owner signs actual onchain registration/funding/controls. Backend,
org role, M2 approval and NEP-413 message never authorize custody. All S01–S20
contract-relevant cases require actual Rust/Wasm/sandbox evidence. M5 supplies
independent evidence acquisition; M3 checks its narrow onchain attestations.

## Decision A — custody attribution and storage (recommended proposal)

Use direct owner funding into a specific registered mandate. Do not introduce an
unallocated deposit pool in v1: an attached deposit to fund_mandate is attributed
only to the verified owner and selected mandate. Reject third-party funding rather
than guessing who owns a refund. Wrong/missing mandate and excess funding reject
atomically, leaving deposit return to NEAR's failed-call semantics.

Keep spendable allocation separate from prepaid owner storage credit and protocol
reserve. Owner explicitly deposits storage credit through a distinct method.
Account initialization needs an attached deposit sufficient for its own measured
storage footprint before any surplus is credited. Charge actual measured storage
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

## Decision B — authority, domain and execution caller (recommended proposal)

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

## Decision C — failed execution and unresolved obligations (recommended proposal)

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

## Accounting model to prove before implementation acceptance

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

## Evidence/proposal bindings

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

## Implementation and testing plan after decisions

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

Integration initially exposes typed interfaces and NOT_DEPLOYED/unavailable state.
No backend transaction signer or wallet auto-send. Actual testnet connection and
transaction consent are a later explicitly authorized action. Public-chain indexer
reconciliation remains M6; onchain outcome views and truthful pending statuses are M3.
