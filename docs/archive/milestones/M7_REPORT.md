# M7 security monitoring and emergency response report

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

Branch: feat/m7-security-monitoring. M6 PR #10 was verified MERGED into staging at a8972893beae3fd5990c8ddb6ef085a043b0b2a4; staging fast-forwarded and this feature branch created from that commit. Main was not modified. This is agent implementation/self-review, not an independent audit. No public deployment, signing, transfers, key changes, paid services or repository-visibility change occurred.

## Implemented

- Migration 006: durable normalized source events, rule hits, evidence references, alerts, versioned incident state and append-only history, health records and server-only observations. Identity audit rows become append-only. SQL checks bind mandate/org scope and prevent alert identity changes, decreasing counts, terminal reopening or record deletion.
- Six trusted source adapters: identity audit, agent events, mandate consent events, evidence/review events, chain reconciliation events and internal sanitized observations. Unique source IDs are durable processed checkpoints; no client ingestion endpoint or arbitrary JSON payload storage exists.
- Explainable fixed-window rules for repeated authentication/proposal/transaction denial, amount/recipient/policy rejection, revoked/disabled capability activity, verifier mismatch/dispute, deployment key/code/domain mismatch, inconsistent/missing/stale receipts, delayed outcomes, worker health and gas/backing conditions. Thresholds are documented indicators, not proof of attack.
- Read-only NEAR probes and distinct sanitized reconciliation failure codes preserve M6 UNKNOWN quarantine. The worker has independent reconciliation/monitoring loops and pools, durable heartbeat, batch/statement/lock bounds and transactionally committed source progress. No financial scheduler, signer or broadcast client was added.
- Tenant-scoped security APIs with live membership/session, origin/CSRF, rate limits, safe errors, optimistic concurrency, self-assignment and mandatory resolution reasons. Incident mutation changes no financial table. Read-only global operational summary: pnpm security:status, available only to the local DB operator, not an admin web endpoint.
- Responsive /workspace/security dashboard: severity/health overview, incident evidence/history, loading/empty/offline/retry/read-only states, reduced-motion focus, safe emergency navigation and explicit confirmation for application access removal. Existing disable and original-owner capability-revoke APIs enforce their own authorization.
- Existing M6 wallet review supports verified guardian PAUSE for active org members, with finalized code/key/domain/exact-policy/guardian recheck before prompt. Owner-only resume/revoke retained. No Rust contract/custody/accounting changes. A guardian without app membership retains only its existing direct contract authority, not inferred tenant access.
- Incident and integrated-demo runbook, security design, API/architecture/test/operations decisions, managed worker deployment notes. M8 retains real wallet/Android/provider acceptance; no repetitive owner walkthrough requested.

## Focused security review and corrections

1. A new disabled-agent regression exposed duplicate alerts from legacy unscoped access audit and the structured scoped denial. Preserve both source rows, but derive the actionable denial alert only from the structured observation; auth failures count once from their audit source. The real agent API tests now verify exact tenant/mandate scope and absence of bearer values.
2. Review found monitoring manifest parsing at worker startup could stop reconciliation on invalid monitor config. Moved parsing inside the isolated monitoring loop. The container isolation regression starts an extra worker with deliberately invalid manifest and requires its reconciliation/readiness to remain live; this is also added to hosted foundation CI.
3. Delay detection measures a recorded wallet-attempt event, not unsigned intent creation time. It never releases unresolved locks. Guardian authorization is rechecked before prompting; changing guardian state denies begin. Missing deployment evidence fails closed.
4. Review caught guardian RPC under authorization locks. The lookup now releases SQL locks before RPC, then rechecks live session/membership and immutable bindings. A real database regression disables guardian membership during RPC and requires 403 with no new intent; it also fails if the RPC holds the membership lock.
5. UI never reports incident dismissal, disabled agent, revoked bearer or canceled wallet prompt as onchain pause/revoke. Existing M6 exact-operation reconstruction and UNKNOWN handling are reused. No evidence text is passed to an LLM or used as instructions; explanations are fixed source-controlled strings and React text rendering.

## Automated verification

