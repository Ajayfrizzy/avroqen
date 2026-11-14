# Application implementation and security contracts

This permanent specification preserves the still-authoritative identity, mandate,
agent, human-evidence and monitoring contracts from the milestone designs. It
changes no authority or financial policy. Historical alternatives, implementation
plans, approval chronology and observed results remain in the archived originals.
Read with [architecture](ARCHITECTURE.md), [decisions](DECISIONS.md),
[contract specification](CONTRACT_SPEC.md) and [test plan](TEST_PLAN.md).

The M2/M4/M5 status markers below describe their offchain/component scopes, not
global observed deployment or settlement. Current public deployment provenance is
in the [deployment/key report](DEPLOYMENT_KEY_GATE_REPORT.md); actual operation
building, verification and UNKNOWN handling are in [reconciliation](runbooks/financial/RECONCILIATION.md).
Source-era references to adding migrations describe the preserved implementation
contract: applied migrations must not be rewritten. No implementation-completion
claim here passes pending genuine-source, physical-device or public financial
acceptance. Primary proof is BLOCKED, Testing FullAccess is RETAINED and financial
operations are DISABLED. D026 stops the private Primary integration; ordinary M1
authentication requirements below do not authorize resuming that research.

## Identity

Source: [historical M1_DESIGN.md](archive/milestones/M1_DESIGN.md). This section preserves current requirements;
current acceptance status is tracked in [release status](RELEASE_STATUS.md).

### Approved identity decision

Owner-approved: NEP-413 offchain message signing with an active full-access Ed25519
key, verified against finalized access-key state on the server-selected network.
Restricted function-call keys must not authenticate as wallet owners: a compromised
agent key could otherwise impersonate its account. The official NEP-413 standard
requires full-access keys and separates its signed payload from transactions.

Alternative: restricted keys could represent separately scoped application
identities, but would require a new explicit permission mapping and must never
inherit wallet-owner identity. This alternative is not the proposed M1 login.

Owner explicitly approved full-access-key verification before implementation of
the dependent verification/session issuance path. Neither a signature nor an application role
will authorize an onchain transfer or policy change. Signing stays in the user's
wallet; no private key is accepted by the API.

### Implemented protocol and boundaries

- Server-selected network; account ID included in the exact challenge message.
- Changing the configured origin invalidates prior-origin challenges and sessions.
- NEP-413 tag/Borsh/SHA-256/Ed25519 verification; bind recipient, origin, callback,
  account, network, challenge ID and expiration. 32 random nonce bytes, 5-minute TTL.
- HttpOnly preauthentication cookie binds the challenge to the initiating browser.
  A successful signature from another browser must fail, preventing login CSRF.
- Consume nonce and insert session in one PostgreSQL transaction with a conditional
  update; simultaneous successful submissions can create at most one session.
- Opaque random sessions, hashes stored in DB, 15-minute absolute expiry, server-side
  logout/revocation. Production cookies Secure/HttpOnly/SameSite, no Domain.
- Exact configured request origin and CSRF token required for session mutations;
  reject absent/mismatched Origin. Local HTTP exception restricted to loopback.
- Membership lookup on every organization operation, scoped by account and network.
  App owner/admin may manage agents; active members/viewers can read. Client roles,
  ownership fields and arbitrary extra properties are rejected. Org creator becomes
  app owner, which does not imply onchain ownership. No role-edit API is implied.
- Registered agents are organization-scoped records, not credentials or executors.
  Disabling is idempotent and does not claim to revoke existing onchain permissions.
- Audit fixed event/reason codes and public identifiers only; never signatures,
  cookies, CSRF tokens, raw request bodies or database connection details.
- Fail closed on RPC/DB errors. RPC trust remains an explicit assumption, and session
  lifetime bounds stale wallet-key authorization between login and expiration.

### Acceptance test coverage

