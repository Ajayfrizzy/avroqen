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

## M3 native NEAR vault

Rust owns the immutable policy, per-owner/mandate allocation and storage subledgers,
proposal/proof records and pending obligations. Agent proposes; selected verifier
attests; owner alone executes. Private callbacks consume actual runtime results.
No worker/API/private wallet key is involved. Local sandbox tests exercise compiled
Wasm, real native transfer receipts and actual recipient balances. This is not a
public deployment. `packages/domain/src/vault.ts` provides typed registration,
evidence and read boundaries; the web UI explicitly shows onchain services and
balances unavailable. No transaction adapter or backend custody signer is enabled.
The M2 consent flow remains offchain. M4 agent runtime, M5 independent evidence
acquisition and M6 indexer/reconciliation remain separate milestones.


## M4 application proposal boundary

D015 approves independently authenticated, hash-stored bearer capabilities scoped
by immutable mandate identity. Issuance uses original-owner membership/session/CSRF;
agent calls require their own capability and exact Origin, never an owner cookie.
Lock order is owner session where applicable -> owner membership -> consent ->
agent -> credential -> proposal. Live rechecks and one SQL transaction serialize
revocation/disable and proposal/audit creation. No network call occurs under locks.

The local deterministic runtime is a fixed tool union; task prose and evidence
digests remain untrusted. Offchain proposal persistence is not registration or
financial authorization. The M3 adapter builds arguments only; M5 verification and
M6 chain submission/indexing/reconciliation remain separate, unimplemented work.
See M4_DESIGN.md, M4_PROPOSAL_API.md and M4_AGENT_RUNBOOK.md.

## M5 independent human verifier

D016 selects B2: designated humans independently access authenticated sources;
`services/verifier` is a deterministic observation validator, not a provider daemon.
Agent metadata remains untrusted. Fresh session-bound NEP-413 decisions use M1
finalized active FullAccess Ed25519 checks. Assigned evidence access never grants
organization membership. Per-claim quorum and separate owner approval derive from
immutable policy; agent self-verification is rejected. Application disputes are
terminal locally and do not claim onchain effects. Migration004 stores immutable
metadata/reviews and append-only events with atomic challenge consumption.
No provider credential, file upload, URL fetch, signer or transaction sender exists.
See M5_DESIGN, M5_VERIFIER_RUNBOOK and M5_MAP1_INTEGRATION for trust boundaries,
exact-byte hashing and the separately authorized deployment/receipt path.

## M6 chain boundary

`services/chain` is a read-only NEAR RPC, receipt verification and reconciliation service. The API prepares typed wallet intents from immutable M2/M4/M5 records; the independent worker processes durable PostgreSQL intents without custody or broadcast capabilities. The settlement workspace requests explicit wallet transactions with function-call-key execution disabled. `docs/M6_DESIGN.md`, `docs/M6_RECONCILIATION.md` and the separately gated `docs/M6_TESTNET_RUNBOOK.md` define lifecycle, trusted-RPC assumptions, deployment governance and unknown-outcome quarantine. Application state never overrides contract funds or callback obligations.

## Vault governance boundary (M6 final review)

The hackathon uses a dedicated, owner-controlled Testnet demonstration vault with a retained FullAccess deployment key. That key can bypass contract restrictions through code replacement/account transfers; this is not immutable or fully noncustodial deployment. [VAULT_GOVERNANCE.md](VAULT_GOVERNANCE.md) documents the observed account and proposed future versioned factory/per-user-or-organization vault design. Factory, governance transition, upgrade/migration and recovery are future separately reviewed work, not M6 functionality. No platform master withdrawals or unilateral customer-vault keys/upgrades are permitted in that production direction.

## M7 security monitoring boundary

services/security projects internal audit/reconciliation sources into durable redacted tenant-scoped incidents. Detection is deterministic/advisory: no LLM or caller event authorizes blockchain state. A separate monitoring loop and PostgreSQL pool share the existing non-root worker service without gating M6 reconciliation. Source identities provide durable replay checkpoints; SQL guards preserve history and scoped incident versions.

/workspace/security exposes incidents and links to explicit M6 wallet review for owner/verified-guardian controls. App disabling and capability revocation stay offchain. The worker is read-only toward NEAR, including code/key/domain and gas/backing observations. No signer, broadcast client or financial scheduler was added. See M7_DESIGN.md and M7_INCIDENT_RUNBOOK.md.
