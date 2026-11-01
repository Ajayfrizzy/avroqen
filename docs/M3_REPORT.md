# M3 implementation and verification report

Status: contract implementation and local M3 gates pass. Prepared for draft review;
hosted `foundation` and `rust` must also pass on the PR head. Not publicly deployed,
not production-approved and not independently audited. M4–M6 are not implemented by
this change. No testnet/mainnet transaction or wallet key creation was performed.

## Baseline and approved authority

PR #6 merged into staging at `193ed2da6f14cd613fd1799752c37ac76c87e848`.
Local staging was fast-forwarded, then `feat/m3-mandate-vault` created. Main and
staging are not modified by this feature. Owner explicitly approved D014 packages
A/B/C: direct mandate funding/separate storage credit; direct authority/owner-only
execution; terminal failed attempts/quarantined unknown outcomes. These approvals
do not authorize deployment or public-chain spending.

Read AGENTS.md, all seven persistent skills, canonical product/architecture/contract/
threat/evidence/test documents and M1/M2 reports. This report records agent self-review
and automated evidence; it is not an independent security assessment.

## Implemented inventory

- Native Rust NEAR contract with strict immutable canonical M2 policy registration
  and digest verification, fresh direct wallet owner authorization, exact configured
  network/current contract binding, native asset/recipient/caps/expiry/slot checks.
- Owner-specific prepaid measured storage credits, direct owner-only funding,
  per-mandate available/reserved/spent/withdrawal/deposit accounting, checked u128
  arithmetic, independent protocol/storage reserve and bounded record consumption.
- Registered-agent-only proposals; selected direct verifier MAP-1 attestations,
  exact bindings, global signer+nonce replay protection, per-claim distinct quorum,
  separate owner per-payment approval, terminal pre-dispatch disputes.
- Owner-only atomic check/reserve/dispatch; private callback authenticates real
  native promise result; successful, confirmed-failed and pending states. Missing
  or unexpected callback results never release obligations. Failed proposal is
  terminal; retry needs a new proposal and fresh proofs.
- Owner pause/resume/revoke/available withdrawal/storage-credit withdrawal;
  guardian stop-only. Revocation blocks new dispatch, not an already sent transfer.
  Callback updates are preallocated, fixed-width; available withdrawals cannot be
  blocked solely by an exhausted agent/verifier storage allowance.
- Persistent mandate/proposal/execution/withdrawal/credit/accounting views,
  structured registration/control/dispatch/settlement events. Timestamps/u64 IDs
  and amounts use decimal JSON strings. M6 receipt indexing is still future work.
- Typed TS registration/evidence/read interface and responsive explicit onchain
  unavailable/not-deployed status. No transaction sender or API custody key. M1
  login/tenant rules and M2 consent workflows are preserved.
- Exact Wasm method allowlist, forbidden administrative host capabilities,
  NEAR-specific host-function checks and mandatory real sandbox CI step.

## Actual local verification (2026-11-01)

| Command / gate | Result |
| --- | --- |
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Pass |
| `cargo test --workspace --lib --locked` | **33 passed**, no ignored tests |
| Release Wasm build with locked dependencies | Pass |
| `node scripts/check-wasm.mjs` | Pass: exact 22-method surface; no deploy/delete/key/stake/create-account imports; required NEAR host imports present |
| `cargo test -p mandate-vault --test sandbox --locked -- --nocapture` | **5 real sandbox scenarios passed**, many positive/adversarial transaction assertions; no ignored test |
| `pnpm check` | Lint/types pass; **39 unit + 13 integration + 13 adversarial** tests pass |
| `pnpm test:identity-db` | **56 real PostgreSQL tests pass**, isolated test schemas |
| `pnpm build` | Next.js production build + TypeScript pass |
| `pnpm test:e2e` | **28 Chromium tests pass**, including narrow-screen unavailable-state regression |
| Database, containers, readiness smoke, Compose config, actual DB outage/recovery | Pass; services restored and owner volume retained |
| Workflow validation and Gitleaks secret scanning | Pass; no leaks |
| `git diff --check` | Pass |

TypeScript/API/database total: **121**. Browser: **28**. Rust unit: **33**, including
16 generated success/failure sequences checked for conservation. Sandbox: **5**
end-to-end scenarios, not 1 test per security case. Counts must not be added to claim
independent wallet or audit coverage.

Sandbox uses near-workspaces 0.24.0 / near-sandbox 0.4.0, local node 2.14.0, pinned
Rust 1.96.1 and near-sdk 5.30.0. No public RPC is used by the sandbox test.
The positive transfer increased the recipient's actual sandbox balance by
`2000000000000000000000` yoctoNEAR (0.002 local NEAR). Five receipt outcomes, no
failed receipt; callback reported success and moved reserved to spent exactly once.
Example local-only transaction: `Sy4SUDyDw6PHTuqFTm9CWNUCbkmjU2psLKNNob7FJ9Y`;
gas burnt `6221311232387`. This temporary chain is destroyed after testing; the hash
is not a public explorer link. Reruns generate different local transaction IDs.