Cryptographic vectors; forged/expired/replayed/account/network/origin-mismatched
signatures; missing/revoked/restricted access keys; concurrent nonce consumption;
login CSRF; session expiry/logout; missing or wrong CSRF and origin; unauthorized,
disabled and cross-organization identities; role injection/escalation; agent
registration/list/disable; actual PostgreSQL migrations/transactions; responsive UI
loading/error/empty/unauthorized states; all existing M0 checks.

### Implemented connector and verification limits

Meteor SDK 3.24.1 provides the message-only action. The app passes the server's
message/nonce/recipient without callbackUrl (Borsh Option=None; stored callback
field is empty). No transaction, access-key creation, transfer account or private
key import action is requested. Connector logging is disabled, and a pinned pnpm
patch removes two unconditional V1 console calls that bypassed that setting and exposed connection/proof data.
The patch changes logging only in both SDK entrypoints; metadata is in
memory, and any attempt to obtain/store a private key through its key-store
provider throws. The mobile bridge is disabled rather than enabling key-transfer
features.

## Mandates

Source: [historical M2_DESIGN.md](archive/milestones/M2_DESIGN.md). This section preserves current requirements;
current acceptance status is tracked in [release status](RELEASE_STATUS.md).

### Scope and trust boundary

Reuse M1 sessions, same-origin API, CSRF, finalized FullAccess Ed25519 verification,
wallet normalization/cancellation, migrations and tests. M2 records typed intent
and explicit wallet consent; it cannot create an active MandateVault mandate.
`onchainStatus` is always `NOT_SUBMITTED` in M2, with no transaction/receipt fields
fabricated. M3 must obtain separate owner-signed onchain authorization and verify
network, deployed vault, exact terms and state. No replay of an M2 signature can
invoke an onchain operation. Agent records convey no credentials or spend rights.

### Implemented canonical snapshot v1

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

### Approved verifier policy (O02 scoped to M2)

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

### Approved signing protocol

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

### Implemented roles and transitions

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

### Persistence and user experience

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

### Required mandate regression coverage

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
  contract checks and hosted foundation/rust on final head.
- Manual Meteor desktop/Android actual M2 approval/revocation compatibility remains
  distinct from fixtures; existing M1 results are not an M2 wallet pass. iOS deferred.

## Agent capabilities

Source: [historical M4_DESIGN.md](archive/milestones/M4_DESIGN.md). This section preserves current requirements;
current acceptance status is tracked in [release status](RELEASE_STATUS.md).

### Owner-approved authority decision

Option A (approved): opaque, server-generated 256-bit application bearer
capabilities. Store only a SHA-256 token hash. Each credential binds exactly one
registered agent, organization, configured network, mandate ID, immutable policy
version/digest and intended vault. Fixed permissions: read that mandate summary,
read that agent's proposals for it, preflight and submit offchain proposals.
No wildcard scopes, credential delegation, owner/verifier tools or chain signing.

Only the original mandate wallet owner, still an active organization owner, may
issue, rotate or revoke through the existing session, exact-Origin and CSRF
controls. Issuance requires an active agent and unexpired approved offchain consent.
General credentials expire within 24 hours, bounded by mandate expiration. Demo
credentials expire within 15 minutes, also bounded by mandate expiration. These
are application credentials, never NEAR access keys. No new wallet transaction or
owner signature is implied by issuing one.

Every use rechecks the credential, issuing owner's active owner membership,
agent status, immutable policy bindings, consent and expiration. Rotation
atomically revokes the replaced credential. Explicit revocation is terminal.
Disabling an agent or revoking consent blocks subsequent application submissions;
neither changes existing onchain authority. Already committed proposal history is
retained and never interpreted as permission to execute a payment.

