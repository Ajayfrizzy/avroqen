# Avroqen — controlled financial delegation for AI agents

**Built for NEAR Hackathon 2026** · **NEAR-native mandate and payment-security infrastructure** · **Hackathon prototype / Testnet**

> **Delegate actions, not unrestricted control of funds.** Avroqen lets an owner define narrow financial permissions while an AI agent may propose a payment, a separately designated verifier assesses required evidence, and owner-authorized onchain rules govern whether funds may move.

**[How judges can evaluate it](docs/JUDGE_DEMO.md)** · **[Five judging criteria](docs/JUDGING_CRITERIA.md)** · **[Architecture](docs/ARCHITECTURE.md)** · **[Current evidence boundaries](docs/RELEASE_STATUS.md)** · **[Hackathon demo post](https://x.com/ajay_frizzy/status/2121577743578198520)**

## The problem

AI agents can prepare purchases and automate procurement, but giving an agent unrestricted signing authority or access to a treasury exposes organizations to unintended recipients, overspending, forged supporting evidence, and compromised agent credentials. A basic amount limit alone cannot establish that a proposed expense is appropriate for the approved task.

## What Avroqen does

Avroqen separates financial responsibilities rather than assuming an AI agent, backend, external evidence, or verifier is infallible.

1. **Owner defines a typed mandate.** Specify the restricted agent, authorized recipient, exact per-payment and total ceilings, expiry, execution count, and evidence/approval policy. Mandate terms are immutable once approved; a change requires a new authorization.
2. **Agent proposes, rather than pays.** A separately scoped capability permits a payment proposal but does not give the agent the owner's wallet key, policy-editing privileges, or authority to sign as a verifier.
3. **Independent evidence review.** An assigned verifier evaluates a narrowly defined claim using independently obtained supporting material. A hash establishes byte integrity, not the truth of an invoice or delivery claim.
4. **Owner approval remains distinct.** The original owner provides required separate approval instead of inheriting it from the agent or verifier.
5. **MandateVault enforces the boundaries.** A Rust contract on NEAR enforces policy, account and proposal bindings, budget reservations, expiry, proof requirements and authorized execution. Its callback/accounting model distinguishes confirmed outcomes from unknown or pending state.
6. **Inspect, deny and recover.** The workspace exposes denials and security incidents; reconciliation handles uncertain RPC outcomes conservatively. Pausing/revoking and access changes have explicitly different onchain and offchain effects.

The financial scope demonstrated here uses **native NEAR**, not a claim of implemented stablecoin, cross-chain, mainnet, or unattended production payments.

## Implemented project components

| Component | Included implementation | Evidence / location |
| --- | --- | --- |
| Wallet identity and organizations | NEAR wallet-message login, session/organization access checks, roles and restricted agent registration | `apps/web`, `apps/api`, [implementation specification](docs/IMPLEMENTATION_SPEC.md) |
| Typed mandates | Immutable, exact-amount policies and wallet-approved offchain consent | [mandate implementation](docs/IMPLEMENTATION_SPEC.md#mandates) |
| Restricted agent proposals | Scoped capabilities, server-side authorization and deterministic policy input validation | `packages/agent`, [agent runbook](docs/runbooks/financial/AGENT_OPERATIONS.md) |
| Evidence and separated authorization | Assigned reviewer checks, scoped signed decisions and distinct owner approval rules | [attestation protocol](docs/ATTESTATION_PROTOCOL.md) |
| NEAR MandateVault | Rust contract, budgets, account bindings, reservation/transfer/callback state and defensive tests | `contracts/mandate-vault`, [contract spec](docs/CONTRACT_SPEC.md) |
| Transaction observation and incident UX | Read-only RPC/receipt verification, reconciliation, security events and wallet-reviewed actions | `services/chain`, `services/security`, [architecture](docs/ARCHITECTURE.md) |
| Judge SAMPLE | Six publicly readable explanatory routes, clearly separated from live identity or transactions | `/demo`, [judge walkthrough](docs/JUDGE_DEMO.md) |

**Evidence labels matter.** Implemented application flows, deterministic automated tests, local contract sandbox receipts, and publicly observable Testnet contract operations are different evidence classes. The repository records Testnet deployment/code checks and local sandbox payment behavior; **it does not present a verified end-to-end public Testnet recipient settlement as complete**. The source has not undergone an independent security audit. See [release status](docs/RELEASE_STATUS.md) and the [acceptance matrix](docs/evidence/FINANCIAL_ACCEPTANCE_MATRIX.md).

## Quick-start: reproduce a runnable demonstration

Prerequisites: Node **24.22.1**, pnpm **9.15.9**, Docker Engine/Compose for full-stack features, and Rust toolchain **1.96.1** for contract verification. Initial installs require access to public package registries. All commands are from the repository root.

**Option A — wallet-free judge walkthrough** (no database or blockchain access):

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @avroqen/web dev
```

Open **http://127.0.0.1:3000/demo**. Follow the six SAMPLE pages. They use fictional values, are clearly labeled SAMPLE, and do not create transfers.

**Option B — local application stack** (organization, wallet, mandates, agent/evidence workspaces):

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup:env
docker compose up --build -d --wait
pnpm test:smoke
```

Open **http://127.0.0.1:3000/workspace**. For wallet-based flows that require HTTPS, follow the [local HTTPS / Testnet runbook](docs/runbooks/financial/TESTNET_ACCEPTANCE.md) and use the supported wallet/account configuration. No project-provided public wallet credentials exist. Do not interpret an application-level approval as evidence of onchain settlement.

**Validate the code and contract:**

```bash
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:contract
pnpm test:wasm
```

With the Docker database running, run `pnpm test:database`, `pnpm test:identity-db` and `pnpm test:smoke`. CI additionally checks container behavior, outages, workflow integrity and secrets. Tests require the documented local environment and are not a substitute for independent production security review.

## Judge-readable “do X → see Y”

| Do this | Expected observation |
| --- | --- |
| Open `/demo` and navigate through six steps | The roles and boundaries are explained without wallet access; every example is labeled SAMPLE |
| Review the mandate page | Recipient, ceilings, execution limit, expiry and separate approvals constrain what an agent may propose |
| Review the proposals and evidence pages | Agent proposal and independent evidence review are separate from owner authorization |
| Open the outcomes page | The oversized SAMPLE request is denied even if below the total budget; unknown is not reported as paid |
| Explore the authenticated workspace with your own NEAR Testnet wallet | Identity, mandate, agent, evidence, settlement-observation and security workspaces, subject to configured authorizations |
| Run the contract and adversarial tests | Locally reproducible checks for policy violations, forged identities, replays, concurrency and reservation/accounting invariants |

Full routes, prerequisites, evidence provenance, and limits: **[docs/JUDGE_DEMO.md](docs/JUDGE_DEMO.md)**.

## Why NEAR?

The NEAR-native Rust contract makes the policy enforceable outside the AI runtime and backend. NEAR wallet signatures preserve owner and reviewer authority; explicit account IDs and typed operation arguments bind permission to a particular mandate/proposal. NEAR asynchronous receipts and callbacks are handled with reserved obligations and conservative reconciliation, rather than treating a submitted transaction as a completed transfer.

This prototype is not presented as a NEAR Intents or cross-chain implementation.

## NEAR Hackathon submission tracks

Avroqen fits three categories in the official submission form. The names below match the form exactly:

| Category to select | Fit | How Avroqen addresses it |
| --- | --- | --- |
| **AI Security & Defense** (`security`) | **Primary / strongest fit** | Restricts agent financial authority through exact spending caps, immutable policies, recipient binding, independent review, role separation, and NEAR smart-contract enforcement. |
| **Agent Economy** (`agents`) | Strong complementary fit | Gives AI agents a scoped way to propose payment requests and participate in financial workflows without unrestricted signing or treasury access. |
| **Autonomous Business** (`business`) | Strong complementary fit | Supports agent-assisted business procurement and supplier-payment workflows while owners retain mandate control and required approval authority. |

**Recommended form selections:** **AI Security & Defense**, **Agent Economy**, and **Autonomous Business**. The submission allows multiple applicable tracks; this is one project, not three submissions.

**Why other listed categories are not claimed:** Avroqen has not implemented a NEAR Intents cross-chain DeFi product, privacy-preserving AI computation, a multi-agent swarm economy, stablecoin/remittance rails, DAO social-money tools, or a games/NFT/memecoin application. **Real-World Money** is an adjacent potential use case (invoice-backed payments), but the current native-NEAR/Testnet prototype is more directly supported by the three categories above.

The track descriptions are product positioning; they do not imply independent audit, real business deployment, or a completed end-to-end public Testnet recipient settlement. Evidence for each selected category is in [the judging guide](docs/JUDGING_CRITERIA.md) and [technical architecture](docs/ARCHITECTURE.md).

## Judging criteria and realistic product direction

- **Technical implementation:** Rust Wasm contract plus end-to-end application boundaries, exact arithmetic, local sandbox and adversarial regression tests.
- **Design:** Readable, responsive owner/agent/verifier workspaces, explicit denials and transaction-status distinctions.
- **Impact:** Supplier invoice review, bounded procurement and controlled treasury automation for teams adopting agents.
- **Originality:** Combine task-specific policy, agent/owner/verifier role separation, independent claim evidence and onchain execution conditions, beyond a simple spending cap.
- **Sustainability:** A potential business-to-developer integration/service model; the operational and economic assumptions remain proposals, not customer adoption claims.

See **[docs/JUDGING_CRITERIA.md](docs/JUDGING_CRITERIA.md)** for substantiation, trade-offs and limitations.

## Repository guide

- `apps/web` — Next.js UI and SAMPLE walkthrough
- `apps/api` — Fastify application/API and identity/authorization
- `packages/domain`, `packages/agent` — shared contracts and restricted agent capability interface
- `contracts/mandate-vault` — Rust NEAR contract and tests
- `services/chain`, `services/security` — read-only reconciliation and monitoring
- `db` — migrations and relational read model
- `tests` — unit, integration, database, browser and adversarial tests
- `docs` — requirements, design decisions, technical specifications, evidence and operations

**Safety limits:** No independent audit; no claim of production-grade custody, unrestricted autonomous payments, stablecoin/fiat support, or a demonstrated end-to-end public Testnet recipient transfer. A Testnet account with an owner-retained full-access key is not an immutable, trustless vault deployment. Credentials must not be committed. The agent, API, and database must never substitute for the original owner's required signatures.

**Hackathon links:** [Public demo post](https://x.com/ajay_frizzy/status/2121577743578198520) · [Submission checklist](docs/HACKATHON_SUBMISSION.md).

_Updated for the NEAR Hackathon submission on November 14, 2026. Detailed milestone records are preserved in `docs/archive/`._
