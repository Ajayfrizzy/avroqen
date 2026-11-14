# M6 implementation and verification report

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

Status: local verification passed; hosted checks tracked on draft PR #10; **not live-Testnet accepted**. Branch `feat/m6-testnet-settlement`, based on confirmed M5 merge `d03733efcf038549d55d07fb097946323db32cde`. This implementation/review performed no main/staging merge, public deployment, public-chain account/key creation, token transfer or personal expenditure. The owner separately reports creating the target account.

## Implementation inventory

- Strict typed allowlisted wallet operations for owner storage credit, exact mandate registration, mandate funding, agent proposal, designated MAP-1 verifier/owner attestation, owner-only execution, pause/resume/revoke, available-fund withdrawal and unused-storage withdrawal.
- Immutable M2 policy/digest → M4 proposal → signed M5 review → exact FunctionCall bindings. Synthetic reviews are rejected. Original owner active role and agent/session/tenant/origin/CSRF checks remain server-side; wallet identity/network are checked again before transaction prompting.
- Fail-closed deployment manifest: actual testnet chain, finalized bytecode/hash, public-key/permission fingerprints and contract domain. No signer or broadcast RPC exists in backend/worker.
- Migration 005: durable immutable intents, unresolved wallet/vault uniqueness, idempotency, append-only transitions, leased read-only worker, scan anchors, verified hashes/receipts and monotonic finalized observations. Missing/ambiguous hashes and RPC outages remain UNKNOWN; no automatic financial retry.
- Exact transaction/receipt graph verification, private callback dependency/result binding, transfer amount/recipient binding and matching contract execution/withdrawal state. Current and historical receipt-block deployment checks are required. A root promise-return success alone is insufficient.
- Responsive settlement workspace: assigned mandates, readable NEAR amounts, expandable exact units/arguments, policy/recipient/quorum/owner-approval display, wallet review, pending-state polling, real verified-hash explorer links, exact balance snapshots and explicit unknown/unavailable states.
- Independent non-root worker service with internal-only health/readiness. Database-outage readiness fails while liveness remains available. Managed database configuration supports only fully verified TLS or explicit local no-TLS; no certificate-validation bypass. Next.js private API URL is a build argument.
- Deployment authorization/budget/runbook and managed RumptyCloud preparation are documented; neither has been executed.

## Confirmed defects resolved during implementation

1. Real sandbox receipts exposed an incorrect immediate-success assumption. M3 returns its callback promise. The verifier now follows the exact `SuccessReceiptId`, verifies finalized transfer plus callback result and matching contract state. Successful payment and confirmed transfer failure are both exercised against actual local sandbox receipts.
2. Initial M6 membership lookup did not filter disabled memberships. It now requires active status and locks authorization rows, with a regression proving disabled membership cannot prepare or begin owner operations.
3. A late response after switching mandates could display the previous mandate’s chain state. A request-generation guard and policy identity checks now discard stale responses; the browser regression passes.
4. The browser now independently reconstructs exact policy/proposal/review-bound transactions at preparation and again before prompting, rejecting a substituted receiver or altered arguments rather than trusting a prepared API response. The tampered-response browser regression passes.
5. Reconciliation initially depended on the new-submission enable flag. The worker now continues reading and reconciling retained intents when new submissions are disabled.

No Rust contract behavior or financial invariant was changed. This is agent self-review, not independent security assessment.

## Automated evidence

- `pnpm check`: lint, TypeScript, integration and adversarial checks passed. Final unit rerun: **139 unit tests passed**; **18 integration + 13 adversarial tests passed**. Together with PostgreSQL, this is **317 application/API/SQL tests**.
- `pnpm test:identity-db`: **147 real PostgreSQL tests passed**, using isolated schemas; application records not used as fixtures.
- `pnpm build`: optimized Next.js build and TypeScript checks passed.
- `pnpm test:e2e`: **51 Chromium tests passed**, including narrow-screen settlement states. Browser fixture tests do not prove real wallet/testnet execution.
- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, release Wasm build and Wasm method/capability check passed.
- `cargo test --workspace --locked -- --nocapture`: **33 Rust unit tests + 7 real local sandbox tests passed**. Existing authority, replay, quorum, dispute, accounting, concurrent reservations, failed/missing callbacks, storage insolvency and withdrawals remain covered.
- New actual sandbox-to-TypeScript integration verified **CONFIRMED_SUCCESS (6 finalized receipts)** with recipient balance delta, and **CONFIRMED_FAILED (7 finalized receipts)** with restored availability and zero spent. These are local synthetic-ledger transactions, not public testnet payments.
- Measured release Wasm: 366,735 bytes, SHA-256 `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`.
- Secret scan and pinned workflow validator passed; no credential material is included in intent/audit evidence. Local Compose build, additive migration, non-root/no-credential-image checks, database connectivity, smoke readiness and trusted HTTPS cookie/origin checks passed. Hosted CI is tracked in draft PR #10’s Checks tab; local results are not a substitute for exact-head hosted results.

