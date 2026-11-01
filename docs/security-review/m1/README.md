# M1 security-review evidence package

**Current integration disposition (2026-11-01):** the owner permits M1 hackathon
testnet integration without an external independent audit. No confirmed critical
or high-severity blocking defect was identified in the reviewed M1 paths at
`c0d4063197432a65bd9a936a526b7c1ef51ee338`; foundation/rust passed in
[run 41317104005](https://github.com/Ajayfrizzy/avroqen/actions/runs/41317104005).
This supersedes older draft-only/unpushed/independent-review-as-integration-gate
language below. Independent review remains NOT PERFORMED and this package remains
its handoff, not an audit. Residual risks and manual gaps remain open; iOS is
deferred. See M1_REPORT.md for the current scoped acceptance and merge boundary.


**Purpose:** independent-review handoff for draft PR #5, not an independent audit.
Prepared by the same coding assistant that implemented/reviewed M1. No independent
reviewer has approved these controls. Passing automated tests is bounded evidence,
not proof that all attacks are impossible or that M1 is finally accepted.

Review baseline: `64cad66d5a7dc4b6d716a05470c15347f166c082`, branch
`feat/m1-identity-access`, PR https://github.com/Ajayfrizzy/avroqen/pull/5 against
`staging`. This supplement adds private HTTPS tooling, negative authentication/cookie tests,
revocation-contention and rollback evidence, and owner-confirmed desktop/Android
results. Review this branch against that baseline; prior hosted CI does not attest
to the new review candidate until it is pushed and checked.

Contents: this scope/evidence map, [findings and disposition](FINDINGS.md), current
[verification report](../../M1_REPORT.md), [manual result ledger](../../M1_WALLET_ACCEPTANCE.md),
[private Android HTTPS instructions](../../M1_ANDROID_HTTPS.md), and
[negative-case procedures/evidence](NEGATIVE_AUTH_CASES.md).
No credential archive, database dump, HAR, signature/nonce capture or wallet secrets
are included. Review the repository source directly; do not bundle `.env`, `.local`,
node_modules, build outputs or raw logs into an evidence archive.

## Canonical authority and scope

Read AGENTS.md, PRD F01/F02 and N03/N06, ARCHITECTURE trust tiers, THREAT_MODEL,
CONTRACT_SPEC custody/roles, ATTESTATION_PROTOCOL evidence boundaries, TEST_PLAN,
MILESTONES M1, API_DATA_MODEL, DECISIONS D012 and M1_DESIGN before review.
The approved login policy is NEP-413 plus an active finalized **FullAccess Ed25519**
key on the server-selected network. Restricted keys are rejected. A login session,
application owner role, registered agent or DB row cannot authorize an onchain
transaction or substitute for an owner's transaction signature.

M2 mandate consent, custody, settlement, agent execution, verifier credentials and
S01–S20 financial tests are outside this supplement. Their absence is not a passing
result. No deployment, merge, funding or new onchain key is authorized here.

## Review map and evidence limits

Paths are relative to the repository root. Test descriptions are searchable by
name, so reviewers can locate them without relying on stale line numbers.

| Boundary | Implementation | Automated evidence | Independent/manual question |
| --- | --- | --- | --- |
| NEP-413 bytes/signature | `apps/api/src/identity/crypto.ts`, `packages/domain/src/index.ts`, `apps/web/app/workspace/wallet-proof.ts` | `tests/unit/identity.test.ts`: independent Borsh/tag/SHA-256 encoding; `tests/database/identity.test.ts`: real Ed25519 proof, forged/different key, changed recipient/message/nonce/callback/account/network; normalized SDK proof/replay | Independently compare serialization/domain separation against NEP-413; inspect actual wallet message/response compatibility; test vectors alone do not audit crypto libraries |
| Finalized key permission | `fullAccessVerifier` in `crypto.ts`, `identity/config.ts` | fixed testnet/mainnet endpoint, finality `final`, account/key query binding, strict `FullAccess`, missing/restricted keys, malformed envelope, timeout/outage; actual parser composed with SQL route | Assess trust in fixed RPC endpoint and selected network; simulated RPC responses do not demonstrate an independently verified chain state |
| Nonce/browser/replay | `identity/routes.ts` challenge lookup and transactional conditional UPDATE; `db/migrations/001_identity.sql` unique session/challenge FK | single replay denied, six synchronized consumers one winner/session/audit; browser cookie substitution denied; expiry after key-check denied; new audit-failure rollback test leaves nonce unconsumed and creates no session | Independently assess all interleavings, transaction isolation, DB error paths and browser login-CSRF assumptions |
| Session lifetime/revocation | routes session lookup, rotation and logout; hash-only storage and 900s expiry | issued 900s TTL; refresh does not extend; expired/retained logged-out cookie fails reads/writes; rotation invalidates old session | Real browser cookie lifetime/clearing, independent lock review and residual 15-minute stale authorization after wallet-key removal |
| Origin/CSRF/cookies | exact configured Origin on writes, session-bound CSRF, `identity/config.ts`; new local TLS proxy/override | missing/wrong/null/port Origin and CSRF denied; previous-origin challenges/sessions invalidated; HTTPS live check sees Secure/HttpOnly/SameSite/__Host challenge cookie; TLS rejects untrusted root | Android TLS/session-attribute inspection is owner-confirmed; server no-Domain/challenge-cookie lifecycle is tested; broader adversarial browser enforcement is not claimed |
| Role escalation | strict shared schemas; live membership lookup with owner/admin write roles | extra role/owner fields rejected; member/viewer write denied; demotion/disabled membership applied with same session; agent registration grants no membership | Independent endpoint/alternate-route inventory and review of all authority-bearing fields; app owner must never be confused with onchain owner |
| Tenant isolation/disable | every agent query/update scopes org/network and active membership; idempotent disabled_at | wrong-org reads/writes denied, wrong scoped agent ID denied, disabled state survives logout/login; stale org UI response ignored | Owner confirmed B cannot list A's org and direct agents URL shows ACCESS_DENIED; exact HTTP status was not separately captured |
| SDK credential exposure | wallet.ts message-only action, rejecting key store, memory storage, disabled bridge/logging; pinned SDK patch | byte serialization and key-store rejection; installed-artifact check removes two unconditional V1 payload logs; no raw SDK errors retained; source secret scanning | Dependency-wide review of reachable code, origin/source validation, extension/window messaging, storage/logging and unused transfer capabilities; the two-call patch is not a full dependency audit |

## Reproduce without real wallet secrets

Use a separate local checkout/environment; preserve any existing development DB.
Test suites generate ephemeral Ed25519 signing fixtures only in process and create
isolated PostgreSQL schemas. They do not add wallet access keys or spend funds.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup:env
docker compose up -d --wait database
pnpm check
pnpm test:identity-db
pnpm build
pnpm test:secrets
```

OpenSSL must be on PATH for the new TLS integration tests. They create temporary
short-lived test certificate material, require local loopback sockets, verify the
chain without bypass flags, and remove their temporary directory afterward.
For the real local TLS/app check follow M1_ANDROID_HTTPS.md then run `pnpm test:https`.
Do not mistake its synthetic challenge for an authenticated human wallet session.

Current exact command outcomes and failed attempts/corrections are in M1_REPORT.
Baseline hosted run https://github.com/Ajayfrizzy/avroqen/actions/runs/41305809838
passed foundation/rust on `64cad66`; it does not certify this supplement. The current M1 report records the new complete local rerun, including 8 browser
tests and Rust/Wasm; those local results do not constitute hosted CI. Testnet/sandbox transaction receipts are not applicable to these
offchain identity tests and must not be fabricated.

## Independent reviewer handoff and signoff

An independent human reviewer should identify the reviewed commit/diff and their
relationship to the implementation, reproduce selected tests, inspect the entire
identity/SDK trust boundary, and record findings with severity, affected path,
preconditions, evidence, recommended fix, owner and verification status. Use public
fixture accounts and synthetic proofs; never attach user tokens or wallet backups.

Required review questions:

1. Does every proof bind the exact approved domain, account, origin, network,
   callback and expiry, and is malformed/ambiguous encoding rejected?
2. Can any concurrent/error path consume a nonce without issuing its session,
   issue multiple sessions, or commit a privileged mutation after revocation?
3. Are browser binding, CSRF, cookies, TLS termination and proxy assumptions valid
   on the actual supported browsers, including malicious pages and extensions?
4. Can a user supply another org, network, role or agent ID to cross a boundary?
5. Can any reachable SDK path import/export/log a key or proof, request AddKey or
   a transaction, or trust a forged window/extension message? Is the patch sufficient?
6. Are RPC trust, rate-budget sharing, retention/cleanup, privileged dev DB role and
   ingress/CSP limits acceptable for the intended local scope? What must block release?

Signoff template: reviewer / independence statement / revision / date / controls
reviewed / reproduced evidence / open finding IDs / disposition. **Currently NOT
REVIEWED independently.** Do not fill this template on behalf of a reviewer or mark
M1 complete because this assistant's self-review and automated tests pass.
