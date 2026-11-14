# Implemented M4 proposal API

All routes are under the existing `/api` namespace. `/v1` remains an architecture
sketch, not an alias. Existing exact Origin, no-store, nosniff, 16-KiB body bound,
strict Zod parsing, sanitized errors and database-backed per-IP limits apply (30
writes/minute, 120 reads/minute; no trusted forwarded IP). No CORS expansion.
Error responses never include SQL, bearer values or task bodies.

## Owner and member routes

Base: `/api/organizations/:orgId/mandates/:mandateId`.

| Method / suffix | Authorization and body | Response |
| --- | --- | --- |
| POST `/credentials` | Original wallet owner + active org owner, M1 session/CSRF/Origin; `{purpose: "demo" or "operator", rotateId?: UUID}` | `{id, token, expiresAt, scope: "OFFCHAIN_PROPOSALS_ONLY"}`; token returned once |
| GET `/credentials` | Same original owner + active owner membership, session and CSRF header | Up to 128 metadata records `{id,purpose,expiresAt,revokedAt}`; no raw token/hash |
| POST `/credentials/revoke` | Same owner/session/CSRF/Origin; `{credentialId: UUID}` | `{revoked: true, onchainAuthorityChanged: false}` |
| GET `/proposals?offset=0` | Active org member session | Up to 50 proposals with server creation time, SUBMITTED_OFFCHAIN, NOT_SUBMITTED onchain; nextOffset |

Issuance requires approved/unexpired M2 consent and an active matching agent.
Credential scope derives from the immutable mandate FK: exact org, network, agent,
policy version/digest and intended vault. Issuer must match its wallet owner.
The raw random 256-bit capability is hashed with SHA-256 in storage; scope cannot
be edited. Credential max lifetime is 24h, demo max15m, bounded by mandate expiry.
128 retained credentials and 128 retained accepted proposals per mandate bound
application record growth. Rotation consumes a new credential slot; at the limit,
revoke remains available but a new mandate is needed for further issuance.
These are application bounds, not additional custody or financial limits.

## Independent agent endpoint

### Assigned-wallet discovery

An authenticated wallet may use `GET /api/agent/assignments?offset=0` to list at
most 50 immutable mandates whose stored `agent_account` exactly equals that wallet.
The response contains the policy/digest, owner-organization display name and only
the consent/expiry/agent/verifier status needed to inspect proposal eligibility.
This assignment does not create organization membership and does not authorize
organization, agent-record, consent, credential-operator or owner functions.

`POST /api/agent/assignments/:mandateId/credentials` accepts only
`{purpose:"demo"}` with the wallet session, Origin and CSRF. It rechecks exact
assignment, active owner membership, approved consent, matching active agent and
mandate expiry before returning one existing-format capability for at most 15
minutes. The immutable holder marker lets
`POST .../credentials/revoke` revoke only that wallet's own capability; an assigned
wallet cannot revoke owner-issued demo/operator credentials. `GET .../proposals`
returns only that exact assigned mandate's bounded history. Unknown and unassigned
IDs return `ASSIGNMENT_NOT_FOUND` without revealing another tenant's terms.

The capability still uses the independent endpoint below. It conveys no wallet,
verifier, owner, settlement or organization authority. Owner-issued operator
credentials and their 24-hour maximum are unchanged.

`POST /api/agent/tools` requires `Authorization: Bearer <opaque-token>` and exact
configured Origin. Owner cookies alone never authenticate an agent. Trusted clients
keep tokens outside task payloads and use no session cookie on this endpoint.

Strict discriminated union (extra fields rejected):

- `{tool: "mandate_summary"}`: immutable policy/digest, advisoryOnly and
  onchainStatus=NOT_SUBMITTED, scoped only to this credential.
- `{tool: "prepare", task: {description, amountAtomic, evidenceDigest,
  proposalId, idempotencyKey}}`: bounded inert text (1–1000 characters), decimal
  amount, SHA-256 lowercase hex and UUIDs. Returns proposal, preflight result,
  evidenceVerified=false and NOT_SUBMITTED. Zero or over-cap amounts are rejected
  in preflight; malformed amount encodings fail schema validation.
- `{tool: "submit", proposal: ProposalInput}`: revalidate all immutable terms,
  live permissions/expiry, then record once. HTTP200 with SUBMITTED_OFFCHAIN and
  replayed boolean for accepted/idempotent retries; HTTP200 PREFLIGHT_REJECTED
  with code for well-formed policy denials. Consumers must check status.
- `{tool: "proposal_status", proposalId: UUID}`: only proposals in this exact
  mandate/agent scope; unknown or out-of-scope IDs return404.
- `{tool: "denial_reasons"}`: fixed safe preflight code descriptions.

ProposalInput: schemaVersion=1, proposalId, idempotencyKey, organizationId, agentId,
agentAccount, mandateId, policyVersion=1, policyDigest, network, vaultAccount,
recipient, asset=NativeNear, amountAtomic and evidenceDigest. Amount is canonical
positive u128 decimal text, never floating point. UUID selectors grant no authority.
Evidence digest is a 64-character lowercase SHA-256 reference, not an attestation.
No owner approval flag, arbitrary tools, provider endpoints or execution methods.

Same mandate/key and same canonical content returns the existing proposal. Changed
content returns409 IDEMPOTENCY_CONFLICT. A duplicate proposal UUID with a new key
returns409 ALREADY_EXISTS; no duplicate is created. Rotation does not reset scope.
All retries recheck live permissions. Consent row locking serializes same-mandate
submissions and owner consent revocation; agent row locks serialize disabling.
Credential revocation/rotation also use the consent-before-credential order.
Server time is checked after waiting for authorization locks. Success audit and
proposal creation are one transaction. Policies, accepted proposals and events are
immutable/append-only for ordinary SQL operations; privileged DB administration
can bypass guards and is never custody authority.

Denials include401 AGENT_CREDENTIAL_INVALID;403 AGENT_DISABLED,
OWNER_ACCESS_REVOKED, OWNER_REQUIRED, ACCESS_DENIED, ORIGIN_DENIED, CSRF_DENIED;
409 CONSENT_UNAVAILABLE, MANDATE_EXPIRED, IDEMPOTENCY_CONFLICT, CREDENTIAL_LIMIT,
PROPOSAL_LIMIT;400 INVALID_REQUEST;413 oversized body;429 RATE_LIMITED;
503 SERVICE_UNAVAILABLE or POLICY_INTEGRITY_FAILED. Well-formed preflight codes:
SCOPE_MISMATCH, RECIPIENT_DENIED, PER_PAYMENT_LIMIT, MANDATE_EXPIRED.
Malformed/unauthorized failures use M1 sanitized denial audit; policy preflight
failures have scoped append-only agent events. Never store raw rejected payloads.

## Future integration

`toVaultProposal` produces only the actual M3 `submit_proposal` argument shape:
mandate_id, proposal_id, recipient, amount, evidence_digest. It does not sign or
send a transaction and does not establish deployment/registration. Future transport
must check the real network/vault/policy/agent identity and receive separately
approved account permissions. Direct M3 predecessor/signer enforcement applies.
M5 supplies independently authenticated evidence and claims; M6 supplies finalized
receipt/indexer/reconciliation handling. M4 contains no settlement worker or custody
credential, and never treats offchain state as chain acceptance or payment.