## Deployment decisions and remaining acceptance

Owner selected `avroqen-vault.testnet` and explicitly accepted retaining an owner-controlled deployment full-access key for the small hackathon demo, including code-replacement/direct-transfer risks. The earlier UNKNOWN_ACCOUNT lookup is superseded by the finalized observation below. Owner custody is asserted by the owner; RPC account/key state is verified read-only. Funding/deployment and all actual transactions still require separate explicit authorization. See ../M6_TESTNET_RUNBOOK.md for measured local storage costs and proposed small caps.

Trusted-RPC verification is not a light-client consensus proof or independent multi-provider agreement. Historical pruning, missing receipt bodies and conflicting observations can prevent reconciliation; obligations remain quarantined. A permanently failed callback cannot be repaired by the worker. Retained deployment keys can replace code between checks. A canceled transaction prompt without conclusive broadcast evidence remains UNKNOWN; there is no unsafe timeout unlock. Unsigned prepared intents can be resumed but currently have no discard workflow.

No M6 real-wallet transaction, live deployment, genuine independent-source payment, physical Android transaction flow or public explorer proof has been accepted. These remain separately authorized integrated M8 acceptance; iOS remains deferred. Existing M1/M2 manual results retain their documented scope and do not prove M6 behavior. RumptyCloud provider-specific HTTPS/private-network/CA/quotas and temporary-hosting authorization remain prerequisites. Independent security review remains a separate pending assurance activity, not a claimed audit or blanket hackathon merge prerequisite.

M6 must not be represented as ready to transact until the account/deployment package is approved, actual artifact/key/domain verification succeeds, and controlled live acceptance is performed. Draft PR and exact-head CI results will determine code-review readiness, not financial execution authorization.

Final local recovery evidence: stopping PostgreSQL caused both API and worker readiness to return unavailable while their liveness remained available. Restarting PostgreSQL restored both health checks and the web/API/database smoke test. Retained application counts after migration/recovery: 2 organizations, 4 registered agents, 7 mandates, 3 proposals, 0 evidence reviews, 0 chain intents. Existing PostgreSQL volume and local HTTPS certificate setup were preserved.

Draft review PR: https://github.com/Ajayfrizzy/avroqen/pull/10 (target `staging`; no merge authorization). Hosted checks must pass on the final feature head.

## Final M6 financial-security review — 2026-11-02

This is agent self-review, not an independent audit. One additional confirmed defect was fixed: an identical transaction included before a new intent's creation anchor could be promoted as that intent's verified hash. Two reproducing unit cases initially failed (returned FINALIZING with a verified hash instead of UNKNOWN). Inclusion must now be strictly after the immutable finalized anchor, and the canonical anchor hash must match before promotion. Three new unit cases cover before/equal-anchor rejection and anchor substitution. A new real PostgreSQL regression proves historical finalized success leaves UNKNOWN, no verified hash, and the next preparation blocked with 409. Existing positive final success/failure fixtures now model inclusion after preparation. No Rust financial behavior, authority, database schema or wallet permission was changed.

| Boundary reviewed | Evidence / assessment |
| --- | --- |
| Wallet signer/network and immutable arguments | transaction-wallet.ts, typed operation builder, API prepare/begin rebuild, existing tampered-response browser tests; exact account/Testnet and one allowlisted FunctionCall; no key custody |
| Receipt attribution/finality | reconcile.ts and receipts.ts; new historical replay regression plus complete graph, historical code/key/domain checks, native transfer/callback/state bindings |
| Callback/accounting | actual Rust source, 33 unit and 7 sandbox tests; private one-result callbacks, checked conservation, reserve-before-dispatch, execution caps, terminal definitive failure |
| Unknown outcomes | missing callback sandbox and worker tests; funds/withdrawal obligations remain reserved, no timeout release or broadcast retry |
| Worker concurrency/persistence | SKIP LOCKED lease, row/lease/hash recheck, immutable intent and terminal SQL guards, atomic event writes; real PostgreSQL tests |
| Tenant/role/credential boundaries | server-side scoped policy/membership locks and active role checks; browser memory-only connector, no worker signer; database/adversarial/browser regressions |
| Deployment/initialization | M3 direct vault-account initialization, measured storage/reserve solvency; retained FullAccess risk expressly disclosed, not corrected through unapproved key deletion |

