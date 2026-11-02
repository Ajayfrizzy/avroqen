# M4 restricted runtime and proposal design

Status: option A approved by the owner on 2026-11-02; implemented; local verification recorded in M4_REPORT.md.
Implemented application boundary; verification evidence is in M4_REPORT.md. Base: merged M3 commit
`42161e3ba7b368f750872690e7f5cc19f12ce046`; branch `feat/m4-agent-runtime`.

## Owner-approved authority decision

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

Option B: independently generated application Ed25519 keys with registered public
keys and signed, timestamped, nonce-bound requests. This avoids reusable bearer
tokens in transport but adds private-key lifecycle, replay storage and canonical
request signing. These would still not be NEAR owner/verifier keys and would not
grant chain authority. Option B was not selected; changing to proof of possession would require a
new design decision. Neither option authorizes financial transactions.

The approval is required by the owner's M4 request, section 4: present explicit
credential/delegated-authority options before implementation. Prior M1–M3 approvals
do not decide this new credential policy.

## Runtime and trust boundaries

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

## Immutable proposal and lifecycle

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

## Persistence and races

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

## M3 / M5 / M6 boundary

Prepare a pure typed adapter for M3 submit_proposal arguments only: mandate_id,
proposal_id, recipient, amount and evidence_digest. It cannot sign, broadcast or
select an arbitrary method. Future onchain submission requires separately approved
agent account permissions and fresh chain-state checks against the exact deployed
contract/network/policy. M3 direct signer/predecessor checks remain authoritative.

M5 must authenticate independent evidence sources and selected verifiers. M4
digests and rules-engine prose do not establish truth or satisfy MAP-1. M6 must
index/reconcile real finalized receipts; M4 has no broadcast or settlement worker.
Unknown onchain outcomes must remain quarantined, never retried as payments by M4.

## Required verification before delivery

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
- Final feature commit and draft PR to staging; foundation and rust must pass
  on that exact head. Human wallet observations and independent review stay
  separate from automated or self-review evidence.

## Implemented operational bounds

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