Return raw credentials only once over the protected response. Exclude them from
logs, audit bodies, URLs, browser persistence, task inputs, model prompts and tool
outputs. The trusted transport holds them outside the rules engine. The demo
explicitly issues a short-lived credential held only in browser memory; its agent
requests must authenticate with that capability, independently of the owner cookie.
Clear in-memory credentials on logout, organization/mandate change and expiry.
Bearer theft permits bounded proposal spam until revocation/expiry, not custody.
XSS or a compromised operator remains a credential-exposure risk; hashing storage
does not protect a credential stolen during use. Enforce quotas and rate limits.

### Runtime and trust boundaries

Use an operational deterministic rules engine with strict bounded structured task
inputs. Descriptive prose is inert, untrusted data; it cannot select transport,
tools, credentials or policy. No live AI provider is required. A fixed tool union
supports mandate summary, own proposal status, prepare/preflight, submit and
sanitized denials. No shell, filesystem, unrestricted HTTP, contract-call,
attestation or wallet-signing tool is available.

The trusted API revalidates everything independently of runtime output. Agent
routes use explicit capability authentication; session cookies never substitute.
Preserve M1/M2 exact-Origin checks, including on agent writes: trusted nonbrowser
clients send the configured Origin, which is an additional check, not an identity.
No cross-origin credential access or CORS expansion. Owner credential-management
routes retain session/CSRF protections.

### Immutable proposal and lifecycle

Strict versioned proposal fields bind organization, agent ID/account, mandate
ID/version/digest, network, intended vault, exact recipient, NativeNear asset,
positive decimal u128 atomic amount, evidence digest, proposal UUID and bounded
idempotency key. Server time is authoritative for persisted creation timestamps.
Evidence digest is content integrity only: no authoritative evidence or attestation
is produced. Display required per-claim quorum and distinct owner approval from
the immutable policy, without claiming those requirements have been satisfied.

UI preparation states: DRAFT -> PREFLIGHT_ACCEPTED or PREFLIGHT_REJECTED.
Submission rechecks policy and live authorization before SUBMITTED_OFFCHAIN.
Only accepted submissions create immutable proposal records. Denied attempts have
sanitized append-only audit events; failed infrastructure operations are errors,
not successful preflight or proposal states. M4 does not mark payments reserved,
funded, sent, confirmed or settled.

Approved unexpired M2 consent permits advisory offchain preparation despite
NOT_SUBMITTED/NOT_DEPLOYED chain status. Draft/revoked/expired consent and disabled
agents are unavailable for submission. An accepted offchain proposal is never
presented as a registered M3 mandate or chain-accepted proposal. Budget and
execution-cap terms are visible; only the contract enforces actual cumulative
spend, reservations and execution slots. Preflight cannot guarantee payment.

### Persistence and races

Add a new checksummed migration; never rewrite migrations 001/002. Bind rows to
existing organization/network/agent/policy identities with constraints. Immutable
proposal contents and append-only events must have database guards. Use unique
constraints for proposal IDs and mandate/agent-scoped idempotency keys.

Same key plus identical canonical payload returns the existing proposal; changed
payload returns an idempotency conflict. Live authorization must pass even for
retries. Rotation must not reset idempotency scope. Concurrent identical requests
commit at most one proposal and one submission event. Proposal and success audit
commit atomically; injected database failures must roll back both.

Follow existing lock order: owner session (where applicable), issuing-owner
membership, consent, registered agent, credential, proposal. Agent requests use
no owner session but lock/recheck the relevant membership. Disable, revoke and
rotation must serialize with submissions: an in-flight operation that commits
before revocation can remain; no submission may commit using authority that was
revoked first. Recheck expiration after acquiring locks using database time. No
RPC or external network waits while holding SQL authorization locks.

### M3 / M5 / M6 boundary

Prepare a pure typed adapter for M3 submit_proposal arguments only: mandate_id,
proposal_id, recipient, amount and evidence_digest. It cannot sign, broadcast or
select an arbitrary method. Future onchain submission requires separately approved
agent account permissions and fresh chain-state checks against the exact deployed
contract/network/policy. M3 direct signer/predecessor checks remain authoritative.

