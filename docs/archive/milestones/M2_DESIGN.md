# M2 — typed mandates and offchain wallet consent

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

Status: owner-approved M2 design, implemented as offchain consent only.
The owner approved all three choices: offchain NEP-413 approval/revocation, explicit
quorum/claim bindings, and per-claim quorum plus distinct owner approval.
No deployed or enforceable onchain authorization is claimed. Baseline is the merged M1
commit `6c2c7431949945ddcb547fcd69a4cbe208b656b5` on staging.

## Scope and trust boundary

Reuse M1 sessions, same-origin API, CSRF, finalized FullAccess Ed25519 verification,
wallet normalization/cancellation, migrations and tests. M2 records typed intent
and explicit wallet consent; it cannot create an active MandateVault mandate.
`onchainStatus` is always `NOT_SUBMITTED` in M2, with no transaction/receipt fields
fabricated. M3 must obtain separate owner-signed onchain authorization and verify
network, deployed vault, exact terms and state. No replay of an M2 signature can
invoke an onchain operation. Agent records convey no credentials or spend rights.

## Implemented canonical snapshot v1

Strict objects reject unknown fields; canonical strings reject coercion. Snapshot
creation derives owner/network/org from the authenticated and authorized server
context, never from an arbitrary client owner field.

| Field | Representation and rule |
| --- | --- |
| schemaVersion | integer literal 1; serialization version |
| mandateId, organizationId | server-generated mandate UUID and authorized org UUID |
| policyVersion | bounded positive u32; initial independent mandate version 1 |
| ownerAccount | authenticated wallet account; immutable |
| network | server-selected testnet/mainnet identifier; development uses testnet |
| vaultAccount | explicit intended NEAR account; no default or assertion of deployment |
| agentId, agentAccount | registered, active org-scoped agent; account resolved from DB |
| recipient | one exact valid NEAR account; no wildcard/redirect/adapter |
| asset | literal `NativeNear` |
| taskReference | bounded human-readable reference; no secrets, URLs fetched or executable prose |
| maxPerPaymentAtomic, totalBudgetAtomic | canonical positive decimal strings, <= u128 max; per-payment <= total |
| expiresAtNs | canonical decimal string <= u64 max, in future at creation and approval |
| maxExecutions | integer 1..4294967295; no float or string coercion |
| verifierPolicy | versioned, explicit account/threshold/claim bindings described below |

1 NEAR = 10^24 yoctoNEAR. UI conversion must use string manipulation/BigInt, never
Number/parseFloat arithmetic. Reject exponent notation, signs, leading zeros,
whitespace, fractional atomic values, overflow and zero budgets. Display readable
NEAR and exact atomic values side by side for review. Expiration uses an explicit
UTC instant; conversion to nanoseconds must preserve exact integer precision and
reject invalid/nonexistent dates. PostgreSQL time is authoritative for expiry.

Snapshots are immutable from initial draft persistence. Corrections create a new
mandate with a new identifier and fresh consent; no PATCH of owner, agent,
recipient, budget, expiry, verifier policy or other signed fields. A future lineage
version must increment without wraparound and must never mutate an earlier record.
Do not silently introduce revision semantics beyond the approved contract spec.

Serialize all fields in a fixed documented order using JSON strings with no
optional undefined values. Nested fields have fixed order; account/claim sets are
sorted, unique and bounded. Canonical JSON is deterministic bytes, not whatever
property order an inbound object happens to have. SHA-256 identifies integrity of
these bytes, not authority or truth. Store canonical bytes alongside the digest;
recompute and validate before signing and verification.

## Approved verifier policy (O02 scoped to M2)

Represent explicit unique verifier accounts, a positive threshold no larger than
the verifier set, and explicit positive claim requirements from INVOICE_ISSUED,
SERVICE_CONFIRMED and OWNER_APPROVED. Never silently default to an empty set or
allow AI-generated evidence. INVOICE_ISSUED is not delivery confirmation.
DELIVERY_DISPUTED always blocks later execution rather than being a positive claim.

Owner-approved: the threshold applies to EACH required third-party claim.
`requiredClaims` contains one or both INVOICE_ISSUED and SERVICE_CONFIRMED; the
separate explicit boolean `requireOwnerApproval` binds OWNER_APPROVED semantics.
When true, the actual mandate owner must separately attest to each payment in
addition to third-party quorum. An arbitrary verifier cannot supply that approval. The M2 consent signature is never itself a delivery/per-payment attestation.
No M5 enforcement or independent evidence verification is claimed in M2.

The owner explicitly resolved O02 for this M2 representation; M5 must enforce
these semantics and still demonstrate independent evidence provenance. A signature binds the exact selected
policy but does not prove independence or honesty of verifier accounts.

## Approved signing protocol

Use separate NEP-413 message-only signatures for `APPROVE_CONSENT` and
`REVOKE_CONSENT`, with fresh finalized FullAccess key verification each time.
Reuse M1 crypto and connector; never use session authentication as the signature.
Signed message includes an M2-specific domain/version, action, the complete
canonical snapshot (not just a digest), snapshot digest, challenge UUID, origin,
five-minute challenge expiration. Issuance time is stored server-side. NEP-413 recipient is exact application
origin, callback is absent, nonce is 32 cryptographically random bytes. Owner,
network, vault, mandate/version, org, agent, recipient and all limits are inside
the exact signed bytes. The challenge binds to the initiating session's token
hash and cannot be reused after session rotation/logout, in another browser,
organization, action or account. Nonces/signatures/session tokens must never be
logged, copied into reports, or retained as diagnostic payloads.