No additional confirmed blocking defect was identified in this focused review. Trusted-RPC dependence, retained deployment-key authority and missing live-wallet evidence remain limitations, not claims of production safety. Identical out-of-band transactions included after preparation are not cryptographically bound to an application intent ID; callers must not submit duplicates outside the app. Ambiguous scanned matches and unknown results remain quarantined. See ../../runbooks/financial/RECONCILIATION.md.

### Public Testnet account and measured recommendation

At **2026-11-02 21:26:01 UTC / 22:26:01 Africa/Lagos**, finalized Testnet height **275954911**, hash **3cEVcND99HGRMm1p2YMUhkC6GmwGbVfYFFxoaM34iBbo**, RPC returned:
- `avroqen-vault.testnet` exists, amount **4500000000000000000000000 yoctoNEAR (4.5 NEAR)**, locked 0, storage 182 bytes.
- No deployed code (zero code hash); one FullAccess Ed25519 public key. Public evidence, permission fingerprint and safe optional owner NEP-413 proof are in ../../VAULT_GOVERNANCE.md and docs/evidence/M6_TESTNET_ACCOUNT_2026-11-02.json.
- Protocol v88, storage price **10^19 yoctoNEAR/byte**, gas price **10^8 yoctoNEAR/gas**, all account/key observations pinned to the finalized block. No transaction was sent.

Rebuilt Wasm remains 366,735 bytes with the SHA-256 above. This review reran sandbox and measured base initialized storage **367,086 bytes** and full exercise storage **375,976 bytes**. A conservative Testnet deployment estimate is **3.67268 NEAR storage + 0.1 reserve + proposed 0.1 aggregate gas envelope = 3.87268 NEAR**. Maintain the observed **4.5 NEAR** backing with **0.62732 NEAR** estimated headroom; no additional funding recommended now. Revalidate before authorization. The separate proposed **0.2 owner storage credit**, **0.003 mandate budget**, **0.001 payment** and signer gas responsibilities require their own approval; none is approved or spent. Precise assumptions and gas calculation are in ../M6_TESTNET_RUNBOOK.md.

../../VAULT_GOVERNANCE.md, ../../ARCHITECTURE.md and D019 distinguish the accepted mutable low-value demo from the **unimplemented** production direction: verified versioned factory, separately owned vaults, no platform master withdrawal/full-access/upgrade authority, explicit cost/provenance, and separately reviewed migration/recovery. M3 direct initialization cannot simply be called by a factory; no custody redesign was implemented.

### Verification in this review

Passed: lint, typechecks, optimized build; **139 unit + 18 integration + 13 adversarial + 147 real PostgreSQL = 317 tests**; **51 Chromium browser tests**; Rust format/Clippy, release Wasm capability check, **33 Rust unit + 7 actual sandbox tests**. Sandbox again verified successful payment (6 finalized receipts) and confirmed failed payment (7 finalized receipts). This is local sandbox evidence only. Secret scan/workflow checks are rerun after final document edits. Hosted exact-head results are recorded on PR #10 after push; earlier-head green checks do not validate this correction.

Separate live authorization must name artifact hash, current key fingerprints/control, atomic deploy/init, exact funding/storage/gas caps, participating accounts and retained-key risk. Fresh finalized rechecks and actual deployment/domain/receipt verification are mandatory before enabling submissions. Genuine Testnet settlement, integrated human wallet/verifier/Android acceptance and independent review remain pending; iOS deferred. No public-chain transaction or production readiness is claimed.

Final container verification also passed after rebuilding the corrected worker and restoring the web service with the HTTPS Compose override: non-root/image credential exclusion, PostgreSQL connectivity, web/API/database readiness and CA-verified HTTPS with Secure/HttpOnly/SameSite/host-only challenge cookies and wrong-origin rejection. Existing database volume and certificate setup were retained. Final secret scan found no leaks; pinned workflow validation and diff whitespace checks passed.