The sandbox also executes a genuinely failing native transfer to a nonexistent
named subaccount; callback restores availability and releases the slot without
phantom spend, and re-execution of the same proposal fails. It tests failed-call
rollback, concurrent contention for one funded allocation (exactly one winner),
private callback rejection, guardian limits, revoked dispatch rejection, withdrawal
of available funds, storage credit withdrawal, storage-limit rollback and second-owner
isolation. Unit tests additionally exercise missing/oversized callback evidence,
root-state reload, reserved withdrawal denial, expiry, proof binding/impersonation,
quorum, count limits and overflow. Unit panic tests alone do not prove NEAR rollback;
actual sandbox transactions provide that evidence. Missing callbacks now also have
the explicitly fault-injected sandbox evidence below. Definitively failed withdrawal injection and root-state reload remain
runtime-harness tests, not claimed public-network incidents.

## Defects found and resolved during implementation

1. Draft withdrawal path charged the agent allowance. Owner withdrawal now uses
   separate owner credit; regression confirms exhausted mandate allowance cannot
   block available withdrawal when owner credit is sufficient.
2. Initial Wasm lacked target-specific `--cfg near`, required by near-sdk-env 0.1.8,
   and sandbox rejected with an unreachable trap. `.cargo/config.toml` selects NEAR
   host crypto/panics. Real Wasm execution and host-import checks protect this.
3. General SDK Promise construction linked administrative action imports even
   though no public method selected them. Narrow native transfer/self-callback
   primitives now exclude these imports entirely; this was capability minimization,
   not evidence of a demonstrated reachable admin exploit.
4. Callback decoding now accepts only empty native-transfer success or definitive
   failure; unexpected data remains quarantined. JSON u64 fields use strings to
   avoid JavaScript precision loss.

5. Initialization now measures serialized root storage before enforcing the full
   reserve; a regression rejects an account funded only for the reserve with no
   root-storage backing.

## Security-case evidence and remaining boundaries

S01–S09, S11–S13, S15–S19 contract portions have unit/sandbox evidence as described
above. S10 rejects unauthenticated/mismatched claims, but cannot establish real-world
truth: independently sourced evidence is M5. S14 retains unresolved reservations;
M6 RPC/indexer fault recovery is not implemented. S20 contract root reload and
idempotent callback are tested; worker replay/reconciliation remains M6.
No AI-generated receipt or backend approval authorizes an onchain transfer.

Residual risks: unaudited custody code; compromised owner/verifier keys; colluding
verifiers; guardian denial of service; immutable network label cannot prove actual
chain; deployment full-access keys can still replace code outside contract methods;
known-ID squatting can deny registration; lifetime storage/proposal bounds and
retained records; indefinitely stranded unknown outcomes. 60/20 Tgas limits are
conservative engineering limits, not exhaustive protocol/load certification.
Application agent disable and offchain consent revocation do not revoke an onchain
mandate; the owner must use actual onchain pause/revoke after any future deployment.

Existing owner-confirmed desktop/Android M1/M2 results remain historical evidence
in their reports; no new human M3 wallet test was performed. iOS remains deferred.
Independent review, public testnet account/key governance, network/code verification,
real-wallet transaction review and authorized testnet positive/negative receipts
remain pending. No remaining design-package A/B/C decision is awaiting an answer.

## Artifact and delivery

Local release Wasm: 366735 bytes; SHA-256
`b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`.
It is ignored as a generated artifact, not committed. Rebuild and rehash before
any deployment; compiler/platform provenance can affect byte-for-byte artifacts.
Measured code+initialized storage: 367086 bytes; end of sandbox scenario: 375976.
See M3_TESTNET_RUNBOOK.md for measured-cost arithmetic and the approval-only plan.

The draft PR and exact-head hosted checks are the delivery record; local results
here do not assert a hosted run passed. Keep the PR draft, target staging, and do
not merge or deploy. Hackathon integration acceptance requires reviewer approval
and green mandatory CI; production security approval is not claimed.

## Final financial-security review — PR #7

