# Dependency-based milestones (not time-based rejection criteria)

**Official build window:** start November 1, 2026 00:00 UTC; submission deadline November 14, 2026 23:59 UTC. Plan documents may be prepared beforehand; respect the official start for implementation. Do not reduce ambition solely based on build days; prioritize usefulness and reliability.

| Milestone | Engineering scope | Completion evidence |
|---|---|---|
| M0 | Monorepo, env templates, containerized dev, pinned dependencies, AGENTS/skills, CI | Reproducible bootstrap, green CI |
| M1 | Wallet auth, org and agent identity | Role/tenant tests, signature verification |
| M2 | Typed mandates, wallet-signed consent, revocation UX | Policy snapshots and unauthorized-change tests |
| M3 | Rust MandateVault custody, reservations, callback logic | Sandbox positive/negative contract suite |
| M4 | Restricted agent runtime and proposal API | Agent cannot call owner/verifier tools |
| M5 | MAP-1 independent verifier and evidence provenance | Forged/mismatched/expired attestations rejected |
| M6 | Settlement, indexer and reconciliation | Receipt-based E2E, outage/retry tests |
| M7 | Security monitoring, emergency controls and incident UI | Pause/revoke and alert tests |
| M8 | Red-team scenarios, property tests, integration hardening | S01-S20 evidence, residual risks documented |
| M9 | Free deployment, docs, demo, public repo, X post, approved submission | Reproducible judge walkthrough; owner-authorized publish |

## Codex workflow
One change set at a time with scoped tests, PR review, merge only when gates pass. Do not produce PRs that bypass security checks. Ask the owner about substantive security design changes, upgrades, new privileged operations or mainnet spending.
