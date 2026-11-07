# M8 integrated acceptance report

**Date:** 2026-11-03 Africa/Lagos. **Branch:** `feat/m8-integrated-acceptance`, from merged M7 `646b5b23798714637be7aa72ff65ccb77971ae76`, synchronized with origin/staging before branching. No main/staging modification. M8 automated implementation is prepared for review; **full live M8 acceptance is not complete**.

## Implemented inventory

- Assignment-scoped `/workspace/journey` and responsive shared navigation connect the M1–M7 roles/actions, policy ceilings, observed funding/mandate state, offchain proposals, independent claims, distinct owner approval, settlement and incidents. No new API/role/custody authority.
- Proposal/verifier decimal NEAR entry uses checked string/BigInt conversion; readable displays, inspectable exact terms, common bounded local-byte hashing without upload or source-authenticity inference.
- Corrected blanket “not deployed/not submitted” claims and evidence handoff; context links lead to verified settlement. Human-readable advisory/outcome labels retain technical details.
- Settlement refresh failure invalidates visible financial state and disables prepare/sign while preserving durable uncertainty/history. Optional guardian input uses the existing exact registration argument, with explicit pause-only scope and no new power.
- Fresh finalized read-only account/keys/protocol/gas observation script and public evidence; exact deployment artifact/transaction/funding package; coordinated desktop/physical Android runbook; twenty-case traceability matrix. Architecture and D021 record trust boundaries.

## Confirmed findings and resolution

1. **Stale financial presentation after RPC/API outage:** two new browser tests failed before correction (both status and detail refresh; old balance still visible). Corrected refresh validity and action gating. Recovery tests pass; old unresolved records remain warnings, never retried. No demonstrated unauthorized transfer or contract/authorization bypass.
2. **Misleading offchain-global chain claims:** proposal history and evidence page hardcoded global deployment/submission statements. Replaced with explicit unknown scope and verified-chain handoff. An offchain record is not chain truth.
3. **Unnecessary amount/hash complexity:** decimal NEAR conversion and bounded exact-byte local hashing remove raw-unit/manual-hash work. Integrity remains distinct from independent provenance; no evidence auto-approval.

Focused self-review covered transaction signer/network/immutable args, API/browser independent reconstruction, FullAccess credential exclusion, original-owner/agent/verifier/guardian boundaries, exact accounting and private callback idempotency, receipt graph attribution, historical receipt replay, unknown quarantine, SQL leases/atomic audit writes, tenant isolation, monitoring advisory scope and UI state accuracy. Relevant M1–M7 implementations and adversarial tests were reviewed; no additional confirmed critical/high financial defect identified. **This is not an independent audit or proof of absence of vulnerabilities.** No Rust/contract/schema/dependency/security-policy changes.

## Actual local verification

| Command/check | Result |
|---|---|
| `pnpm check` | PASS lint/typechecks; **162 unit + 19 integration + 13 adversarial** |
| `pnpm test:identity-db` | PASS **175** actual PostgreSQL tests in isolated schemas; real SQL auth/nonce/role/tenant/intent/event/recovery invariants, controlled RPC identities |
| `pnpm build` | PASS optimized Next.js build plus TypeScript; includes journey route |
| `pnpm test:e2e` | PASS **67 Chromium** tests, including desktop/narrow viewport/reduced motion; not physical Android or real wallets |
| `cargo fmt --all -- --check` / Clippy all targets `-D warnings` | PASS |
| release Wasm build + `pnpm test:wasm` | PASS; exact allowlist, no new administrative capability; hash unchanged |
| `cargo test --workspace --locked -- --nocapture` | PASS **33 Rust unit + 7 actual local NEAR sandbox**; 0 failed. Sandbox successful/failed payment receipt verification, native recipient deltas, concurrency/reserve, callback loss, storage insolvency, distinct roles and MAP-1 |
| `pnpm test:workflow` / `pnpm test:secrets` | PASS pinned CI structure; Gitleaks reports no leaks |
| Container/worker/private HTTPS/outage recovery | PASS rebuilt non-root web/API/worker images exclude .env/.git/.local; PostgreSQL connectivity and smoke; malformed monitoring configuration leaves reconciliation alive; DB outage returns API/worker 503 readiness and 200 liveness, then recovers; CA-verified HTTPS origin/host-only Secure/HttpOnly/SameSite challenge cookie and wrong-origin rejection |

Total application checks: **369** (162+19+13+175), plus **67** browser and **40** Rust/sandbox = **476 tests**, with distinct coverage levels. Sandbox measurements again: initialized storage **367086 bytes**, full exercise **375976 bytes**. Actual local sandbox receipt verifier checked 6 successful-payment and 7 failed-payment receipts. These are not public Testnet transfers. Initial development failures (stale state reproduced, formatting/type errors and new journey error wording) were corrected before these passing results.

[M8_TEST_MATRIX](M8_TEST_MATRIX.md) maps S01–S20 to test names/protected state and live gaps. All twenty have automated coverage; not all twenty have live/physical acceptance. No tests or checks were disabled to make this pass.

## Read-only Testnet observation and deployment recommendation

