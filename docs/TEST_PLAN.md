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

## Integrated acceptance schedule — D017

M5 automated unit, database, browser and sandbox gates remain mandatory. Preserve
the implementation; its unperformed real-wallet and authentic independent-source
cases are **pending integrated M8 tests**, not waived, passed or a reason to repeat
standalone milestone walkthroughs now. Continue M6/M7 implementation with applicable
automated regression/CI gates. Reuse earlier confirmed manual evidence only for its
original scope; the completed product still needs the M8 end-to-end run.

| Integrated case | M8 evidence required | Current status |
| --- | --- | --- |
| I01 — Identity through consent | Real desktop/physical Android login, cancel/retry, logout, organization isolation, immutable mandate approval/revocation; M1–M2 regression evidence | Pending integrated run |
| I02 — Proposal through evidence | Restricted M4 agent proposes; human independently obtains authentic source, safe exact-byte hash calculation, readable amounts and exact policy review | Pending; synthetic source cannot pass |
| I03 — Genuine verifier and owner approvals | Designated verifier signs fresh M5 offchain review and separate authorized onchain attestation; distinct per-claim quorum; separate owner payment approval; wrong-account/replay/source mismatch denial | Pending integrated real-wallet/source tests |
| I04 — Actual settlement and recovery | M3/M6 exact network/vault/proposal/receipt bindings, authorized testnet payment, accounting, restart/indexer replay, RPC loss and unknown quarantine (S01–S20) | Pending authorized testnet run |
| I05 — Emergency response | M7 alerts and safe incident UI; owner/guardian scope, pause/revoke inclusion, reserved withdrawal rejection and already-dispatched reconciliation | Pending integrated run |
| I06 — Complete UX and privacy | Desktop and physical Android; trusted HTTPS, Secure/HttpOnly/host-only cookies, Origin/CSRF, loading/cancellation/error/empty states, accessible focus/reduced motion, no secrets in evidence | Pending integrated run; iOS deferred |

M6 implements real Testnet orchestration/receipt verification before M8 acceptance;
M7 completes monitoring/emergency controls. M8 runs the full chain across M1–M7,
not merely independent component screenshots. Tests involving public-network
deployment/funding/transfers need explicit owner authorization; this schedule does
not grant it. Preserve unknown outcomes and never deliberately bypass safety gates
to produce a demonstration.

Record automated, human wallet/device, authentic source, public testnet receipt and
independent-review evidence separately with commit/network/date and safe references.
A digest or signed human claim does not itself prove truth. Existing B2 human trust
limitations remain. Do not collect keys, auth tokens, signatures or sensitive source
files in test reports. Viewport emulation cannot pass physical Android acceptance.

M9 must demonstrate the accepted journey on temporary RumptyCloud hosting using
genuine NEAR Testnet transactions and verified receipts. Validate zero-cost hosting,
trusted HTTPS/origin, private database/secrets and teardown before authorized launch.
Synthetic evidence, sandbox transfers and mocked payments cannot pass this demo
gate. Keep fixture regressions in CI and label them accurately.

## Hackathon integration gate

PR #9 may integrate with green required foundation/rust on its exact head, resolved
blocking review findings and no confirmed blocking defects. Pending M8 manual
acceptance does not block that development merge under D017. Retain draft status
until owner-directed review transition; final merge requires owner authorization.
This is not full-product release acceptance or production security approval.

## Full-product release gates
All mandatory CI checks pass; sandbox tests demonstrate onchain behavior; network-specific testnet receipts recorded; threat-model assumptions documented; external secrets scan clean; independent manual review of critical code changes. Explicit owner approval before mainnet deployment or funding.