Store challenge nonce/message privately for verification, not raw wallet
signatures. Automatic expired-record cleanup is not implemented; retention remains
an explicit operational limitation. Persist only minimized consent event metadata (identity/key, challenge
ID, snapshot digest, action, timestamp) after successful verification. This is a
server verification record, not an independently re-verifiable archived signature
or portable authorization certificate. M3 cannot rely on this record for custody.

Check active session, exact Origin/CSRF, live membership, owner match and snapshot
on challenge issuance and proof submission. Reject malformed/tampered proof before
RPC where possible. Recheck expiry, current owner/session/membership and state
inside the final SQL transaction after RPC. Lock records in a documented consistent
order; conditional single consumption, lifecycle transition and audit insert are
one transaction. Concurrent competing challenges cannot apply a second transition.
Audit failure rolls everything back. Never expose raw RPC/DB/SDK error objects.

Alternatives considered and not selected:
- Actual contract transaction now: not feasible as M3 vault is not deployed; reject
  mocked success and defer actual authorization to M3.
- Session-only approval: does not establish fresh wallet consent; reject.
- Session-only stop request plus wallet-confirmed revocation: could support faster
  emergency UX but adds distinct policy/state semantics; not selected for M2; any later addition requires an owner decision.
- Restricted signing key: conflicts with approved wallet-owner boundary; reject.

## Implemented roles and transitions

An active org owner creates a draft owned by that same authenticated wallet. Only
that owner can approve/revoke; app admins cannot impersonate or replace the owner.
Other active org members may read policy details, but not mutate or sign on behalf
of the owner. Cross-org selectors never confer permission. Recheck agent active
status at approval; a disabled record cannot gain new consent. Revocation must
remain possible after agent disabling or mandate expiry; otherwise expiry could
trap a historical consent record. It does not cancel dispatched onchain transfers.

| Current state | Action | Result |
| --- | --- | --- |
| DRAFT, unexpired | valid owner approval | CONSENT_APPROVED_OFFCHAIN |
| DRAFT or CONSENT_APPROVED_OFFCHAIN | valid owner revocation | CONSENT_REVOKED_OFFCHAIN |
| CONSENT_REVOKED_OFFCHAIN | approval | reject; terminal |
| Any expired snapshot | approval | reject |
| Any state | edit signed policy | reject; create new mandate instead |

Expiration is derived from the immutable timestamp, not a browser timer or an
unaudited job. Report expiry separately from historical consent state. Revocation
is terminal; retries cannot recreate authority. Exact duplicate proof submission
is rejected as replay, not treated as a second success. Onchain state stays
NOT_SUBMITTED in every row and response.

## Persistence and user experience

Add a new checksummed migration; do not edit 001_identity.sql. Separate immutable
policy rows, private session-bound challenges and append-only mandate events.
Use database constraints/triggers to prevent ordinary updates/deletes of snapshots
and audit records. Explicitly acknowledge a DB administrator can bypass such guards;
DB state is never custody authority. Link org/network/agent identifiers with scoped
foreign keys. No raw auth data in events or list responses.

Implement routes within the existing identity security scope, reusing its helpers
rather than duplicating weakened session/CSRF logic. Scope list/detail/creation,
action challenge and verification endpoints to organization and mandate. Preserve
pagination, body limits, rate limits and sanitized errors. Extend audit event names
through a new migration only if needed.

Workspace: selected organization -> Mandates -> draft form -> exact review ->
wallet approval -> offchain status -> explicit revocation review and wallet prompt.
Show intended vault as unverified, readable and atomic limits, UTC expiry, exact
recipient/agent, verifier threshold/claim requirements, and immutable terms. State
plainly: no funds moved, no onchain authority, and M3 wallet transaction is separate.
Use mobile-responsive panels, labeled inputs, accessible errors, loading/empty/
unauthorized/canceled states and stale-response guards inherited from M1 patterns.
Cancellation creates no consent transition; retry issues a fresh challenge.

## Verification matrix (actual results in M2_REPORT.md)

- Unit: deterministic bytes, field ordering/set sorting, every schema boundary,
  exact NEAR conversion, u128/u64/u32 limits and digest changes for every term.
- Crypto/adversarial: altered domain/action/owner/network/vault/org/id/version/
  recipient/budget/expiry/claim, missing/restricted key, malformed/forged proof.
- Real SQL/API: sessions/CSRF/origin, role/tenant denial, browser/session substitution,
  replay, concurrent same and separate challenges, expiry before/after RPC, logout/
  membership/agent disabling, approved-policy mutation, revocation and rollback.
- Database: immutable rows, append-only events, FK/check constraints, migration
  idempotency/checksum, audit failure rollback without consumed nonce or transition.
- Browser: responsive draft/review, exact terms and offchain labels, stale selection,
  cancel/retry, failure/empty/unauthorized, expiration, revoke confirmation.
- Full M0/M1 regressions, build/type/lint, Docker/bootstrap, secret checks, Rust/Wasm
  unchanged scaffold and hosted foundation/rust on final head.
- Manual Meteor desktop/Android actual M2 approval/revocation compatibility remains
  distinct from fixtures; existing M1 results are not an M2 wallet pass. iOS deferred.