**November 7, 2026 update:** see the [owner-verified deployment/initialization evidence](DEPLOYMENT_KEY_GATE_REPORT.md#owner-verified-testnet-deployment--november-7-2026). This supersedes historical no-deployment/no-public-transaction statements for deployment only. Integrated financial acceptance remains pending, financial operations remain disabled, both Primary and Testing FullAccess keys remain present, and no independent security audit is claimed.

At **2026-11-02 23:42:56.763 UTC / November 3 00:42:56.763 Lagos**, finalized height **275969229** / hash **37MFWf1Df6UbLekt4kWPWMVyADNXH6JNB8dydudjDfph**, `avroqen-vault.testnet` has **4.5 NEAR**, locked0, storage182, **no code**, one FullAccess key (fingerprint in deployment package). Protocol88, storage10^19 yocto/byte, gas10^8 yocto/gas. These were fresh pinned queries, not reuse of M6 historical evidence. RPC does not prove human custody.

Release artifact **366735 bytes**, SHA-256 **b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48**. Conservative storage+reserve+gas envelope **3.87268 NEAR**, leaving **0.62732 NEAR** headroom at observed4.5. Recommend maintaining4.5; **no additional funding now**. Proposed separate owner storage0.2, mandate ceiling0.15, funding0.003, first payment0.001 and aggregate gas0.1 all require explicit approval. Exact atomic deploy+init/signing identity/cost assumptions and post-deploy checks: [M8_DEPLOYMENT_AUTHORIZATION](M8_DEPLOYMENT_AUTHORIZATION.md). Fresh revalidation is mandatory before signing; no funding or deployment is authorized by this estimate.

## Evidence classes and remaining requirements

- **Confirmed historical human tests:** owner previously reported M1 desktop Meteor login, cancel/retry, logout, org/agent persistence and Android second-wallet access denial; M2 desktop/Android immutable mandate creation, approval, revocation/persistence. These observations are not re-run or expanded into server/chain assertions here.
- **Pending coordinated human session:** integrated desktop and physical Android M1–M7, actual file/source provenance, genuine designated-verifier message/onchain signing and separate owner approval, wallet cancellation/unknown/recovery. iOS deferred, not passed.
- **Pending public Testnet:** explicit artifact/transaction/budget/account approval, chosen deploy transport, atomic deploy/init, verified manifest/code/keys/domain, real registration/funding/proposal/attestation/execution/recipient delta, prohibited action and emergency pause receipts. No public transaction/hash/receipt success exists for M8.
- **Independent review:** not performed. Not an artificial prerequisite to hackathon development integration, but never represented by this self-review; material real-money production requires separate assessment.
- **Residual risk:** retained FullAccess can replace code/direct-transfer/delete outside contract; trusted RPC/SDK and source/verifier honesty; colluding identities; no recovery override for unknown obligations; identical out-of-band transactions can be ambiguous; history is bounded; no offsite disaster restore or physical mobile proof from CI. Monitoring is advisory, not autonomous containment.

Hackathon **development integration** may be considered only after exact-head foundation/rust green and owner review, with no confirmed blocking defect. Full-product demonstration acceptance remains pending genuine evidence and separately authorized transactions. Production approval is not claimed. No merge, public deployment, paid service, key mutation, transaction or visibility change performed.

## Delivery

Draft PR and exact final SHA/hosted workflow are reported in the delivery message and PR check metadata (avoids a self-referential commit hash in this file). Both hosted jobs must pass on the actual pushed head; older milestones' green CI cannot pass M8.

## UI redesign verification addendum — 2026-11-03

The subsequent owner-requested redesign supersedes the UI/test counts above: **166 unit + 19 integration + 13 adversarial + 175 PostgreSQL + 133 browser + 33 Rust unit + 7 sandbox = 546 tests**, all passing locally. Lint/typecheck, production build, Rust format/Clippy and release Wasm allowlist passed. Backend/contracts/security policy remain unchanged; one pinned test-only axe dependency was added. Shared shell, real-data overview and guided forms replace the prototype presentation. [UI_DESIGN_SYSTEM](UI_DESIGN_SYSTEM.md) and [M8_UX_REDESIGN_REPORT](M8_UX_REDESIGN_REPORT.md) document components, 20 inspected synthetic screenshots, accessibility checks and remaining physical/live acceptance. Prior historical manual results do not certify the redesign. No deployment or public transaction occurred.

## Monitoring contention correction — 2026-11-04

Hosted PostgreSQL verification exposed a missing receipt-mismatch alert. The monitor used the single database-wide advisory key `413007`; parallel test suites had isolated schemas but shared that key. Losing the nonblocking lock correctly skipped a cycle, so the test could observe no alert despite the durable chain event. This was not evidence of successful settlement or released obligations.

A deterministic real-PostgreSQL regression holds one actual monitoring transaction immediately after its lock query, then runs workers for the same and a separate event store. Before the fix, the separate store returned zero (expected positive progress). Monitoring now uses a namespaced two-part advisory key derived from the resolved `security_events` relation OID. Different search paths resolving to the same table share a lock; unrelated schemas do not contend. A hash collision would only serialize unrelated stores, never permit concurrent writers to the same store. Same-store skip, exactly-once projection and one alert occurrence remain asserted. No sleeps, retry masking, disabled test parallelism, financial-state changes or weakened receipt checks were introduced.

For a running multi-worker deployment, restart monitoring workers together when adopting the new lock namespace; old and new versions use different advisory keys. No public deployment was performed. This change does not alter reconciliation, session/tenant authorization, settlement or quarantine rules.

Verification results are recorded with the fix PR and exact hosted head; the failing contention regression and subsequent full PostgreSQL runs are actual database execution, not public Testnet evidence.

Local fix verification: `pnpm check` passed lint/typecheck and 166 unit + 19 integration + 13 adversarial tests; `pnpm test:identity-db` passed all 176 tests on three consecutive runs with ordinary file parallelism enabled; production build and Gitleaks passed. The new contention test failed before the code correction and passed afterward. Rust/frontend behavior is unchanged by this fix; exact-head hosted foundation/rust remain required for PR review.