M5 must authenticate independent evidence sources and selected verifiers. M4
digests and rules-engine prose do not establish truth or satisfy MAP-1. M6 must
index/reconcile real finalized receipts; M4 has no broadcast or settlement worker.
Unknown onchain outcomes must remain quarantined, never retried as payments by M4.

### Implemented operational bounds

Migration 003 enforces immutable credential scope, positive bounded proposal
amounts and policy identity consistency in addition to API checks. Capabilities
reference immutable policies rather than duplicating mutable scope columns.
Creation and expiry use one database timestamp to satisfy exact lifetime bounds.
Rotation appends both an old-credential revocation event and new issuance event.

The API retains at most 128 credentials and 128 accepted proposals per mandate;
rotation consumes a credential slot. Revocation still works at the limit. This
bounds records but can require a new mandate for continued application use; it is
not a financial budget. Existing 30-write/minute IP throttling applies across
authentication, owner and agent routes. NAT/proxy users share that limit. Audit
retention/operational pruning remains future work; audit storage is not globally
bounded by the proposal count. No restriction was added to financial custody.

Independent capabilities outlive logout of the issuing application session until
expiry/revocation or a live scope denial. The browser demo clears its copy on logout,
expiry, selection change or unmount; it checks the owner session before demo actions
and on return to the tab. Explicit credential revoke is the server invalidation
operation. Operator credentials never rely on an owner session for authentication.

### Required verification before delivery

- Unit/adversarial: fixed tools, inert prompt injection, strict schemas, exact
  u128 boundaries, bindings, policy expiry, evidence-not-authorization and adapter.
- Real PostgreSQL: issuance/rotation/revocation, disabled agents, expired tokens,
  wrong scope, owner-role loss, consent revocation, concurrent submission and
  revocation, idempotency conflicts, immutable rows and audit rollback.
- API: no credential leakage, body/rate limits, origin and session/CSRF isolation,
  malformed authentication, sanitized errors, no privileged financial endpoint.
- Browser: owner demo uses separate agent authentication, review/denial/history,
  loading/retry/empty states, focus/scroll/reduced-motion and narrow-screen layout.
- Preserve M1–M3 checks: lint, types, builds, unit/integration/adversarial/SQL,
  browser, Rust/Wasm/sandbox, containers, actual outage/recovery, workflow/secrets.

## Human evidence

Source: [historical M5_DESIGN.md](archive/milestones/M5_DESIGN.md). This section preserves current requirements;
current acceptance status is tracked in [release status](RELEASE_STATUS.md).

### A — Approved application verifier authentication

Approved: reuse M1 wallet login to identify the human, then require a fresh
NEP-413 signature for each approval, rejection, dispute or owner per-payment
assessment. Login alone cannot approve a review. Finalized RPC must confirm the
signing Ed25519 key is an active FullAccess key for the exact designated account on
the configured network. No key is created, exported, stored by the app or passed to
the rules engine. The wallet retains its key.

Each action message commits to the exact canonical MAP-1 payload, immutable policy
digest, organization, source assessment ID/digest, review action, origin, initiating
session, single-use challenge ID and five-minute expiry. The server stores an
opaque session binding, not a session token in the message. Use a random32-byte
NEP-413 nonce and atomic consumption. Raw proofs/tokens must never appear in audit,
logs or reports. Recheck all permissions and source state after RPC and under locks.
A separately generated UUID MAP-1 nonce is unique per verifier; it is not the
NEP-413 transport nonce. Prepared attestations expire after 60 minutes or mandate
expiry, whichever is earlier; expired records never contribute to a current quorum.

A selected verifier may access only assigned proposal evidence and required claim
scopes through verifier-specific routes, even without general organization
membership. It gains no organization list/member/agent-management permission.
Owner and organization roles never appoint additional verifiers. An account equal
to the proposing agent cannot count as independent third-party verification in the
M5 application workflow. Existing policies are not silently rewritten; incompatible
policies are flagged for a new owner-approved mandate. Distinct accounts do not
prove separate human control: disclose collusion and shared-control risks.

