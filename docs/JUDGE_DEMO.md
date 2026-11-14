# Avroqen — judge walkthrough and evidence ledger

**Start here:** [Project overview](../README.md) · [Judging criteria](JUDGING_CRITERIA.md) · [Official demo post](https://x.com/ajay_frizzy/status/2121577743578198520) · [Release/evidence scope](RELEASE_STATUS.md).

## Two distinct ways to review Avroqen

**A. Immediate, no-wallet explanation:** run `pnpm install --frozen-lockfile --ignore-scripts`, then `pnpm --filter @avroqen/web dev`, and open `http://127.0.0.1:3000/demo`. This is six-page **SAMPLE** content, not a payment transaction. Follow: Start → Mandate → Agent proposal → Independent review → Outcomes → Evidence and limits. The outcomes page contrasts an eligible request with an above-cap rejection.

**B. Inspect the actual implemented system:** from the repository root, run `pnpm setup:env` and `docker compose up --build -d --wait`, then inspect `http://127.0.0.1:3000/workspace`. Identity, mandates, proposals, evidence reviews, settlement observations and incident/security screens are implemented. Wallet signing needs a properly configured Testnet wallet, HTTPS and the [financial runbook](runbooks/financial/TESTNET_ACCEPTANCE.md). No public/test wallet credentials are supplied. Never sign or fund solely to complete a judge's SAMPLE walkthrough.

**Checks:** `pnpm check`, `pnpm build`, `pnpm test:e2e`, `pnpm test:contract`, `pnpm test:wasm`; database-backed commands require Docker. The repository's CI workflow specifies the broader checks.

## What each screen proves

| View or test | Demonstrates | Does not demonstrate |
| --- | --- | --- |
| SAMPLE Mandate | Concrete recipient, spending ceilings, expiry and execution count | A funded live mandate |
| SAMPLE Proposal | Agent cannot pay or approve its own request | A wallet-signed onchain proposal |
| SAMPLE Review | Different verifier and owner responsibilities | Independent verification of a real-world invoice |
| SAMPLE Outcomes | Amount-denial and conservative unknown-state semantics | A real recipient transfer |
| Authenticated workspace | Working UI/API authorizations with suitable local setup | Automatically validated production custody |
| Rust/sandbox tests | Compiled contract enforcement, actual local receipts/accounting | Public Testnet/mainnet settlement |
| Public Testnet deployment evidence | Deployable NEAR Wasm and recorded code/account checks | An end-to-end recipient settlement |

## Evidence discipline

Record only verified behavior at its correct level. Existing public Testnet contract deployment/code evidence and local sandbox accounting are useful supporting artifacts; no verified completed public Testnet recipient transfer is represented as finished. No external independent security audit is claimed. The public social video is an explanatory illustration.

---

## Historical SAMPLE-specific walkthrough and earlier acceptance notes


**Status — November 8, 2026:** the six-page read-only SAMPLE walkthrough is
implemented on `staging`, with [nine captured, inspected and hash-verified local SAMPLE screenshots](evidence/m9/README.md).
Recording, hosting, repository publication, social posting and hackathon submission
remain pending and separately authorization-gated. The captures do not establish
physical-device or live financial acceptance. Full M8 live acceptance and full M9
release readiness remain incomplete.

## Safety and acceptance boundary

The SAMPLE walkthrough explains Avroqen's intended authority boundaries with a
single immutable fictional dataset. It does not connect a wallet, authenticate a
person, read application data, call an application API or NEAR RPC, submit a
transaction, or mutate financial state. Every fictional card is marked `SAMPLE`,
and the persistent notice states:

> SAMPLE — Fictional data. No wallet connection or transactions.

Policy eligibility is not independent verification or payment authorization. An
independent review is not owner approval. Owner approval is not submission. A
submitted transaction is not a final receipt. A finalized receipt graph must bind
the expected transaction, action, transfer and private callback receipts to matching
contract state and accounting before settlement can be described as successful.

The private Meteor Primary-key integration remains stopped under D026. Primary-key
proof is **BLOCKED**, the temporary Testing FullAccess key is **RETAINED**, and
financial operations are **DISABLED**. No independent security audit is claimed.

## Reproduce the local SAMPLE walkthrough

Prerequisites and versions are recorded in the repository [README](../README.md).
From a clean checkout, use the existing package scripts:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @avroqen/web dev
```

Open <http://127.0.0.1:3000/demo>. The SAMPLE routes do not require a wallet,
login, API, database, RPC endpoint or `.env` file. First-time package installation
may require access to public registries. Do not substitute real identities or data.

### Applicable non-wallet validation

Local core checks use existing repository scripts and require no wallet or live
financial operation:

```sh
pnpm check
pnpm build
```

The focused Chromium check requires the existing documented browser installation
prerequisite from [Verify the foundation](../README.md#verify-the-foundation).
Installation may need public registry/browser-download access the first time:

```sh
pnpm exec playwright install chromium
pnpm exec playwright test tests/e2e/sample-demo.spec.ts
```

The workflow and secret scanners are Docker-backed:

```sh
pnpm test:workflow
pnpm test:secrets
```

They require Docker daemon access and the exact pinned scanner images to be cached
before their `--network=none` containers can execute without a download. Browser or
Docker-backed checks can be unavailable in a restricted local environment. Record
that limitation rather than treating an unexecuted check as a pass. These are
documented commands, not claims that this document ran them. None establishes
live-wallet, independent-source or public Testnet financial acceptance.

## Six-step judge walkthrough

Use the direct links or the visible step navigation. Each page provides literal
Previous/Next links; navigation and narrative remain available without client
JavaScript. A complete pass is six page views and five Next interactions.

| Step | Direct route and navigation | Expected observation | What the screen establishes |
| --- | --- | --- | --- |
| 1. Start | [`/demo`](http://127.0.0.1:3000/demo) → **Next: Mandate** | Sample Studio and four synthetic roles; “No network connected”; persistent and per-card SAMPLE labels | The agent proposes only. The owner defines terms and separately authorizes payment. The verifier reviews independently and cannot transfer funds. |
| 2. Mandate | [`/demo/mandate`](http://127.0.0.1:3000/demo/mandate); **Previous: Start** / **Next: Agent proposal** | Total ceiling **0.10 NEAR** (`100000000000000000000000` yoctoNEAR), per-payment cap **0.05 NEAR** (`50000000000000000000000`), maximum **two executions**, funding **not observed** | A policy ceiling is neither a deposit nor an available balance. The terms precede any proposal. |
| 3. Agent proposal | [`/demo/proposal`](http://127.0.0.1:3000/demo/proposal); **Previous: Mandate** / **Next: Independent review** | The **0.04 NEAR** (`40000000000000000000000` yoctoNEAR) example is within the SAMPLE policy but remains not authorized, illustrative-only and not submitted | A restricted agent can propose within exact bounds but cannot approve, attest, sign or pay. |
| 4. Independent review | [`/demo/review`](http://127.0.0.1:3000/demo/review); **Previous: Agent proposal** / **Next: Outcomes** | The verifier would obtain the source independently and check issuer/reference, exact bytes, amount, recipient, claim scope, expiry, quorum and separate owner approval | A hash proves integrity of bytes, not truth. `INVOICE_ISSUED` does not prove delivery. No source was actually checked here. |
| 5. Outcomes | [`/demo/outcomes`](http://127.0.0.1:3000/demo/outcomes); **Previous: Independent review** / **Next: Evidence and limits** | Compare the eligible 0.04 example with a **0.07 NEAR** (`70000000000000000000000` yoctoNEAR) rejection, which exceeds the 0.05 per-payment cap despite remaining below the 0.10 total ceiling. Read pending, unknown, pause and revoke explanations | Policy denial cannot be overridden by agent intent, an administrator or an evidence digest. Submitted does not mean paid; unknown means neither success nor confirmed failure and must not trigger blind retry. |
| 6. Evidence and limits | [`/demo/evidence`](http://127.0.0.1:3000/demo/evidence); **Previous: Outcomes** / **Back to start** | Four evidence classes and explicit unresolved gates; exact safety restriction codes remain inspectable | SAMPLE, automated, local sandbox and owner-verified public Testnet evidence have different provenance. Deployment/initialization is not a payment receipt. |

On a desktop, use the persistent side navigation or Previous/Next links. On a
mobile viewport, use the same ordinary route links; there is deliberately no
drawer. At 320px and above, text and controls should reflow without horizontal
page overflow. Physical Android, manual screen-reader, native browser zoom and
non-Chromium acceptance remain outstanding and must be recorded separately.

## Evidence ledger

Evidence classes are intentionally non-interchangeable. “Verified” below means
the evidence was checked within its named scope; it does not imply an independent
security audit or prove a different class of event.

| Class | Date and provenance | Repository sources | What it establishes | Explicit limitations |
| --- | --- | --- | --- | --- |
| SAMPLE display | November 8, 2026; merged implementation commit `52827cae055b4561303ff7b1b9ec5fcf4ad8386e` and staging merge `a3dce911e3967538b1a3632af2baf34df2f941f4` | [SAMPLE contract](SAMPLE_CONTRACT.md), `apps/web/app/demo/sample-data.ts`, D027 in [DECISIONS](DECISIONS.md#d027--public-sample-display-contract-not-financial-authority) | Six static public routes, immutable synthetic values, route/request isolation and a judge-readable explanation | No real identity, source, signature, funded balance, chain observation, authorization or settlement |
| Automated fixtures | Latest SAMPLE results recorded November 8, 2026; controlled local test identities and browser contexts | [SAMPLE contract validation](SAMPLE_CONTRACT.md#m93-targeted-responsive-and-accessibility-corrections), [M8 matrix](evidence/FINANCIAL_ACCEPTANCE_MATRIX.md), `tests/e2e/sample-demo.spec.ts` | Deterministic policy explanations, source/import isolation, rejection paths, responsive behavior and automated accessibility checks | Fixtures and synthetic cookies are not real authentication, independent human review, physical-device acceptance or public-chain evidence |
| Local sandbox | M3 report committed November 2, 2026; M6/M8 local receipt and reconciliation results recorded November 2–3, 2026 | [M3 report](archive/milestones/M3_REPORT.md), [M6 report](archive/milestones/M6_REPORT.md), [M8 report](archive/milestones/M8_REPORT.md#actual-local-verification), [S01–S20 matrix](evidence/FINANCIAL_ACCEPTANCE_MATRIX.md) | Actual compiled local Wasm behavior, valueless local recipient deltas, callbacks, accounting, successful/failed local receipts and automated adversarial coverage | Ephemeral sandbox identities and receipts are not public Testnet payments, genuine source evidence, real-wallet actor separation or an independent audit |
| Owner-verified public Testnet deployment | November 7, 2026; owner-provided verified evidence, not independently refreshed during its documentation update | [Deployment key gate report](DEPLOYMENT_KEY_GATE_REPORT.md#owner-verified-testnet-deployment--november-7-2026); transaction `4PtZ7AoK1yVCFKit8LXJ8m4MqgCCh7JtwFu3gy2R7JD5`; approved Wasm SHA-256 `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48` | Finalized successful deployment/initialization of the approved 366735-byte Wasm, zero-liability initialized accounting, and the owner-reported two FullAccess-key set | Not a mandate registration, funding event, attestation, payment, recipient delta, Primary control proof, Testing-key retirement, fresh independent RPC observation or security audit |

Historical M1/M2 owner-reported desktop and Android observations retain only the
scope recorded in [M8_REPORT](archive/milestones/M8_REPORT.md#evidence-classes-and-remaining-requirements).
They do not complete the integrated M8 journey or certify the later UI.

## Acceptance matrix

Status terms: **implemented** means code exists; **automated** means controlled
tests passed as recorded; **sandboxed** means actual local Wasm/receipt behavior;
**owner-verified** identifies the owner-provided public deployment record;
**pending** means required evidence has not been collected; **blocked** means a
separate security or authorization gate forbids proceeding.

| Requirement | Current status | Evidence and remaining boundary |
| --- | --- | --- |
| PRD F01–F03 and F05: owner/org, restricted agent, typed mandate and proposal | Implemented; automated; historical human observations are partial | The SAMPLE explains these roles but is not an authenticated or live integrated journey. |
| F04 and F07–F09: custody, accounting, settlement, emergency control and audit mapping | Implemented; automated; sandboxed; deployment/initialization owner-verified | No authorized public Testnet mandate, funding, payment, recipient delta, callback/accounting settlement or emergency transaction has been recorded. |
| F06 and F12: scoped independent evidence and human review | Implemented and automated | Genuine independent-source access, designated-verifier signing and separate owner approval remain pending. |
| F10: monitoring and incident UX | Implemented and automated | Hosted operation, operator liveness, recovery and teardown acceptance remain pending. Monitoring is advisory. |
| F11: public read-only SAMPLE | Implemented and automated | The six routes are merged. Hosting, evidence capture, physical Android, manual assistive-technology and publication approval remain pending. |
| N01–N07 | Automated and local coverage recorded | Automation is not proof of source honesty, public settlement, complete accessibility or absence of vulnerabilities. No independent audit exists. |
| N08: zero personal spending | Required and currently preserved | RumptyCloud credits, quotas, billing and capabilities are unverified. Do not provision or require a personal card. |
| PRD acceptance A | Sandbox path demonstrated; public Testnet variant pending | The [M8 matrix](evidence/FINANCIAL_ACCEPTANCE_MATRIX.md#m8-s01s20-traceability) records an actual local recipient delta, finalized receipt graph, authenticated callback and correct accounting. This does not complete M8 or M9's genuine-source and public Testnet gates. |
| PRD acceptance B–D | Implemented and automated/sandboxed | Live Testnet negative, pause/revoke and recovery observations remain pending and separately authorized. |
| PRD acceptance E | In progress | This document supplies judge instructions; screenshot/video provenance, hosted reproduction and final release review remain pending. |
| M8 integrated acceptance | Pending | Genuine source, separate live actors/signatures, authorized public settlement, accounting/recipient delta, recovery and physical Android acceptance are incomplete. |
| M9 SAMPLE slice | Implemented and merged | Static display only; it cannot satisfy M8 live gates. |
| Full M9 | Pending; publication actions blocked without owner approval | Genuine Testnet results, reviewed hosting/CSP/secrets/teardown, evidence assets and authorized publication/submission are incomplete. |

## Known evidence gaps and release gates

- No public Testnet payment, funded mandate, payment receipt, recipient balance
  delta or integrated public accounting result has been recorded.
- Genuine independent-source access and separate designated-verifier/original-owner
  signing acceptance remain pending.
- Primary-key control is not proven. D026 blocks the private Meteor browser path;
  the temporary Testing FullAccess key remains retained.
- Both retained FullAccess keys can replace code or transfer account funds outside
  MandateVault restrictions. The deployment is not described as immutable or fully
  noncustodial.
- The `/demo` tree shares the application origin. It does not read session identity,
  but it is not a separate-origin sandbox. Public ingress and same-origin exposure
  require explicit review.

Before any host is approved, verify exact HTTPS origin handling, CSP, allowed
public routes, private API/database/worker boundaries, absence of client secrets,
cost limits, logging/privacy, backup and teardown. Prefer a narrowly reviewed
public surface for `/`, `/demo/**`, Next static assets and required health behavior;
do not expose authenticated or financial services merely to host the SAMPLE pages.

The owner must separately approve repository visibility, hosting/provisioning,
recording/public assets, any social post and the exact final submission payload.
Financial Testnet steps additionally require the transaction-by-transaction owner
authorization defined by the M8 runbook. No approval is implied by documentation.

## 90–100 second presenter script

This script is for a human presenter. Keep the SAMPLE notice visible and do not
connect a wallet or imply that the fictional proposals settled.

1. **0:00–0:15 — Start.** “Avroqen gives an agent task-bound proposal authority,
   not custody. This is fictional SAMPLE data: no wallet and no transactions. The
   owner sets terms, the agent proposes, and an independent verifier checks a
   precisely scoped claim.” Select **Next: Mandate**.
2. **0:15–0:30 — Mandate.** “This mandate permits at most 0.10 NEAR in total,
   no more than 0.05 per payment, and no more than two executions. A ceiling is
   not funding or an available balance.” Select **Next: Agent proposal**.
3. **0:30–0:43 — Proposal.** “The restricted agent proposes 0.04 NEAR. It is
   inside policy, but still has no verified evidence, owner authorization or
   transaction.”
   Select **Next: Independent review**.
4. **0:43–0:59 — Review.** “A designated verifier must obtain the source outside
   the agent, then check issuer, reference, exact bytes, amount, recipient, claim,
   expiry and quorum. A hash proves matching bytes, not truth, and invoice issuance
   does not prove delivery.” Select **Next: Outcomes**.
5. **0:59–1:17 — Outcomes.** “The 0.04 proposal is only policy-eligible. The
   0.07 proposal is rejected because it exceeds the 0.05 per-payment cap. Pending
   is not paid, and unknown is not failure; Avroqen forbids blind retry.” Select
   **Next: Evidence and limits**.
6. **1:17–1:40 — Evidence.** “These four evidence classes stay separate. Tests
   and local sandbox receipts validate implementation behavior. The public Testnet
   transaction proves deployment and initialization only—not a payment. A genuine
   source, independent live signing, authorized settlement and recipient delta are
   still pending.”
