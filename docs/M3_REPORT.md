# M3 implementation report

Status: preparation only; financial implementation awaits explicit owner decisions
in M3_DESIGN.md. M3 is NOT complete. No financial test or sandbox pass is claimed.

Confirmed via GitHub: PR #6 MERGED at
`193ed2da6f14cd613fd1799752c37ac76c87e848`. Fetched origin, fast-forwarded local
staging, created `feat/m3-mandate-vault`. Main unchanged; working tree was clean.
Read project instructions, seven persistent skills and canonical product,
architecture, custody, evidence, threats, tests, decisions, M1/M2 evidence and CI.

Current Rust code is still the disabled M0 scaffold, pinned near-sdk 5.30.0.
Existing Wasm check deliberately forbids transfers and exposes only foundation
views. M3 must replace it with reviewed contract-interface plus real financial
sandbox tests; the existing scaffold result cannot establish custody safety.

Prepared M3_DESIGN.md with concrete decision packages and alternatives:
A: direct mandate funding, owner storage credits, reserve segregation/refund limits.
B: direct-caller authority, owner-only dispatch, domain/registration protocol,
stop-only guardian, deployment-key immutability limitations.
C: definitive-failure slot release, terminal proposal attempts, no automatic retry,
private settlement/withdrawal callbacks and potentially stranded unknown obligations.

Deployment runbook is a preparation template only. No deployment account is assumed,
no credentials collected, no ~20 testnet NEAR spent, no public RPC transaction sent.
Required financial tests, artifact hash and numerical cost evidence remain absent
until implementation and sandbox measurement. No M3 draft PR yet.

Preparation verification: `pnpm lint` PASS (66 source files), `git diff --check`
PASS, and `pnpm test:secrets` PASS (no leaks). No runtime files changed. Existing
CI has no sandbox runner/dependency; adding a pinned compatible sandbox and real
financial tests is required implementation work, not an existing passing gate.
Rust toolchain remains 1.96.1 with wasm32-unknown-unknown and near-sdk 5.30.0.
The owner decision prompts reference packages A/B/C in the design; responses are
pending, not inferred. A local preparation commit does not establish M3 completion.