Reviewed baseline `fe29ab3e4483100fca35bf7bcb3df386e1940f53` against the actual
Rust state transitions, policy validation and tests. Baseline hosted foundation/rust
passed in run [41349967449](https://github.com/Ajayfrizzy/avroqen/actions/runs/41349967449).
This follow-up adds focused tests and documents evidence; **no new production
contract defect was confirmed**, so the production contract and Wasm are unchanged.
No security restriction was relaxed. This is agent self-review, not an independent
audit or a claim that no undiscovered vulnerability exists.

| Review area | Finding and verification |
| --- | --- |
| Owner / agent / verifier / guardian | Direct signer+predecessor and 1-yocto owner controls remain intact. New sandbox uses a distinct guardian and rejects registration of another owner’s policy, funding/execution/withdrawal of that owner’s mandate, resume/revoke and attestation escalation; selected verifier cannot forge OWNER_APPROVED; verifier cannot impersonate agent. Guardian can pause and only owner resumes. |
| Conservation | Checked `D=A+R+S+W+X`, `S+R<=B` and slot bounds remain intact. New sandbox asserts conservation after slot races, payment-vs-withdrawal races, duplicate withdrawals and redeposit. Deposits do not reset spend or successful slots. |
| Concurrent reservations | New case supplies enough funds for both proposals but only one slot: exactly one real payment succeeds and the other fails EXECUTION_LIMIT. Separate payment/withdrawal and withdrawal/withdrawal races permit exactly one redemption of the allocation. |
| Storage / insolvency | Locked backing and unlocked credit remain separate. Withdrawing locked backing or all unlocked credit without leaving the new record's storage charge fails atomically; no withdrawal record/credit change remains. One-owner global credit/locked totals match its ledger. Sandbox-only balance deficit injection makes all three outgoing paths fail INSUFFICIENT_LIQUID_BACKING and roll back. |
| Callback authentication / idempotency | External withdrawal callback fails private check. Even a direct call signed by the vault account cannot forge a settlement without a promise result. Existing unit tests cover callback replay, empty native success, definitive failure, unexpected data and restoration exactly once; existing sandbox proves real native transfer failure restoration and terminal proposal reuse rejection. |
| Unknown obligations | New fault-injected sandbox lets native transfers succeed but callback exports be unavailable. Exactly one receipt fails, on the vault callback. Payment remains reserved with its slot occupied; available withdrawal and storage-credit withdrawal remain pending, never refunded or marked succeeded. After 100 additional blocks, no timeout release/retry or reserved withdrawal is permitted. |
| Initialization / deployment keys | Existing root-storage backing test and new real reinitialization rejection hold. A retained vault full-access key can transfer native funds directly, add keys, replace code or delete the account outside Rust controls. Contract methods cannot prevent that protocol-level authority. Key governance must be explicitly approved before controlled deployment; immutability and administrator-free custody must not be claimed while such keys remain. |

New sandbox names (the original positive/failure scenario also remains mandatory):

- `execution_slots_and_withdrawal_races_preserve_conservation`
- `missing_callbacks_quarantine_real_transfers_and_withdrawals`
- `storage_backing_insolvency_and_initialization_fail_closed`
- `distinct_roles_cannot_escalate_or_forge_owner_approval`

Fault-injection limits are explicit: callback tests rename only the two export names
in an in-memory copy of the release Wasm. Transfer/reservation/callback bodies are
unchanged; production source, artifact and its capability gate are unchanged. This
is evidence of quarantine under a deliberately unavailable callback, not evidence
that a callback spontaneously failed on a public network. The insolvency fixture
patches only an ephemeral sandbox balance while preserving code/storage metadata;
it is not a reachable contract withdrawal path or a demonstrated fund-loss exploit.
No public accounts/keys, testnet tokens or paid services are involved.

Two test-fixture issues were corrected during this review: reinitialization expected
an inexact SDK error substring, and an initial account patch did not preserve the
code metadata. Both failures were inspected and corrected; neither was concealed
as a passing test or misrepresented as a contract vulnerability.

Local follow-up commands: locked full Rust tests, Clippy with warnings denied,
rustfmt, release Wasm build/capability inspection; pnpm check/build; 56 real SQL
tests; 28 Chromium tests; database/container/smoke/workflow checks and Gitleaks.
Final totals are 33 Rust unit + 5 sandbox scenarios, 121 TypeScript/API/SQL tests and
28 browser tests, with no ignored Rust tests. Exact-head follow-up hosted results
are recorded on [draft PR #7](https://github.com/Ajayfrizzy/avroqen/pull/7).

Assessment: ready for hackathon integration review when both required checks pass
on the follow-up head; no confirmed blocking financial defect found. Merge still
requires owner authorization. **Separate controlled testnet deployment authorization
is required**, including exact artifact/network/account, full-access-key governance,
per-call deposits/gas and bounded funding plan. Independent review, actual public
wallet/deployment tests, exhaustive maximum-load/gas certification and M5/M6 evidence/
reconciliation work remain pending. Full storage-credit withdrawal needs funds for
its own retained record, and unknown outcomes can strand funds indefinitely; these
are retained approved safety limitations, not hidden recovery capabilities.
