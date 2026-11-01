# System architecture and trust boundaries

## Trust tiers
**Tier A:** owner wallet signing, deployed vault bytecode/state, onchain account identity, protocol guarantees. **Tier B:** explicitly designated verifiers and their independent evidence sources; their honesty is NOT guaranteed. **Tier C:** web app, backend, DB, workers, agent, tool outputs, providers, RPC responses; treat as untrusted with respect to custody.

```
Owner wallet --signed onchain action--> MandateVault (owner-controlled funds)
       |                                ^     |
       v                                |     v
Web UI --> Fastify API --> DB/read model|  transfer + private callback
                   |                   |
            Agent adapter --> proposal-+
                   |
           UNTRUSTED external data
Independent verifier --> signed/authenticated onchain attestation --> vault
Indexer/worker <--- chain transactions/events/callback outcomes
```

## Components
- `apps/web`: Next.js responsive UI; all financial displays tagged with chain status; owner wallet and clear signing prompts.
- `apps/api`: Fastify auth, org/agent config, proposal submission and querying, rate limiting; never sole authorizer of value movement.
- `apps/worker`: chain event ingestion, idempotent projections, reorg/finality-aware reconciliation, alerts.
- `packages/domain`: shared Zod/TypeScript schemas and deterministic app-side preflight checker (advisory only).
- `packages/agent`: constrained tool interface; agent may call propose/query, never sign as owner/verifier/admin.
- `contracts/mandate-vault`: Rust NEAR custody, checks, reservations, callbacks, audit events; authoritative state.
- `services/verifier`: separately controlled credentials; no unrestricted trust in AI-generated assertions.
- `db`: PostgreSQL read model; not custody ledger. Support replay from onchain state/events.

## Security boundaries
- Authenticated backend API is **not** an onchain owner authorization substitute.
- Backend database compromise must not enable changes to live mandate budget/recipient/verifier.
- A compromised verifier may generate false attestations within its scoped authority. Owners must control trusted verifier selection and optionally require quorum/human approval; limit exposure.
- A compromised contract is a shared-vault systemic risk. Cap deployed funds in demo; explicitly disclose limitations and get third-party audit before meaningful real-money production use.
- Provider evidence is independent of agent assertions only if verifier sources data through authenticated channels not under agent control.

## NEAR-specific rules
- Function-call keys restrict target contract/method and cannot attach NEAR; gas allowance is not a spending budget. Do not assign full-access treasury keys to agents.
- Asynchronous promises are independent; an outbound failure does not roll back earlier state. Reserve before transfer, finalize in **private callback**, reconcile unknown states conservatively.
- Use correct `predecessor_account_id` / `signer_account_id` semantics with explicit tests for delegated, relayed and cross-contract paths. Do not assume predecessor == signer in every flow.
- Native NEAR first; adding FT/NEP-141 or NEAR Intents later requires new interface, registered storage, callbacks, decimal handling and security review.
- Contract immutable or upgrade-controlled only via explicitly documented owner governance; no platform-admin unilateral key.

## Operational plan
Local Docker Compose Postgres/API/web, contract sandbox integration, testnet demonstration, publicly reproducible repo. No paid infra assumptions. Pin exact dependency versions during M0, verify official NEAR docs/SDK versions before implementation.

## M2 offchain mandate preparation

The shared domain defines canonical v1 policies. The identity plugin registers
organization-scoped mandate routes using the existing M1 security helpers.
`mandate_policies` holds immutable canonical JSON and its SHA-256 digest;
`mandate_consents` records terminal offchain lifecycle; session-bound five-minute
`mandate_challenges` protect fresh NEP-413 signing; `mandate_events` is append-only
for ordinary UPDATE/DELETE. Verification rechecks permissions/state after finalized
RPC, then consumes challenge, changes consent and appends event in one transaction.
SQL locks order session -> membership -> consent -> agent; no RPC under SQL locks.
No record is an onchain mandate or portable signature certificate. M3 must obtain
new wallet-signed onchain authorization. See D013 and M2_DESIGN.md.
