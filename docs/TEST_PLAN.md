# Security and acceptance test plan

## Levels
T1 Rust unit tests: checks, arithmetic, permissions. T2 NEAR Workspaces sandbox integration: transactions, attached deposits, callback results, multiple callers. T3 testnet E2E: real account authorization, funds movement and receipt. T4 backend/integration/security: real API/agent/reconciliation. T5 adversarial agent prompts, malicious tool outputs, corrupt DB/worker restarts. No claim of complete audit.

## Required cases
| ID | Scenario | Required result |
|---|---|---|
| S01 | Authorized amount/recipient with valid claim | Exactly one successful transfer and accurate accounting |
| S02 | Oversized proposal | Rejected, no change to protected balances |
| S03 | Wrong recipient or asset | Rejected |
| S04 | Agent modifies mandate/owner/verifier | Rejected at contract boundary |
| S05 | Split transactions exceed cumulative cap | Excess rejected |
| S06 | Concurrent proposals race for budget | At most available allocation reserved |
| S07 | Reused proposal/execution ID | No second transfer |
| S08 | Reused or expired attestation | Rejected |
| S09 | Fake signer, wrong proposal/amount/hash | Rejected |
| S10 | AI-generated fake delivery, prompt injection | No independently authorized claim |
| S11 | Owner revokes or pauses | No new reservations post-inclusion |
| S12 | Callback spoofing | Rejected / state unchanged |
| S13 | Outbound payment fails | Reconcile, no phantom spend or leak |
| S14 | RPC/worker disappears after broadcast | Pending/unknown; never blind retry |
| S15 | Owner withdraws reserved funds | Rejected |
| S16 | Platform admin attempts transfer | Rejected |
| S17 | Agent key compromised | Cannot exceed bounded authority |
| S18 | Verifier compromised | Confirm scope, containment and revocation behavior |
| S19 | No gas/storage reserve | Safe failure before risking allocation |
| S20 | Crash/restart/indexer replay | Correct replayed projections, no double effect |

## Invariant/property checks
Every reachable state: no negative funds; `spent + reserved <= total_budget`; no unauthorized recipient receipt; count of active/pending/succeeded attempts respects execution limit; pending funds never withdrawable; sum of liabilities consistent with contract assets accounting for gas/storage/reserves; one authorized execution ID maps to no more than one successful payment.

## Release gates
All mandatory CI checks pass; sandbox tests demonstrate onchain behavior; network-specific testnet receipts recorded; threat-model assumptions documented; external secrets scan clean; independent manual review of critical code changes. Explicit owner approval before mainnet deployment or funding.
