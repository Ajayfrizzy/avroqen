# Dependency-based milestones (not time-based rejection criteria)

**Official build window:** start November 1, 2026 00:00 UTC; submission deadline November 14, 2026 23:59 UTC. Plan documents may be prepared beforehand; respect the official start for implementation. Do not reduce ambition solely based on build days; prioritize usefulness and reliability.

| Milestone | Engineering scope | Completion evidence |
|---|---|---|
| M0 | Monorepo, env templates, containerized dev, pinned dependencies, AGENTS/skills, CI | Reproducible bootstrap, green CI |
| M1 | Wallet auth, org and agent identity | Role/tenant tests, signature verification |
| M2 | Typed mandates, wallet-signed consent, revocation UX | Policy snapshots and unauthorized-change tests |
| M3 | Rust MandateVault custody, reservations, callback logic | Sandbox positive/negative contract suite |
| M4 | Restricted agent runtime and proposal API | Agent cannot call owner/verifier tools |
| M5 | Preserve completed MAP-1 human verifier and evidence provenance (D016) | Mandatory automated gates; real-wallet/source acceptance pending integrated M8; PR #9 integration subject to green CI/no blocking defects |
| M6 | Real NEAR Testnet transaction orchestration, verified receipts, indexer and reconciliation | Separately authorized wallet transactions; finalized receipt/state bindings; safe pending/unknown recovery with no blind retry |
| M7 | Complete security monitoring, emergency controls and incident UI | Alert/redaction tests; approved owner/guardian pause/revoke boundaries and incident recovery |
| M8 | Complete M1–M7 end-to-end security/UX acceptance and integration hardening | S01-S20, desktop and physical Android, genuine verifier signing/source verification, actual testnet receipts, residual risks |
| M9 | Polished reproducible judges’ demo temporarily hosted on RumptyCloud; docs and authorized submission preparation | Genuine NEAR Testnet results, HTTPS/secret isolation and teardown; separately authorized hosting/publication/submission |

**M9 substatus — November 8, 2026:** PRD F11's isolated six-route SAMPLE
walkthrough is implemented and merged. The [M9.5 canonical judge documentation](M9_JUDGE_DEMO.md)
and empty evidence-manifest template are prepared for review. Screenshots, video,
hosting, genuine Testnet financial results, publication and submission remain
pending; none is authorized by documentation preparation. Full M8 acceptance and
full M9 completion are not claimed.

## Codex workflow
One change set at a time with scoped tests, PR review, merge only when gates pass. Do not produce PRs that bypass security checks. Ask the owner about substantive security design changes, upgrades, new privileged operations or mainnet spending.

## Integrated delivery sequence — D017

Build the integrated product before asking the owner to repeat milestone-by-milestone
manual desktop/Android walkthroughs. Automated unit, integration, real PostgreSQL,
browser and sandbox tests remain mandatory at every applicable milestone, alongside
lint/types/build, Wasm/security checks and required hosted CI. A failing financial
safety check or confirmed blocking defect still blocks integration. Existing manual
results retain their original scope; missing M5 tests remain pending, never passed.

M5 is implementation-preserving: no new provider integration, transaction sender or
UX rewrite belongs in this planning change. Prepare draft PR #9 for hackathon
integration, not production approval; do not merge without owner authorization.
Independent review remains separately recorded; repetitive manual walkthroughs are
not a prerequisite for continuing M6/M7 development under this owner direction.

M6 must retain direct wallet authority, exact network/vault/code/policy/proposal
bindings and per-payment owner execution. Sessions, backend readiness and agent
bearers cannot authorize transactions. Index finalized receipts and contract state;
transaction submission alone is not settlement. Callback uncertainty keeps payment
and withdrawal obligations quarantined; no timeout release or uncontrolled retry.
Any live deployment or token movement needs separate explicit authorization.

M7 must expose useful alerts and emergency actions without new administrative
withdrawals, upgrades or permission escalation. Guardian stays stop-only, owner
alone resumes, revocation stays terminal, and dispatched outcomes still reconcile.

M8 is the consolidated human acceptance gate for the complete M1–M7 product. Use
TEST_PLAN's integrated matrix and M5_VERIFIER_RUNBOOK as component-level detail.
Include actual independently obtained source evidence and genuine verifier wallet
signatures, not only fixtures or viewport emulation. iOS remains explicitly deferred.

M9 targets temporary RumptyCloud hosting at zero personal cost. Verify provider
capabilities/terms, HTTPS and wallet origin compatibility, secret/database isolation,
access controls and teardown/retention before deployment approval. Do not invent a
free tier or silently substitute hosting if unavailable; record the blocker. Prepare
judge do-X-see-Y instructions and genuine testnet transaction/receipt references.
Repository visibility, public hosting, human X post and final submission remain
separate owner-authorized actions under unchanged HACKATHON.md.

## Integrated UX acceptance

Use readable NEAR inputs with deterministic checked decimal-to-atomic conversion;
show the exact converted authorization before signing and retain technical detail
on demand. Calculate SHA-256 from exact independently obtained bytes locally when
safe; do not require manual hash calculation or copy/paste of atomic units as the
normal workflow. Preserve immutable bindings and require fresh approval after any
term change. Never autofill an agent's claim as an independent verifier observation.
Keep essential owner/verifier actions prominent, with clear cancellation, errors,
loading, pending/unknown and final outcomes. Simplification must retain explicit
wallet approvals, independent evidence, quorum and every onchain financial check.

M7 implementation evidence is in M7_REPORT.md: deterministic advisory detection, tenant-scoped incidents, independent monitor loop and existing owner/guardian wallet control integration. M7 automated acceptance never substitutes for M8's integrated real Testnet, independent-source/verifier and physical Android demonstration. Review and merge remain separate owner decisions.
