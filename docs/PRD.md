# Product requirements document — Avroqen v1.0

## 1. Product
Product name **Avroqen** (owner-confirmed). Category: agent financial authorization / payments security infrastructure. Users: business owners, treasury operators, agent builders, independent verifiers, reviewers/auditors. Problem: an AI agent may be able to initiate a spend that passes basic numerical wallet constraints yet violates the business task or relies on agent-fabricated evidence. Avroqen binds financial authority to owner-approved task mandates and controls settlement outside the AI runtime.

## 2. Product principles
1. Agents propose; they do not control the authorization policy or evidence authority.
2. The owner retains control of escrowed funds and consent to mandates; no administrator master withdrawal authority.
3. Machine-readable immutable terms, not natural language alone, determine permitted spending.
4. Required proof is independently evaluated, and contested or unverifiable evidence stops execution or demands explicit human approval.
5. Contract security remains critical even under malicious agents, prompt injection, compromised backend, and concurrent requests.
6. Reversible operational decisions differ from irreversible onchain settlements; be transparent about limitations.
7. Security is risk reduction, not absolute protection; never describe unaudited code as production-safe.

## 3. Personas and jobs-to-be-done
- **Owner/treasury operator:** allocate bounded funds to a task, select verifier(s), observe/revoke permissions, recover unreserved funds.
- **Agent developer/operator:** register agent identities, submit proposals and inspect policy denials; cannot change the policy.
- **Verifier:** assess a claim from independently obtained evidence and submit scoped attestations; cannot transfer funds or set budgets.
- **Auditor/reviewer:** inspect verifiable mandate changes, proposals, attestations, settlement status, and chain tx references without secret keys.

## 4. End-to-end journeys
### J1 — Authorized purchase
Owner connects wallet, funds vault, creates task-specific mandate (asset, exact recipient(s), max per payment, total budget, time window, max execution count, verifier policy). Agent suggests a matching purchase. Independently controlled verifier attests to a defined condition. Vault rechecks all conditions and reserves budget atomically; sends authorized payment; authenticated callback finalizes success and audit read model reflects actual onchain outcome.
### J2 — Forged proof or malicious tool output
Agent supplies fabricated screenshot, fake signature, wrong provider response, or injected instructions. Ingress treats content as untrusted; verifier refuses unsupported claim. Contract rejects unregistered verifier or mismatched mandate/proposal/amount/recipient/expiry. No protected funds move.
### J3 — Compromised agent
Attacker takes agent credential and submits oversized, forbidden recipient, replayed, expired, or rapid concurrent proposals. Contract enforces cumulative ceiling, exact identities, limited executions, expiry and revocation, constraining maximum loss to explicitly authorized exposure (subject to contract vulnerabilities).
### J4 — Pause, revoke, recover
Owner pauses or revokes mandate; new reservations cease immediately after onchain inclusion. Already dispatched transfers may settle; unreserved balances remain owner-withdrawable. Pending transfers cannot be treated as withdrawable.
### J5 — Indeterminate settlement
RPC/worker outage does not make submitted transfer 'succeeded' or 'failed'. Contract state and chain receipt are reconciled before status is resolved or any new action is allowed.

## 5. Functional requirements (F)
- **F01** Wallet-verified owner authentication and org/account membership; distinguish web roles from onchain owner authority.
- **F02** Register/revoke agent identity; no treasury full-access keys for agent.
- **F03** Owner-approved typed mandate: vault/network/asset/recipient/task ref/per-payment cap/total cap/expiration/execution count/evidence policy/version.
- **F04** Deposit, allocate, available/reserved/spent balance, permission-checked owner withdrawal.
- **F05** Agent may submit a proposal with exact amount, recipient, asset, mandate and unique ID; cannot directly spend.
- **F06** Owner-designated verifier identities; evidence hashes and scoped attestations with expiration and non-replay.
- **F07** Atomic check-and-reserve and controlled transfer; idempotent state transitions and handling callbacks.
- **F08** Pause/revoke and emergency guardian limited to stop-only, never redirect.
- **F09** Audit records map user action → mandate version → proposal → attestation → execution ID → transaction result.
- **F10** Security console with blocked reasons, anomalous proposals and owner actions; sensitive data redacted.
- **F11** Read-only public demo mode with explicit SAMPLE labels, but no simulated blockchain events described as real.
- **F12** Human approval for evidence lacking a trustworthy automated verifier.

## 6. Non-functional requirements (N)
- **N01** Zero unauthorized transfers in the specified adversarial test matrix.
- **N02** Accounting conservation across success, failure, concurrency, and withdrawal.
- **N03** Secrets absent from repo/logs/client bundles; protected signing accounts isolated from agent and backend.
- **N04** Deterministic, versioned policy evaluation with precise error codes and explainable user feedback.
- **N05** Idempotent execution and event indexing; transactions tolerate restarts without duplication.
- **N06** Reproducible setup, CI lint/typecheck/tests/contract integration, no waived failing checks.
- **N07** Observable monitoring, emergency playbook, threat model, explicitly documented residual risk.
- **N08** Zero out-of-pocket spend; free tools, local infrastructure, testnet/sandbox, or credits explicitly awarded.

## 7. UX/navigation
Public landing + architecture explainer; owner dashboard; vault balances; create/view mandates; agents; proposals; approvals/attestations; execution detail; security events; emergency pause/revoke; audit explorer; guided real testnet demo. Mobile-responsive web experience.

### Integrated UX direction (D017)

Simplify owner/verifier workflows as the remaining product is integrated. Prefer
readable NEAR decimal inputs with exact checked integer conversion and safe local
SHA-256 calculation over manual atomic-unit/hash entry. Show essential terms and
actions first, with exact protocol data inspectable before approval. Never derive
independent verification from the agent’s file alone, silently change signed terms,
or remove explicit wallet approvals or onchain checks. M8 validates the full journey
on desktop and physical Android; M9 provides a temporarily hosted RumptyCloud
judges’ demonstration using genuine NEAR Testnet results, subject to separate
deployment and transaction authorization.

## 8. Exclusions / expansion boundaries
No unrestricted autonomous custody, unsupported mainnet assets, universal verification of real-world delivery, fiat off-ramp, production insurance guarantee, arbitrary cross-chain payment claims, or brand-new AI marketplace. Future chain adapter must satisfy independent safety review; no bridge or Intent call bypasses vault.

## 9. Acceptance criteria
A) One onchain testnet/sandbox authorized payment shows real receipt/settlement and correct accounting.
B) Wrong recipient, overspend, split spend, replay, forged verifier, mismatched attestation, revoked mandate and concurrent overspend are rejected with funds unchanged (except legitimate fees).
C) Pending/failed outcome is reconciled safely with no double spend.
D) Owner pause/revoke/withdraw can be demonstrated without admin privilege.
E) README lets human and AI judges reproduce each path; no unsupported security claims.

## 10. Success metrics
Blocked unauthorized transfer count in controlled tests; zero accounting violations; verified finality of authorized demo; incident detection latency measured in test environment; reproducible journey success rate; time to revoke as measured in chain inclusion (not promise of instantaneous finality).
