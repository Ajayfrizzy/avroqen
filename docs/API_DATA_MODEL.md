# Backend API and data-model contract

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
- `POST /v1/proposals` validated agent identity, bounded payload, idempotency key; creates proposal **not a payment**.
- `GET /v1/mandates/:id` read model with chain-lag indicators.
- `GET /v1/proposals/:id`, `GET /v1/executions/:id`, `GET /v1/audit?mandate_id=` scoped to org access.
- `POST /v1/evidence` authorized upload/token, hash/size/type checks, short-lived private storage; no public secrets.
- `POST /v1/attestation-previews` verifier-only preflight, **not a blockchain approval**.
- `POST /v1/agents/:id/disable` app-level credential revocation; also provide owner-signed onchain change to remove spending authority.
- `GET /health`, `GET /ready` separate liveness/dependency checks.

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
