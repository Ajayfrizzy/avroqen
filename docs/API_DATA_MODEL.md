# Backend API and data-model contract

**Reading guide:** the logical entities and `/v1` interface sketches below are
historical design candidates, not a current schema or route inventory. The
explicitly implemented M1–M7 sections later in this document describe the recorded
application contracts; consult the corresponding source and migrations for exact
current behavior. `/v1` sketches are not aliases for `/api` routes. This distinction
does not grant financial authority or claim that candidate uploads are implemented.

## Principle
PostgreSQL is a searchable index and UX read model, **never the authoritative custody ledger**. Financial constraints are validated again onchain. API authentication doesn't substitute for wallet authorization.

## Tables / logical entities
`organizations(id, display_name, created_at)`
`memberships(org_id, account_id, role, status)`
`agents(id, org_id, near_account, disabled_at, metadata)`
`mandates(id, chain_id, vault_account, owner_account, policy_version, policy_json, chain_status, tx_hash, indexed_height)`
`proposals(id, org_id, mandate_id, agent_id, recipient, asset_id, amount_atomic_decimal, status, idempotency_key)`
`evidence(id, proposal_id, sha256, source_type, encrypted_pointer, retention_at)`
`attestations(id, proposal_id, verifier_account, claim, nonce, chain_tx, expires_ns)`
`executions(id, proposal_id, mandate_id, chain_execution_id, status, chain_tx, finality_height)`
`audit_events(id, actor, action, target_id, request_id, reason_code, at, chain_ref?)`
`security_alerts(id, severity, rule, affected_mandate, status)`

## API sketches (not yet implemented)

Historical candidates retained for design context; the implemented sections below
take precedence where the sketches differ. Health/readiness overlap does not
establish implementation of the proposed `/v1` financial interfaces.

- `POST /v1/proposals` validated agent identity, bounded payload, idempotency key; creates proposal **not a payment**.
- `GET /v1/mandates/:id` read model with chain-lag indicators.
- `GET /v1/proposals/:id`, `GET /v1/executions/:id`, `GET /v1/audit?mandate_id=` scoped to org access.
- `POST /v1/evidence` authorized upload/token, hash/size/type checks, short-lived private storage; no public secrets.
- `POST /v1/attestation-previews` verifier-only preflight, **not a blockchain approval**.
- `POST /v1/agents/:id/disable` app-level credential revocation; also provide owner-signed onchain change to remove spending authority.
- `GET /health`, `GET /ready` separate liveness/dependency checks. Health exposes
  only non-secret booleans for complete deployment configuration, configured
  read-only verification and explicit financial-submission enablement; it does not
  perform or claim a fresh RPC verification. Readiness remains database-connectivity
  only and neither endpoint is an onchain pause or payment-success signal.

## Validation
Zod schemas shared between API and client; `amount_atomic` always decimal string <=u128; no JS `number` for token units. Strict network, contract and account IDs. Rate limits, size limits, signed sessions and CSRF protections where appropriate. Never expose provider evidence raw by default. Error codes stable (`MANDATE_REVOKED`, `UNAUTHORIZED_VERIFIER`, `OVER_BUDGET`, `SETTLEMENT_PENDING`, etc.).

## Async projections
Workers record cursor/block height and event uniqueness; rebuild from canonical chain state on reorg or missing events; chain finality status displayed. Exactly-once business effects through idempotent handlers, not assumed exactly-once message delivery.

## M1 implemented application identity API

The M1 application API uses same-origin `/api` routes; financial `/v1` sketches
above remain unimplemented. See D012 for the owner-approved identity policy.

- `GET /api/auth/config`, `POST /api/auth/challenge`, `POST /api/auth/verify`:
  server-selected network and NEP-413 full-access-key wallet login.
- `GET /api/auth/session`, `POST /api/auth/logout`: opaque session lifecycle.
- `GET/POST /api/organizations`: active memberships / create app organization.
- `GET/POST /api/organizations/:orgId/agents`: list/register app identity records.
- `POST /api/organizations/:orgId/agents/:agentId/disable`: app record disable.

