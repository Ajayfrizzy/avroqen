# Avroqen documentation index

**Hackathon judging entry points (November 14, 2026):** [README](../README.md) · [Judge walkthrough](JUDGE_DEMO.md) · [Judging criteria and evidence](JUDGING_CRITERIA.md) · [Release status](RELEASE_STATUS.md) · [Submission checklist](HACKATHON_SUBMISSION.md) · [Published demo](https://x.com/ajay_frizzy/status/2121577743578198520).

The product-facing pages above supersede older headline descriptions of the project as only a foundation or SAMPLE. Deep technical and historical evidence remains preserved below, including explicit limitations and dated acceptance records.

---


Use the [project README](../README.md), [current release status](RELEASE_STATUS.md)
and [judge walkthrough](JUDGE_DEMO.md) first. Permanent specifications live here;
active procedures have stable names under `runbooks/`. Milestone-named history,
old deployment recipes and investigations live in the [archive](archive/README.md).

The narrowly scoped Primary proof remains **BLOCKED** (not a claim of missing account control). Primary and Testing FullAccess are **RETAINED**, and financial operations are **DISABLED**. The [November 11 corrected Wasm replacement](evidence/2026-11-11-VAULT-CODE-REPLACEMENT.md) has finalized receipt and post-deployment evidence, but no real payment acceptance. No independent security audit or public payment
acceptance is claimed.

## Judges and release reviewers

- [Six-step public SAMPLE walkthrough and evidence ledger](JUDGE_DEMO.md)
- [Nine local SAMPLE screenshots, hashes and inspection](evidence/m9/README.md)
- [Immutable SAMPLE content and isolation contract](SAMPLE_CONTRACT.md)
- [Current incomplete financial/release acceptance](RELEASE_STATUS.md)
- [Submission checklist and human-only approvals](HACKATHON_SUBMISSION.md)

SAMPLE access needs no wallet or login. The 390px images are Chromium viewport
emulation, not physical Android acceptance. Hosting, video, publication and
submission remain separately authorized. Preserve the unchanged
[October 29 organizer snapshot](../HACKATHON.md); revalidate current requirements
before submission.

## Permanent specifications

- [Product requirements](PRD.md), [architecture](ARCHITECTURE.md),
  [API/data model](API_DATA_MODEL.md)
- [Application implementation/security contracts](IMPLEMENTATION_SPEC.md):
  [identity](IMPLEMENTATION_SPEC.md#identity),
  [mandates](IMPLEMENTATION_SPEC.md#mandates),
  [agent capabilities](IMPLEMENTATION_SPEC.md#agent-capabilities),
  [human evidence](IMPLEMENTATION_SPEC.md#human-evidence) and
  [monitoring](IMPLEMENTATION_SPEC.md#monitoring)
- [Contract specification and detailed custody rules](CONTRACT_SPEC.md)
- [MAP-1 attestation protocol](ATTESTATION_PROTOCOL.md),
  [threat model](THREAT_MODEL.md), [vault governance](VAULT_GOVERNANCE.md)
- [Test plan](TEST_PLAN.md), [UI design system](UI_DESIGN_SYSTEM.md),
  [operations](OPERATIONS.md)
- [Decision log](DECISIONS.md), especially
  [D026](DECISIONS.md#d026--primary-proof-blocked-private-browser-integration-stopped)
  and [D027](DECISIONS.md#d027--public-sample-display-contract-not-financial-authority)

The six additional root documents have distinct permanent roles:
`IMPLEMENTATION_SPEC.md` preserves detailed application security contracts;
`RELEASE_STATUS.md` tracks unresolved current gates; `JUDGE_DEMO.md` is the public
narrative; `SAMPLE_CONTRACT.md` defines isolation; `HACKATHON_SUBMISSION.md` holds
release approvals; `DEPLOYMENT_KEY_GATE_REPORT.md` is canonical owner-provided
deployment/key evidence. None is a milestone implementation plan.

## Active runbooks

| Domain | Stable procedures |
| --- | --- |
| Financial | [Testnet acceptance/authorization](runbooks/financial/TESTNET_ACCEPTANCE.md), [verifier acceptance](runbooks/financial/VERIFIER_ACCEPTANCE.md), [reconciliation](runbooks/financial/RECONCILIATION.md), [agent operations](runbooks/financial/AGENT_OPERATIONS.md), [agent API](runbooks/financial/AGENT_API.md) |
| Security | [Wallet acceptance and blocked Primary research](runbooks/security/WALLET_ACCEPTANCE.md), [Android HTTPS](runbooks/security/ANDROID_HTTPS.md), [incident response](runbooks/security/INCIDENT_RESPONSE.md) |
| Deployment | [RumptyCloud preparation and unverified provider prerequisites](runbooks/deployment/RUMPTYCLOUD_PREPARATION.md) |

The current Testnet acceptance runbook preserves exact actor/approval/budget-review
and activation gates. Historical financial amounts and signing recipes are not
current authorization. UNKNOWN obligations remain quarantined; no monitoring,
session or administrative action can release them.

## Evidence and review

- [November 11 corrected vault replacement](evidence/2026-11-11-VAULT-CODE-REPLACEMENT.md): owner-reported finalized transaction and read-only code/key/accounting verification, not payment acceptance
- [November 7 deployment/key report](DEPLOYMENT_KEY_GATE_REPORT.md): historical initialization evidence, not current deployed code or payment acceptance
- [Financial S01–S20 acceptance matrix](evidence/FINANCIAL_ACCEPTANCE_MATRIX.md)
- [M9 screenshot provenance manifest](evidence/m9/README.md)
- [M1 security-review package](security-review/m1/README.md) and
  [negative authentication procedures](security-review/m1/NEGATIVE_AUTH_CASES.md)
- [Historical documents, original paths and source commits](archive/README.md)
- [Owner-only historical executor archive](../scripts/deployment-review/OWNER_EXECUTION.md)

Evidence JSON, approved Wasm, twenty M8 UI screenshots and nine M9 screenshots
remain at their original paths. The M9 manifest remains byte-identical. Historical
milestone results retain their original scope and cannot pass missing genuine
source, public financial, physical-device or independent-review acceptance.