OWNER_APPROVED requires the original wallet owner's separate per-payment signature
and cannot count as a third-party claim or reuse M2 consent. DELIVERY_DISPUTED may
be signed by the original owner or a selected verifier. No other role can resolve
or override a terminal dispute. Offchain dispute blocks further app approvals and
transaction preparation; only actual inclusion in M3 can block onchain dispatch.
No already-dispatched payment can be canceled by this workflow.

### B2 — Approved independent human source workflow

The owner selected B2, not the recommended synthetic issuer service. A designated
human obtains records through their own authenticated issuer/provider access,
independently of agent-supplied links/files. No automated source fetch, provider
credential, local issuer service or new signing key is introduced. The adapter
validates bounded structured observations and exact bindings, not real-world truth.

The human records source class (authenticated provider portal, authenticated issuer
communication, or explicit local exercise), issuer and reference, observed document
digest, recipient/amount and separate invoice/service event, observation time and
independence confirmation. All inputs remain human assertions until wallet-signed;
backend validation cannot prove portal access or prevent a dishonest verifier lying.
Local exercises are labeled synthetic and cannot count toward live readiness or
produce an onchain attestation candidate. Missing source data becomes UNVERIFIABLE;
temporary unavailability remains PENDING_REVIEW. Invoice issuance is never delivery.
Positive third-party decisions require source independence and exact matching fields.

The UI labels verified results “Human verified — not automated provider validation”.
A fresh wallet message commits to the full provenance observation and MAP-1 body.
Owner per-payment approval remains separate and cannot satisfy third-party quorum.
A live judge demo requires actual independently obtained evidence and separately
approved testnet transactions; synthetic exercises are not production evidence.

### Evidence bytes, access and persistence

Agent intake is a claim, never authoritative evidence. Bind immutable metadata to
one M4 proposal: digest, allowlisted source class, bounded issuer/reference,
media type and byte length. Claim and event belong to each signed observation. Compute SHA-256 over exact
original bytes, with no newline/Unicode/JSON reserialization. Metadata JSON uses evidenceInput schema field order and UTF-8 JSON.stringify;
its SHA-256 is separately named submissionDigest. It is not the original file digest.
The original evidence digest must exactly match the immutable M4 proposal/M3 field;
changing evidence requires a new proposal, not mutation of existing authorization.

Initial file boundary: accept bounded metadata/digests; reject multipart, binary,
base64 files and arbitrary URL fetching. This is an explicit metadata-only intake,
not an insecure document upload feature. Local exercises use nonsensitive synthetic bytes only. If real private-file upload is later required, specify private
encrypted storage, retention, deletion, content validation and independent scanning
before enabling it. Never persist invoice contents in onchain payloads or audit logs.

Migration004 adds immutable submissions, review challenges, signed review records
and append-only events. Source observations and MAP-1 preparations live inside the
immutable review record; they are not separate provider-authenticated records. Use transactions,
unique source/review idempotency keys, distinct verifier/claim constraints and global
verifier/nonce uniqueness. No mutable assessment can retroactively change a signed
review. Audit-write failure rolls back decision, nonce consumption and preparation.
Use existing consent/agent locking order and extend it for evidence/review rows;
perform source/RPC requests outside SQL locks and recheck state before commit.

### Application state versus onchain state

Show agent submission, source provenance, verifier assessment, verifier-signed
preparation and chain acceptance separately. Application progress:
SUBMITTED -> PENDING_REVIEW -> VERIFIED / REJECTED / UNVERIFIABLE / DISPUTED.
A verified source observation alone is not a signed verifier decision. Count only
unexpired designated distinct verifier decisions per required claim in the offchain
readiness view; show owner approval separately. Never label this chain quorum.
Disputes dominate app readiness and are terminal for that proposal.

