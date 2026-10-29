# Avroqen — pre-build planning pack

**Status:** Avroqen is the owner-confirmed product name. **Prior working name:** MandateFlow. **Prepared:** 2026-10-29. **Implementation:** NOT STARTED. Official hackathon development starts 2026-11-01 00:00 UTC.

**Proposed product line (draft, not approved marketing copy):** Task-bound financial authority for autonomous agents.

## Purpose
Avroqen lets organizations delegate narrowly scoped transaction proposals to AI agents without granting the agents unrestricted control of funds. Owner-approved mandates, independently authenticated attestations, and an onchain vault constrain payment execution. The system assumes agent, API, provider, and verifier failures or compromise are possible and emphasizes exposure limits and recovery. It **does not** claim to be unhackable or independently audited.

## Reading order
1. `docs/PRD.md` — user journeys, functional scope, acceptance criteria
2. `docs/THREAT_MODEL.md` — attacker model and mitigations
3. `docs/ARCHITECTURE.md` — boundaries and subsystems
4. `docs/CONTRACT_SPEC.md` — funds, permissions, transitions, accounting
5. `docs/ATTESTATION_PROTOCOL.md` — evidence, identities and trust
6. `docs/API_DATA_MODEL.md` — backend interface and records
7. `docs/TEST_PLAN.md` — adversarial acceptance gates
8. `docs/MILESTONES.md` — dependency-based implementation plan
9. `docs/DECISIONS.md` — decisions and open questions
10. `docs/OPERATIONS.md` — monitoring, incidents, deployment
11. `docs/HACKATHON_SUBMISSION.md` — official rules and human approval gates
12. `AGENTS.md`, `.agents/skills/*/SKILL.md` — persistent Codex operating rules

`HACKATHON.md` is an unchanged copy of the organizer-provided file. It is authoritative for submission details; check the **live** version before submitting.

## Non-negotiables
- No agent self-authorization, self-verification, policy mutation, or treasury full-access credential.
- Onchain enforcement of budgets/recipients/executions/revocations. Never trust a frontend or backend `approved` boolean.
- External evidence is not truth merely because it is signed. A verifier attests only to precisely defined claims.
- No misleading success states. Track submitted / pending / succeeded / failed / unknown separately.
- No automatic mainnet spending. No personal out-of-pocket costs; use sandbox/testnet and organizer-provided resources.
- No deploy, push, publish, spend, or submission without explicit owner approval.

## Official links
- https://nearhackathon.com/HACKATHON.md
- https://docs.near.org/protocol/accounts-contracts/access-keys
- https://docs.near.org/smart-contracts/anatomy/crosscontract
- https://docs.near.org/smart-contracts/testing/unit-test
- https://docs.near.org/smart-contracts/testing/integration-test
