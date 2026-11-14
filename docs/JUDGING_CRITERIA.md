# Avroqen — NEAR Hackathon judging evidence

**November 14, 2026** · [README](../README.md) · [Reproducible walkthrough](JUDGE_DEMO.md) · [Demo post](https://x.com/ajay_frizzy/status/2121577743578198520)

This document maps the project to the organizer-described evaluation themes: technical implementation, design, impact, originality and sustainability. It is a traceable engineering/product explanation, **not a claim of the judges' actual scores**.

## One-minute product summary

AI agents increasingly propose financial actions; unrestricted wallet authority exposes businesses to changes in amount, recipient, purpose and evidence. Avroqen lets a human owner define exact, task-bounded spending rules, restrict the agent to proposal authority, require independently scoped review and any separate original-owner approval, and enforce execution rules within a NEAR-native MandateVault.

The prototype implements the roles and controls in a Next.js/Fastify/Rust system. A public six-screen SAMPLE demonstration explains them without exposing real keys or requiring a Testnet account. This sample is illustrative, **not transaction evidence**.

## 1. Technical implementation

**Evidence in the repo:**
- [Architecture](ARCHITECTURE.md) documents trust tiers, wallet signing, API/DB and NEAR contract boundaries.
- [Contract specification](CONTRACT_SPEC.md) documents immutable policies, exact NEAR amounts, reservation/accounting, callback finalization and revocation limits.
- `contracts/mandate-vault/src/{lib,policy,tests}.rs` implements and tests the NEAR Rust contract. Local sandbox contract tests live under `contracts/mandate-vault/tests/`.
- `apps/api`, `packages/agent`, `services/chain`, `services/security` implement restricted capabilities, evidence, read-only chain observation, idempotency/reconciliation and monitoring.
- `.github/workflows/ci.yml` defines separate foundation and Rust jobs, with lint/typecheck, builds, browser tests, database/containers, outage behavior, secret scan and contract checks.
- [Acceptance traceability](evidence/FINANCIAL_ACCEPTANCE_MATRIX.md) distinguishes automated, sandbox and public-chain evidence. [Release status](RELEASE_STATUS.md) states boundaries.

**What can be reproduced:** `pnpm check`, `pnpm build`, `pnpm test:e2e`, `pnpm test:contract`, `pnpm test:wasm` and the documented Docker-backed tests. These are real implemented-test commands, not assertions that this document executed them.

**Limits:** No independent security audit and no verified complete public Testnet recipient settlement is claimed. Successful local Wasm/sandbox transfers do not become public-Testnet transaction evidence by association.

## 2. Design and user experience

The user-facing design separates responsibilities: owner sets policy, agent submits a bounded proposal, designated verifier assesses evidence, owner reviews required approval, and the settlement/security workspace reports chain observations and risk conditions.

- **Legibility:** decimal NEAR amounts are displayed while exact integer conversions protect validation; critical terms are shown before wallet signing.
- **Clarity of authority:** a proposal is not approval; owner approval is not automatically transaction submission; pending/unknown is not success.
- **Safety-oriented feedback:** denial codes and blocked actions explain missing authorization or policy mismatch without implying funds moved.
- **Accessibility:** mobile-responsive layout and automated browser/axe checks are included; the project does not imply an independent comprehensive accessibility audit.
- **Reproducible illustrated walkthrough:** `/demo` contains six read-only routes. [UI design](UI_DESIGN_SYSTEM.md) and [judge demo](JUDGE_DEMO.md) document them.

The supplied social video is an **illustration of the product's workflow**, not screen-recorded financial settlement.

## 3. Real-world impact

**Target workflows:** bounded supplier purchasing, expense review, scheduled operational purchases and agent-assisted procurement. A business owner can delegate preparation work without delegating custody authority. A reviewer can independently assess an invoice claim before the owner decides whether a payment is allowed.

**Illustrative example:** An organization authorizes a restricted agent to propose a supplier payment only to a preapproved NEAR recipient, within an exact per-payment and cumulative budget, during an allowed time window. A designated reviewer evaluates a specific evidence claim, and the original owner's separate approval remains mandatory where policy requires it.

**Value hypothesis:** fewer unrestricted treasury credentials, clear accountability for decisions, and reduced exposure when an agent or tool is compromised. This is a potential benefit, **not a measured fraud reduction or evidence of customer adoption**.

See [PRD](PRD.md), [threat model](THREAT_MODEL.md) and [attestation protocol](ATTESTATION_PROTOCOL.md).

## 4. Originality and differentiation

| Approach | Where it stops | Avroqen's differentiator |
| --- | --- | --- |
| Unrestricted AI-controlled treasury wallet | The agent's signing authority may permit funds to move directly | Agent proposal capabilities do not include the owner wallet's signing authority |
| Basic wallet spend limit | Controls amount but does not independently establish task purpose or evidence authenticity | Typed recipient/expiry/count/amount rules plus independent claim review |
| Offchain approval dashboard alone | A compromised backend can potentially misrepresent approval state | Contract enforcement and wallet identities remain authoritative for protected financial state |
| Generic invoice workflow | Approves business documents but does not inherently bind them to onchain spend rules | Scoped attestations and policy-bound execution arguments are checked at the NEAR contract boundary |

These are **architectural comparisons**, not claims that no other project offers similar controls. Competitive uniqueness has not been established through a comprehensive market survey. The specific combination and implementation are the project contribution.

## 5. Sustainability and credible adoption path

**Intended users:** developers building AI-driven business workflows and organizations experimenting with controlled agent payments. **Potential delivery model:** an integration API/SDK with a web control panel, deployed in a customer-owned or organization-controlled environment.

**Possible economic model (not implemented billing):** charge integrating organizations for hosted service/support or per active mandate/workflow, with public NEAR network fees paid separately by the transaction initiator. Avoid claiming existing revenue, customers or fixed pricing. Pricing and platform unit economics require validation.

**Operational costs and controls:** network gas/storage, RPC reliability, PostgreSQL, job processing, browser/wallet compatibility, signing UX, incident response, software maintenance and independent contract security review prior to meaningful real-money deployment. See [operations](OPERATIONS.md) and [vault governance](VAULT_GOVERNANCE.md).

**Future work, clearly outside this hackathon's demonstrated scope:** independent production audit, hardened governance of upgrade keys, mainnet deployment, stablecoin/cross-chain rails, broader evidence providers and a validated business model. A sustainable product must make ongoing security and network costs transparent.

## How a judge can check each claim

1. **Run the no-wallet demo:** `pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @avroqen/web dev`; visit `http://127.0.0.1:3000/demo`.
2. **Inspect implementation:** `apps/api`, `apps/web/app/workspace`, `contracts/mandate-vault`, `services/chain`.
3. **Run tests:** follow [README](../README.md) and [judge walkthrough](JUDGE_DEMO.md); distinguish code tests, local sandbox receipts and public-chain operations.
4. **Read evidence limitations:** [release status](RELEASE_STATUS.md), [acceptance matrix](evidence/FINANCIAL_ACCEPTANCE_MATRIX.md), [deployment evidence](evidence/2026-11-11-VAULT-CODE-REPLACEMENT.md).
5. **Watch the public demo post:** [Avroqen's NEAR Hackathon post](https://x.com/ajay_frizzy/status/2121577743578198520).

*No live settlement is claimed without the required finalized transfer/accounting evidence. No independent audit, customer adoption, or commercially validated revenue model is claimed.*