Current application results: lint/typechecks and optimized Next.js build passed; **160 unit + 19 integration + 13 adversarial + 175 real PostgreSQL = 367 application/API/SQL tests passed**. **58 Chromium browser tests passed**, including seven new desktop/narrow-screen incident scenarios. Browser fixtures and emulated viewports do not prove physical Android or wallet acceptance.

Rust format, Clippy, release Wasm build and capability inspection passed. **33 Rust unit + 7 actual local NEAR sandbox tests passed**. Existing sandbox scenarios cover distinct guardian/owner/agent/verifier authority, pause/revoke, budget/execution races, private callbacks, insolvency and unknown quarantine. The sandbox-to-TypeScript verifier again confirmed six-receipt success and seven-receipt definitive failure. All such transactions are local sandbox evidence, not public Testnet results.

Initial database run failed because local PostgreSQL was stopped (147 tests skipped, not passed); starting the retained service resolved the environment issue. One new duplicate-alert test initially failed and passed after the correction above. A subsequent non-escalated TLS integration rerun hit the sandbox loopback EPERM restriction; the permitted rerun is recorded separately. No security assertion was removed or bypassed. Container, outage/recovery, HTTPS and final hosted results are recorded below after execution.

## Limitations and acceptance boundaries

- Dashboard notification only: no email/push delivery or assertion that an owner was contacted. Unscoped authentication/health alerts stay operator-only; no tenant may inspect other tenants through an administrator role.
- Source authenticity depends on the application database boundary; a superuser can bypass triggers. No cryptographic tamper-proof log claim. Retention/archive and larger-scale operational deployment need separate review.
- Fixed five-minute windows can miss threshold splitting; batch backlog delays detection. Probe fanout is capped at 100 organizations plus a global event; per-intent reconciliation remains independent. One-minute heartbeat warnings can fire during a long scan. Database/process outages require external health observation; no claim of always-available alert delivery.
- Trusted RPC, pruning/missing receipt bodies and retained deployment-key powers remain M6 risks. Advisory storage/gas warnings do not prove a transfer will fit and never fund an account. Unknown obligations remain reserved indefinitely; incident resolution cannot repair a callback.
- No new custody or guardian authority decision remains unresolved. Dedicated avroqen-vault.testnet and retained owner-controlled FullAccess governance remain as documented in ../../VAULT_GOVERNANCE.md, not immutable/fully noncustodial deployment.
- Genuine public Testnet payment/pause/receipt, independent-source/verifier signing and complete desktop/physical Android testing remain pending integrated M8 and separate transaction authorization. iOS deferred. Independent review remains separately pending; this self-review is not an audit or production approval.

Hackathon integration readiness requires green foundation/rust on the final feature head and no confirmed blocking defect. Draft PR must target staging; no merge authorization is implied.

Local review verification: the permitted full rerun passed all 367 application/API/SQL tests, lint/typechecks/build, final secret scan (no leaks) and pinned workflow validation. The new guardian authorization race passed with no SQL lock held during RPC and no intent created after membership revocation. Release Wasm/contract behavior remains unchanged. The local HTTPS container stack passed non-root/credential-image isolation, database connectivity, readiness and trusted TLS/host-only Secure/HttpOnly/SameSite challenge-cookie/origin checks. Final-image outage/recovery results follow below.

Final-image operational checks passed: rebuilt HTTPS Compose stack, non-root/no-local-credential image checks, malformed-monitor-config isolation regression, trusted TLS and cookie/origin checks. During an actual local PostgreSQL stop, API and worker readiness returned unavailable while liveness remained available. Restart restored both services and both monitoring/reconciliation heartbeats; database connectivity and smoke tests passed. The retained PostgreSQL volume/certificates were preserved. Global operational alerts may include genuine local test observations (historical auth denials, startup/outage heartbeats and intentionally invalid test-worker configuration); these are development evidence, not claims of attacks or public-chain incidents. Final secret scan found no leaks; workflow and diff checks passed.

All local mandatory gates passed with no confirmed unresolved blocking defect from this focused review. Hosted foundation/rust must still pass on the committed head before hackathon integration review. Draft PR and exact-head workflow evidence are maintained in the PR description; no merge or live-transaction authorization is implied.
