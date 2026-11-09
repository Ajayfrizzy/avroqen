# M8 integrated acceptance design — D021

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

M8 reuses M1–M7, with no custody, contract, schema or authority redesign. This branch starts at merged M7 `646b5b23798714637be7aa72ff65ccb77971ae76`. Seven persistent project skills and canonical security specifications govern this work.

## Product journey and trust boundaries

`/workspace/journey` and shared wrapping workspace navigation connect wallet/org/agent, immutable consent, storage/registration/funding, restricted proposal, human evidence review, separate onchain attestation/owner approval, owner execution, recipient verification and incident response. Assignment and detail data come from existing tenant/role-authorized endpoints. A mandate policy ceiling is never displayed as a funded balance. Offchain proposal counts do not imply chain inclusion. Each participant follows their own wallet action; application roles cannot substitute for signing identities.

The journey shows finalized observations with block height, unresolved warnings and only server-verified explorer references. Refresh clears the prior observation; failed fetch/binding leaves completion unavailable. It is a guide, not an authoritative eligibility engine or a complete paginated financial ledger: the existing endpoint returns bounded history. The settlement workspace remains the exact transaction review and independent browser reconstruction boundary. Contract checks remain authoritative at execution.

## Confirmed state-accuracy defect

Before correction, either `/chain/status` or mandate-detail refresh failure left prior finalized balances and enabled controls visible. Two Playwright regression cases reproduced this on the previous frontend (2 failed). M8 marks the observation non-current and disables signing/preparation at refresh start, restores availability only after matching successful responses, hides stale balances/attestations and retains unresolved history with an explicit stale label. Prepared operations are not deleted or automatically retried. Late failures from a prior mandate cannot replace current state. Server-side authorization was not bypassed; this was misleading financial-state presentation, not a demonstrated unauthorized transfer.

## Amounts, files and provenance

Proposal and independent-verifier amount inputs accept NEAR decimal strings and use existing checked `nearToAtomic`; displays use `atomicToNear`. No Number conversion, rounding, scientific notation or float token arithmetic. Existing upper-bound/invalid-value tests remain mandatory. Raw proposal values are inspectable in technical details.

Shared local file hashing accepts bounded PDF/plain text/JSON/PNG/JPEG, hashes exact bytes without parsing/normalizing, and never uploads or fetches a URL. Selecting a replacement clears the old digest before hashing. This calculates integrity only. A verifier must independently retrieve authenticated source bytes, identify source/reference/recipient/amount and explicitly assert independence. Agent file selection never supplies that assertion. Existing manual digest entry remains for independently calculated hashes.

Removed blanket deployment/chain-submission claims from proposal history and the evidence handoff. These pages now link to verified settlement instead of treating an offchain component's `NOT_SUBMITTED` marker as global chain truth.

## Acceptance and non-goals

S01–S20 traceability is in M8_TEST_MATRIX. Automated API/RPC/browser fixtures, actual PostgreSQL and local sandbox have separate evidence labels. No human or public-chain result is inferred from them. Historical M1/M2 desktop/Android confirmations retain only their original scope; integrated M1–M7 desktop/physical Android and genuine human-source/verifier signing remain pending. iOS deferred. Self-review is not independent security review.

Public Testnet deployment and transaction portions stop at [M8_DEPLOYMENT_AUTHORIZATION](../deployment/M8_DEPLOYMENT_AUTHORIZATION.md). Retained FullAccess risk remains explicit. No contract changes, migration, factory, signing keys, paid services or public exposure are introduced.

Registration exposes the already-supported optional guardian account, defaulting to none. The owner sees its pause-only meaning before preparing; exact account remains in signed transaction arguments and the independent browser/server builders. No guardian selection can grant owner powers. A regression confirms the selected account/atomic storage ceiling and rejects a tampered prepared response before wallet access.
