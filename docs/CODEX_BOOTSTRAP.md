# Codex bootstrap — instructions for November 1

**Do not run implementation tasks before 2026-11-01 00:00 UTC.** The pack is planning material only.

## Bootstrap message for Codex (paste at development start)
> Read AGENTS.md, all docs/ specifications, the unchanged HACKATHON.md, and the installed project skills. Inspect the existing repository before editing. Implement M0 foundation first, preserving the security invariants. Do not invent keys, consent, mainnet deployments, paid resources, or security shortcuts. Produce the repository plan and exact commands; implement only after the official start. At each milestone provide code changes, tests, risk analysis, and a human approval checkpoint for any financial authority change.

## Suggested monorepo (planning only)
```
apps/web/
apps/api/
apps/worker/
contracts/mandate-vault/
packages/domain/
packages/agent/
services/verifier/
tests/e2e/
docs/
.agents/skills/
AGENTS.md
HACKATHON.md
```

Use pnpm workspace if appropriate, Cargo for Rust, Docker Compose for local Postgres, GitHub Actions for CI. Pin versions after checking live documentation. Generate `.env.example` with placeholder names, never real secrets. Scope checkpoints M0-M9 in MILESTONES.md.