Prepared MAP-1 bodies retain all canonical Rust fields and exact decimal u128/u64
representations. Onchain status stays NOT_SUBMITTED with deployment status
NOT_DEPLOYED until independently observed. PREPARED/AWAITING_VERIFIER_SIGNATURE
refer explicitly to the separate onchain transaction signature, not the NEP-413
assessment message. No fabricated SUBMITTED_ONCHAIN/CONFIRMED, tx hash or link.
Future broadcast failure/unknown handling must not infer chain failure from timeout.

### Verification and delivery gates

Add focused tests before sensitive code: forged/missing/unavailable source records,
digest/identity/amount mismatches, injection/SSRF, oversized/file inputs, selected
verifier impersonation and tenant isolation, agent escalation, owner substitution,
per-claim quorum, expired/replayed proofs/nonces, concurrency, mutation and rollback,
terminal disputes, and no fake chain state. Retain all M1–M4/Rust sandbox checks.
Browser tests cover readable terms, loading/error/empty states, focus/reduced motion,
mobile layouts and clearly separate source/decision/chain statuses.

## Monitoring

Source: [historical M7_DESIGN.md](archive/milestones/M7_DESIGN.md). This section preserves current requirements;
current acceptance status is tracked in [release status](RELEASE_STATUS.md).

M7 consumes server-owned audit, agent, evidence, mandate and chain event rows. There is no public event-ingestion endpoint. Normalized records contain only allowlisted codes, source table/id, server timestamp, validated organization/mandate scope and a public subject identifier. No request bodies, headers, signatures, credentials or documents enter the projection. Unknown reasons become OTHER; explanations are static, never model-generated.

A transactionally serialized, bounded projection uses per-source processed identities rather than a high-water sequence: concurrent commits and late records cannot be skipped. Unique source identities and fixed five-minute rule windows deduplicate replay. Every alert keeps evidence references and immutable history. Late observations update first/last timestamps and counts without reopening a resolved/dismissed incident; a new window creates a new alert. Thresholds indicate suspicious activity, not proof of attack. Confirmed local policy rejections, observed configuration mismatch, operational warnings and unverified receipt observations have distinct labels.

Active organization members can read their organization's records. Existing owner/admin roles can respond; assignment is self-assignment by an authorized responder. Mutations use session/Origin/CSRF and optimistic version checks. Terminal resolutions require a bounded predefined reason, not sensitive free text. History and normalized events cannot be modified/deleted through SQL triggers or APIs. Database superusers remain outside this integrity boundary. No cross-tenant monitoring-admin endpoint exists. Unscoped authentication/operational events are retained for database operators, never copied into arbitrary organizations.

Monitoring runs in a separate loop/pool from reconciliation, with durable heartbeats and bounded statements. Monitoring failure must not stop reconciliation. API health observations expose stale worker status even when the worker cannot monitor itself; no external notification delivery is claimed. Dashboard presence means an alert is available, not that an owner was contacted. Database loss cannot be logged to that same unavailable database; readiness must fail and retained events replay after recovery.

Emergency actions reuse M6 immutable intent/wallet/receipt workflows and existing disable/revoke APIs. A guardian with active organization access can prepare PAUSE only after finalized code/key/domain and exact mandate/guardian verification, rechecked before the wallet prompt. Guardian membership grants no other contract privilege. Guardians without app membership can still use the direct contract interface under separate transaction authorization. Owner-only resume/revoke remains unchanged; expired/revoked consent never disables recovery controls. Disabling an agent or revoking a bearer changes application access only. No automatic pause, broadcast, force-settlement, timeout release, key rotation or transfer is introduced.

Threat/test cases: source forgery, sensitive reason injection, cross-tenant reads/mutations, revoked responders, concurrent updates, projection replay/rollback/out-of-order commits, terminal incident suppression, credential reuse, wrong guardian, code/key/domain mismatch, stale observations, reserve warnings, uncertain/canceled wallet actions, worker outage and restart. Existing M3 sandbox tests remain authoritative for guardian/owner/financial boundaries. Real-wallet/Android and genuine Testnet demo remain pending M8.