All writes require exact Origin; session writes additionally require CSRF token.
Organization IDs are selectors, never authorization. Active network/account
membership is checked at each org boundary. Owner/admin can register/disable;
member/viewer can read. No API can edit roles or grant onchain ownership. Lists
return up to 50 records and a nullable `nextOffset` (offset bounded to 100000).
Agent disabling does not revoke onchain permissions or claim to do so.

## M2 implemented offchain consent API

All routes inherit M1 exact Origin, session/CSRF, rate limit and sanitized-error
controls. Active members may read; active org owners may create, and only the
original owner wallet may sign approval/revocation. Admin role is not owner consent.

- GET/POST `/api/organizations/:orgId/mandates`: paginated policies / immutable draft.
- GET `/api/organizations/:orgId/mandates/:mandateId`: exact policy, digest,
  offchain status, expiration, disabled-agent flag and up to 100 oldest event records.
- POST `.../:mandateId/challenge`: strict `{ action }` for APPROVE_CONSENT or
  REVOKE_CONSENT; returns the exact NEP-413 message, nonce and five-minute expiry.
- POST `.../:mandateId/verify`: challenge/action/account/network/key/signature;
  binds initiating session and original owner, verifies finalized FullAccess key,
  and atomically records consent plus audit. No proof material is logged/retained
  in audit, reports or public list/detail responses. Rejections use allowlisted
  stage codes for identity/network, challenge binding/expiry, reconstructed message,
  local signature, finalized key authorization and atomic consumption; the codes
  never include the nonce, session token, signature or complete signing message.

`onchainStatus` is always NOT_SUBMITTED. No PATCH, custody, execution or payment
endpoint is added. Changed policies need a new ID and fresh signature. SQL migration
002 adds mandate policies, consents, challenges and append-only events without
changing existing M1 migration history. Privileged database control is outside
these guards and conveys no financial authority.


## M4 implemented offchain proposals

Migration 003 adds hash-only agent_credentials, immutable agent_proposals and
append-only agent_events. Scope derives from the immutable M2 policy. The original
wallet owner issues/rotates/revokes narrow capabilities; active members can read
mandate proposal history. POST `/api/agent/tools` independently authenticates an
agent and dispatches a strict fixed union for summary/status/prepare/submit/denials.
Migration 008 adds an immutable optional credential holder. Authenticated wallets
can list `GET /api/agent/assignments` only where the exact stored agent account
matches, inspect those bounded terms/statuses, and issue/revoke only their own
15-minute demo capability through `/api/agent/assignments/:mandateId/credentials`.
Assigned proposal history is scoped through the same exact account/mandate lookup;
it grants no owner-organization membership or management access. Revoked consent,
expiry, disabled registration, lost owner access and all existing tool checks block
new proposal submission.
`/v1` sketches remain unimplemented, not alternate financial routes. See
[M4_PROPOSAL_API.md](runbooks/financial/AGENT_API.md) for exact schemas, pagination, denial codes,
limits, idempotency and authority boundaries.

## M5 implemented evidence and review API

All routes reuse M1 Origin/rate/session protections; writes require session CSRF.
`GET /api/verifier/proposals?offset=` returns only explicit non-agent assignments
(50/page). `GET /api/evidence/:proposalId` permits active org members or a designated
verifier; reads expose bounded metadata/observations, never signatures/challenges.
`POST .../intake` requires original owner with active org-owner role. The existing
scoped agent tool accepts `submit_evidence` with proposalId/evidence instead; its
capability never authorizes review. Metadata retry is idempotent and immutable.
`POST .../challenge` accepts strict claim/decision/observation; `POST .../verify`
accepts M1 proof fields and atomically consumes a five-minute session-bound challenge
plus review and event after finalized key verification and repeated live checks.
Status records distinguish VERIFIED, REJECTED, PENDING_REVIEW, UNVERIFIABLE,
SYNTHETIC_ONLY and DISPUTED. Only current non-synthetic signed decisions contribute
to per-claim readiness; active consent/agent/mandate and separate owner approval
are required. NOT_SUBMITTED/NOT_DEPLOYED remain unconditional chain labels.
Stable errors include SOURCE_REFERENCE_MISMATCH, EVIDENCE_MISMATCH,
INDEPENDENCE_REQUIRED, SOURCE_UNAVAILABLE, CLAIM_MISMATCH, REVIEW_ALREADY_FINAL,
DELIVERY_DISPUTED, AGENT_DISABLED and CONSENT_UNAVAILABLE. Review proof failures
use fixed `REVIEW_PROOF_*` stage codes for account/network, challenge/session/
actor/origin/expiry/consumption, exact MAP-1 payload, reconstructed message,
Ed25519 signature, finalized FullAccess key and final consume-race checks. These
codes contain no proof bytes or private provider details.
Migration004 adds evidence_submissions/challenges/reviews/events, exact proposal
binding guards and immutable row triggers. It adds no secret/provider/file storage.

