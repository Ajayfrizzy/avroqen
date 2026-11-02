# M6 implementation and verification report

Status: local verification passed; hosted checks tracked on draft PR #10; **not live-Testnet accepted**. Branch `feat/m6-testnet-settlement`, based on confirmed M5 merge `d03733efcf038549d55d07fb097946323db32cde`. No main/staging merge, public deployment, public-chain privileged account/key creation, token transfer or personal expenditure has occurred.

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

- `pnpm check`: lint, TypeScript, integration and adversarial checks passed. Final unit rerun: **136 unit tests passed**; **18 integration + 13 adversarial tests passed**. Together with PostgreSQL, this is **313 application/API/SQL tests**.
- `pnpm test:identity-db`: **146 real PostgreSQL tests passed**, using isolated schemas; application records not used as fixtures.
- `pnpm build`: optimized Next.js build and TypeScript checks passed.
- `pnpm test:e2e`: **51 Chromium tests passed**, including narrow-screen settlement states. Browser fixture tests do not prove real wallet/testnet execution.
- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, release Wasm build and Wasm method/capability check passed.
- `cargo test --workspace --locked -- --nocapture`: **33 Rust unit tests + 7 real local sandbox tests passed**. Existing authority, replay, quorum, dispute, accounting, concurrent reservations, failed/missing callbacks, storage insolvency and withdrawals remain covered.
- New actual sandbox-to-TypeScript integration verified **CONFIRMED_SUCCESS (6 finalized receipts)** with recipient balance delta, and **CONFIRMED_FAILED (7 finalized receipts)** with restored availability and zero spent. These are local synthetic-ledger transactions, not public testnet payments.
- Measured release Wasm: 366,735 bytes, SHA-256 `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`.
- Secret scan and pinned workflow validator passed; no credential material is included in intent/audit evidence. Local Compose build, additive migration, non-root/no-credential-image checks, database connectivity, smoke readiness and trusted HTTPS cookie/origin checks passed. Hosted CI is tracked in draft PR #10’s Checks tab; local results are not a substitute for exact-head hosted results.

## Deployment decisions and remaining acceptance

Owner selected `avroqen-vault.testnet` and explicitly accepted retaining an owner-controlled deployment full-access key for the small hackathon demo, including code-replacement/direct-transfer risks. Read-only finalized public testnet lookup returned `UNKNOWN_ACCOUNT`; ownership, keys and available backing are unverified. Account creation/funding/deployment and all actual transactions still require separate explicit authorization. See M6_TESTNET_RUNBOOK.md for measured local storage costs and proposed small caps.

Trusted-RPC verification is not a light-client consensus proof or independent multi-provider agreement. Historical pruning, missing receipt bodies and conflicting observations can prevent reconciliation; obligations remain quarantined. A permanently failed callback cannot be repaired by the worker. Retained deployment keys can replace code between checks. A canceled transaction prompt without conclusive broadcast evidence remains UNKNOWN; there is no unsafe timeout unlock. Unsigned prepared intents can be resumed but currently have no discard workflow.

No M6 real-wallet transaction, live deployment, genuine independent-source payment, physical Android transaction flow or public explorer proof has been accepted. These remain separately authorized integrated M8 acceptance; iOS remains deferred. Existing M1/M2 manual results retain their documented scope and do not prove M6 behavior. RumptyCloud provider-specific HTTPS/private-network/CA/quotas and temporary-hosting authorization remain prerequisites. Independent security review remains a separate pending assurance activity, not a claimed audit or blanket hackathon merge prerequisite.

M6 must not be represented as ready to transact until the account/deployment package is approved, actual artifact/key/domain verification succeeds, and controlled live acceptance is performed. Draft PR and exact-head CI results will determine code-review readiness, not financial execution authorization.

Final local recovery evidence: stopping PostgreSQL caused both API and worker readiness to return unavailable while their liveness remained available. Restarting PostgreSQL restored both health checks and the web/API/database smoke test. Retained application counts after migration/recovery: 2 organizations, 4 registered agents, 7 mandates, 3 proposals, 0 evidence reviews, 0 chain intents. Existing PostgreSQL volume and local HTTPS certificate setup were preserved.

Draft review PR: https://github.com/Ajayfrizzy/avroqen/pull/10 (target `staging`; no merge authorization). Hosted checks must pass on the final feature head.