### Detection constants and limits

Windows are fixed five-minute event-time buckets, not sliding windows. Authentication threshold: five rejected challenge/verification requests globally; signed-out session polling is excluded. Agent proposal denials: three per organization/mandate/agent. Transaction denials: three per subject/scope. Spending-limit, recipient/policy substitution, revoked-access, verifier binding/dispute, deployment changes, receipt inconsistency and definitive transaction failure trigger at one occurrence. Indicators are not blanket attack attribution.

Attempted nonterminal intents older than ten minutes from a recorded AWAITING_WALLET event produce delay warnings; time in unsigned PREPARED alone does not. Heartbeat warning: one minute; readiness grace: six minutes. Each cycle processes at most 100 unseen records per source (six sources, at most 600), under an advisory transaction lock scoped to the resolved security-event table (shared-table workers serialize; independent schemas do not) with five-second statement and one-second lock limits. Immutable source identities are durable checkpoints, avoiding high-water/commit-order loss. Deployment probes run once per minute; observations deduplicate per five-minute bucket. Probe fanout is limited to 100 matching organizations plus one global record. Review this demo limit before large-scale hosting; per-intent reconciliation still reports failures independently.

Gas warning is above twice M6's baseline (200,000,000 yoctoNEAR/gas), a cost-change warning rather than execution failure. Backing uses checked BigInt balance versus available allocations + unused storage credit + storage bytes × byte cost + protocol reserve, without double-counting dispatched liabilities. No threshold changes contract rules or sends a top-up.

Legacy access-denial rows remain collected as OTHER to avoid duplicate unscoped incidents; structured denial observations supply scoped reasons. Auth failures count once from existing audit rows. Capability scope is derived from the hashed stored capability even after revocation. Evidence-denial target scope comes from the existing proposal/policy for an authenticated requester, without exposing that target through the error response. Attackers may cause bounded denial alerts, never authoritative settlement evidence.

Limitations: DB superusers bypass triggers; immutable logs need a separately reviewed retention/archive plan; fixed windows permit threshold splitting; backlogs delay detection; trusted RPC may lie/prune; retained keys can replace code between observations. Notification is dashboard-only. External availability checks remain necessary. No new custody/financial authority decision is pending.

Read-only deployment monitoring remains enabled for a complete approved manifest even when new transaction submissions are disabled. Partial/malformed monitor configuration is caught inside its independent loop, never at reconciliation startup. No configuration creates a signer.

## Nonfinancial M8 deployment-readiness boundary

A complete deployment manifest and the financial submission switch are separate
configuration facts. The API may use the former for authenticated read-only
deployment/status views while the latter remains false. All intent preparation and
prompt-opening routes require the explicit submission switch as well as the complete
matching manifest and Testnet application network. A manifest alone grants no
transaction authority and creates no signer, wallet request or onchain pause.

Trusted RPC responses are accepted only as bounded JSON-RPC 2.0 envelopes with the
exact per-request ID and exactly one of result or error. Duplicate decoded JSON keys,
unknown outer members, malformed/truncated/oversized bodies and provider error details
fail closed under fixed, non-secret diagnostic codes. A latest finalized deployment
block is current only within a 120-second maximum age and 30-second future-clock-skew
allowance. All deployment identity observations are pinned to that hash. Historical
receipt-block identity checks remain exact-hash checks after a fresh current-head
verification; they are not rejected merely for being historical.

Process health exposes only whether a complete manifest is configured, whether the
read-only verification path is configured and whether financial submission is
explicitly enabled. It does not perform or claim a fresh chain verification, expose
manifest values or replace database readiness. UNKNOWN/hashless intent clearance
remains a separate unresolved review gate: this hardening adds no retry, timeout
release, manual-success or terminal-clearance policy.