## M6 API and durable chain records

- `GET /api/chain/status`: authenticated, verified deployment status; disabled unless an approved complete manifest is configured.
- `GET /api/chain/assignments`: exact owner/agent/designated-verifier mandate assignments, bounded to 50.
- `GET /api/organizations/:orgId/mandates/:mandateId/chain`: scoped policy, exact onchain mandate/proposal snapshots and authorized intent history. Unavailable state is null, never a zero balance. Explorer links require an RPC-matched hash.
- `POST .../chain/intents`: strict `{idempotencyKey, operation}`; allowlisted typed operations only. No arbitrary receiver, arguments, signer, method or raw transfer action.
- `POST /api/chain/intents/:intentId/begin`: rechecks original actor, live role/session/consent/agent bindings and deployment manifest before marking the prompt attempted.
- `POST /api/chain/intents/:intentId/report`: a strict wallet report is either
  `{outcome:"BROADCAST",hash:string}` or a null-hash `CANCELED`,
  `SUBMISSION_FAILED` or `UNKNOWN` outcome. It is untrusted transport evidence,
  not settlement evidence. Every null-hash outcome remains UNKNOWN and prohibits
  blind retry; only independent finalized-chain verification establishes success
  or failure.
- `POST /api/chain/intents/:intentId/recovery/challenge`: for a hashless UNKNOWN
  storage deposit only, rechecks the original owner and exact operation, verifies
  the 90,000-block/key-nonce/storage-credit evidence rule and returns a five-minute
  session-bound NEP-413 controlled-replacement challenge. It sends no transaction.
- `GET /api/chain/intents/:intentId/recovery/eligibility`: read-only inspection
  for the original signer. It creates no challenge and returns the pinned anchor,
  current finalized block, elapsed/remaining blocks and one of WAITING_VALIDITY,
  SIGNER_STATE_CHANGED, STORAGE_CREDIT_CHANGED or ELIGIBLE. Only ELIGIBLE includes
  replacement evidence; RPC timeout/unavailability remains an explicit error.
- `POST /api/chain/intents/:intentId/recovery/complete`: verifies the original
  FullAccess signer proof, repeats current evidence and atomically preserves the
  original UNKNOWN record while creating exactly one identical unsigned PREPARED
  replacement. Normal wallet authorization remains separate.

Migration 005 adds immutable intent bindings and append-only chain events,
per-wallet/vault unresolved-operation uniqueness, idempotency and monotonic
finalized observation protections. Migration 007 adds immutable recovery challenges
and evidence plus a one-way replacement marker; the unresolved uniqueness guard is
transferred atomically from the original to its single replacement. Worker leases
and finalized scan cursors survive restarts. Intent transitions and audit evidence
commit atomically. Existing migrations and financial contract state are not
rewritten. See runbooks/financial/RECONCILIATION.md for receipt, withdrawal and
controlled-replacement verification.

## M7 monitoring and incidents

Migration 006 adds immutable security_observations (server call sites only), security_events (unique source identities as processed checkpoints), security_rule_hits, security_alert_evidence, append-only security_incident_history, versioned security_alerts and security_worker_health. No arbitrary JSON/log bodies or public ingestion endpoint exists. Scope derives from stored source relationships; SQL guards bind mandates to organizations. Identity audit records gain append-only protection.

Active organization members GET /api/organizations/:orgId/security (50 alerts/page, counts and safe health), and GET .../security/:alertId (100 history/evidence refs/page). Existing owner/admin roles POST to the latter with version, state and optional reason; stale version returns 409. OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED/DISMISSED; terminal transitions require an allowlisted reason. No incident mutation touches a financial table. Notification and original-owner emergency permissions are explicit. Existing M6 begin/report and agent-disable/capability-revoke APIs remain the action paths.
