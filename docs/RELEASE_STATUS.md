# Release and acceptance status

Documentation status as of November 11, 2026. This is the current acceptance entry
point; the [milestone plan](archive/milestones/MILESTONES.md) is preserved as historical planning.
Specifications define required behavior, while dated reports and test results
establish only their recorded scope. No fresh wallet, chain or organizer-rule
verification is implied by this restructuring.

## Current delivery boundary

- M0–M7 implementation exists; component reports and earlier owner-confirmed
  M1/M2 observations remain bounded historical evidence, not full-product release
  acceptance. Existing mandatory regression and CI gates remain required.
- The six-page public read-only SAMPLE walkthrough is implemented. The
  [judge guide](JUDGE_DEMO.md) and [SAMPLE contract](SAMPLE_CONTRACT.md)
  describe exact synthetic values and isolation rules. It requires no wallet/login.
- [Nine local screenshots](evidence/m9/README.md) have actual source attribution,
  hashes and coding-agent visual inspection. Mobile viewports are Chromium
  emulation, not physical Android acceptance. Video remains outstanding.
- [Owner-reported November 11 finalized Testnet replacement and post-deployment checks](evidence/2026-11-11-VAULT-CODE-REPLACEMENT.md) confirm that the corrected 367353-byte Wasm is deployed, the original two FullAccess keys remain, and initialized accounting is readable at finalized block 277208022. The [November 7 initialization record](DEPLOYMENT_KEY_GATE_REPORT.md#owner-verified-testnet-deployment--november-7-2026) remains historical. These facts do not establish a funded mandate,
  genuine-source attestation, public payment, recipient delta or live financial
  acceptance. No independent security audit is claimed.
- The narrow Primary proof is **BLOCKED** under D026, not a claim that the owner lacks custody of the account. The Testing FullAccess key is **RETAINED**, along with Primary. Financial operations remain **DISABLED**. No documentation change
  grants authority to sign, deploy, remove keys or enable financial submission.
- Nonfinancial readiness hardening separates read-only manifest verification from
  submission authority and strengthens RPC envelope/finalized-head checks. This is
  implementation assurance only: it does not refresh deployment evidence, resolve
  Primary control, authorize funding or pass any pending M8 live acceptance gate.
- Source hardening rejects designated third-party verifiers that overlap the mandate owner, restricted agent, exact recipient or vault, and keeps historical overlapping policies read-only. The owner-reported November 11 finalized replacement now deploys the corrected Wasm digest; this **supersedes** the earlier statement that the November 7 Wasm lacked this correction. Actual live independent-source attestation, onchain payment and complete financial acceptance are still **pending**. No historical unsafe policy is silently migrated.

## Pending integrated financial and human acceptance

The [coordinated Testnet acceptance runbook](runbooks/financial/TESTNET_ACCEPTANCE.md),
[S01–S20 matrix](evidence/FINANCIAL_ACCEPTANCE_MATRIX.md) and [test plan](TEST_PLAN.md) remain active.
Full M8 acceptance requires the integrated M1–M7 journey, including:

1. Genuine desktop/physical Android identity, immutable consent, cancellation,
   expiry, logout and organization isolation for the integrated current UI.
2. Restricted-agent proposal and independently retrieved authentic source bytes;
   an agent screenshot, digest or synthetic local exercise cannot pass this gate.
3. Designated-verifier fresh offchain review and separately authorized onchain
   attestation, exact per-claim quorum and any distinct original-owner approval.
4. Separately owner-authorized Testnet storage/registration/funding/execution with
   attributable finalized receipt graphs, actual recipient deltas and matching
   accounting. Deployment/init receipts cannot pass payment acceptance.
5. Negative/compromise, pause/revoke, reservation/withdrawal, outage/restart and
   UNKNOWN recovery behavior, with no blind retry or timeout reserve release.
6. Trusted HTTPS, private source/credential handling, physical-device and manual
   accessibility acceptance. Historical component observations and fixtures do not
   automatically pass the redesigned integrated journey. iOS remains deferred.

No safety case is waived. The matrix distinguishes automated, sandbox, historical
human, pending public-chain and independent-review evidence. A confirmed blocking
defect or failed mandatory check prevents integration/release; owner approval is
still required for concrete public financial actions.

## Pending judge release and submission

Full M9 remains incomplete. The original target includes a polished reproducible
judges' demonstration, genuine Testnet results, temporary RumptyCloud hosting,
HTTPS/secret isolation, teardown and separately authorized publication/submission.
The SAMPLE slice explains the product but cannot satisfy genuine M8 financial
acceptance or those full release gates.

Before public hosting, review whole-app CSP and wallet compatibility, exact HTTPS
origin/ingress, private API/database/worker boundaries, client-secret isolation,
logs, backup/retention, costs and teardown. RumptyCloud credits/capabilities remain
unverified. Zero personal spending remains mandatory; do not add a card, invent a
free tier or silently substitute paid services.

Physical Android, manual screen-reader, genuine browser zoom and cross-browser
SAMPLE acceptance remain outstanding. Automated axe and viewport checks do not
replace them. Screenshots are local evidence; public hosting, video, publication,
social posting and submission require their own approvals. The human supplies
submission identity/contact/payout fields, approves the exact release/payload,
and publishes the social post. Follow [submission requirements](HACKATHON_SUBMISSION.md)
and revalidate organizer rules from current authoritative sources before release;
[HACKATHON.md](../HACKATHON.md) remains the October 29 snapshot.

## Current engineering and operational rules

Use [implementation contracts](IMPLEMENTATION_SPEC.md), [contract specification](CONTRACT_SPEC.md),
[MAP-1](ATTESTATION_PROTOCOL.md), [reconciliation](runbooks/financial/RECONCILIATION.md),
[incident response](runbooks/security/INCIDENT_RESPONSE.md) and [operations](OPERATIONS.md).
Keep exact atomic arithmetic and immutable bindings, direct wallet authority,
independent evidence and contract enforcement. UNKNOWN obligations stay
quarantined; no backend/session, administrative override or monitoring action
releases them. [D026/D027](DECISIONS.md) retain their existing boundaries.

Historical deployment recipes and budget proposals remain evidence, not current
authorization. Use the active runbooks to prepare a fresh exact plan only when
separately authorized. No implementation, financial policy or live configuration
is changed by the archive.
