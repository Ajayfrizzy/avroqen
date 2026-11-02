# M4 implementation and verification report

Status: implementation and all local M4 gates pass. Hosted exact-head results are
tracked on the feature branch draft PR checks; local success does not establish
hosted success. Prepared for draft review, not merge,
production approval or deployment. This report is agent self-review, not an
independent audit. No public-chain transaction, privileged blockchain key/account,
paid AI service or repository visibility change was performed.

## Baseline and approval

M3 PR #7 was verified merged into staging at
`42161e3ba7b368f750872690e7f5cc19f12ce046`. Fetched/pruned remote refs, synchronized
local staging and created `feat/m4-agent-runtime`; main/staging are unchanged by
this feature. Remote staging still matched that base before delivery, and no
remote M4 feature branch existed. Repository visibility was PRIVATE.

Read AGENTS.md, all seven persistent skills, canonical PRD/architecture/contract/
evidence/API/threat/test/milestone documents and M3 evidence. Owner explicitly
approved option A in M4_DESIGN.md on 2026-11-02. D015 records that scoped application
bearer capabilities grant proposal access only, never wallet or financial authority.

## Implemented inventory

- `packages/domain/src/proposals.ts`: strict versioned immutable proposal schema,
  exact canonical positive u128 amounts, deterministic binding/recipient/cap/expiry
  checks and pure actual-M3 argument adapter. No transaction transport/signing.
- `packages/agent/src/runtime.ts`: operational local rules-based preparation with
  five fixed tools (summary, own status, prepare, submit, denial descriptions).
  Description text is inert; digest is not verified evidence. No paid model,
  unrestricted HTTP, filesystem, shell, owner/verifier or execution tools.
- Migration 003: hashed credentials with immutable scope through policy FK;
  immutable proposals with scoped idempotency uniqueness and SQL identity/amount
  validation; append-only audit events. Existing migration history is unchanged.
- Original-owner session/CSRF/Origin issuance, single-return random 256-bit token,
  15-minute demo / 24-hour operator maxima bounded by policy expiry, metadata-only
  listing, atomic rotation with old/new audit linkage and explicit revocation.
- `/api/agent/tools`: independent capability authentication; live issuing-owner
  membership, consent, active-agent and expiry checks under locks; no cookie-based
  agent identity. Same-mandate submissions/revocation serialize. Proposal+success
  audit commit atomically, retries preserve idempotency across credential rotation.
- Existing strict Origin/no-store/body/rate/error controls retained. Invalid or
  privileged tools fail schema validation; error/audit output omits raw payloads,
  credential values and SQL diagnostics. At most128 retained credentials and 128
  accepted proposals per mandate; existing IP rate limits apply.
- `/workspace/proposals`: organization/mandate selection with pagination, exact
  scope/limits/verifier display, explicit in-memory demo capability, task preparation,
  focused/scroll-visible review, denials, offchain submission/history, retry,
  loading/empty/disabled/logout/revocation states. Agent fetches omit session cookies.
  No localStorage/sessionStorage credentials. Responsive controls respect reduced
  motion; above-cap requests cannot be submitted through the UI.
- M4_DESIGN, D015, API/architecture updates, M4_AGENT_RUNBOOK and
  M4_PROPOSAL_API document exact lifecycle, operator handling and M5/M6 boundaries.

## Actual verification — 2026-11-02

| Command / gate | Result |
| --- | --- |
| `pnpm check` | Lint/types pass; **56 unit +13 integration +13 adversarial** tests pass |
| `pnpm test:identity-db` | **95 PostgreSQL tests pass**, including 39 new M4 cases in isolated schemas |
| `pnpm build` | Production Next.js build and TypeScript pass; new proposals route generated |
| `pnpm test:e2e` | **38 Chromium tests pass**, including 10 new M4 desktop/mobile/negative/retry tests |
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Pass |
| `pnpm test:contract` | Locked release Wasm builds; **33 Rust unit +5 real local sandbox scenarios pass**, no ignored tests |
| `pnpm test:wasm` | Exact 22-method surface and administrative-host prohibition pass |
| `pnpm test:workflow` | Pass |
| `pnpm test:secrets` | Gitleaks passed, no leaks in tracked/untracked reviewable source |
| Compose config/build/migration, container/database/smoke gates | Pass; services non-root, no env/Git metadata in images; existing volume retained |
| Real database outage/recovery | Pass: readiness unavailable while liveness remains200; all services/readiness restored |
| Live HTTP boundary | Proposal page200; same-origin agent request without capability401 |
| GitHub foundation/rust | See exact-head checks on the draft PR and delivery response; never inferred from local checks |

TypeScript/API/SQL total **177**, separately from browser and Rust coverage. Unit
and API tests are not claims of human wallet acceptance. The Rust production
contract is unchanged; sandbox uses temporary local identities and valueless
balances, not testnet funding or public-chain transactions.

### Security evidence

- All proposal org/agent/account/mandate/version/digest/network/vault/recipient/
  asset/amount substitutions fail without a retained proposal. Decimal, exponent,
  zero, negative, leading-zero and >u128 amounts reject safely.
- Concurrent identical submissions create exactly one proposal and one success
  audit; changed payload with the same key conflicts. Rotation does not reset it.
- Disabled agents, revoked consent, lost owner role, expired/revoked credentials
  block new submissions and idempotent retries. A revocation committed while a
  request waits blocks its later submission. Credential expiry is rechecked after
  lock waits. Concurrent disable has a serialized result and subsequent retry fails.
- An agent bearer cannot authenticate owner issuance, M2 approval or agent-record
  creation routes. Second owners/admins cannot issue original-wallet capabilities.
  Separate mandate credentials cannot query each other's proposal IDs.
- Tampered scope inserts and immutable updates/deletes fail at SQL boundaries.
  Injected audit failure rolls back proposal creation; retry then succeeds.
- Prompt injection cannot change recipient/tools or manufacture evidenceVerified.
  Oversized/unknown-field requests reject safely. Errors omit tokens and internal
  diagnostics; hashed persistence and audit redaction are asserted.
- Browser fixtures test independent Authorization transport with no cookie, no
  token in task body/browser storage, mobile/desktop focused review, policy denial,
  outage, retry retaining exact IDs, duplicate-action prevention and credential
  clearing. These are simulated API responses, not real M4 wallet/device tests.

## Confirmed implementation defects and corrections

1. New positive-amount refinement initially called BigInt on decimal/exponent
   strings after schema failure, producing503 instead of400. Guarded canonical
   syntax/length before BigInt; unit and SQL regressions pass. No proposal existed.
2. Two clock reads could make a demo credential microscopically exceed the strict
   15-minute storage constraint, intermittently failing issuance. One materialized
   database timestamp now supplies creation and expiry. Repeated issuance test
   asserts exact 900-second lifetimes without relaxing the database limit.
3. A UI editing/formatting regression rendered ready-condition text and displayed
   preparation controls after revocation/selection change. Restored actual React
   conditionals. Browser regressions caught it; backend capability validation
   continued rejecting unavailable credentials. All 38 final browser tests pass.

Test/verification issues were corrected rather than waived: migration-count fixture
updated 2->3, expired-token fixture kept within the new demo lifetime constraint,
Next route-announcer ambiguity scoped to the actual error, and TypeScript fixture/
JSX syntax failures corrected. Initial baseline integration run needed local
loopback permission; the authorized rerun passed. No authentication, cryptographic,
nonce, tenant, financial or CI control was weakened.

## Remaining risks and human acceptance

- Bearer theft/XSS/operator compromise can access scoped policy/history and create
  bounded offchain proposals until revocation/expiry. Hash-only storage does not
  protect tokens stolen during use. This grants no custody or verifier authority.
- Independent credentials survive issuer session logout until explicit revoke,
  expiry or failed live permission checks. Demo memory clears on logout/unmount/
  selection/expiry; use explicit revoke for server invalidation. A lost issuance
  response requires metadata inspection/revocation; raw tokens are not recoverable.
- 128 retained credentials/proposals per mandate can be exhausted; rotation consumes
  a credential slot. Audit retention is not globally bounded. IP limits shared by
  NAT/proxy users can reduce availability. Distributed-load certification and
  independent security review have not been performed.
- Offchain consent/disable/revocation is not onchain authority or revocation. No
  real vault deployment/registration, budget reservation, attestation validation,
  execution or settlement occurs in M4. Digests prove neither truth nor provenance.
  M5 independent evidence and M6 receipts/reconciliation remain mandatory future
  boundaries. Existing M3 deployment-key/unknown-outcome risks remain unchanged.
- Human M4 desktop/physical Android testing is **pending**, following the exact
  runbook. Earlier M1/M2 owner confirmations are historical only. iOS deferred.
  No new wallet/device test or independent audit is claimed.

No unresolved owner credential-design decision remains. M4 integration review
requires final local gates plus foundation/rust on the delivered head; final merge
still needs owner authorization. Public deployment/keys/transactions require a
separate explicit decision. Do not treat this milestone as production approval.

## Delivery record

Branch: `feat/m4-agent-runtime`. The final commit SHA, draft PR URL and hosted
workflow are reported in the delivery response and PR description. No direct push
to staging/main, merge, public deployment, funds movement or visibility change.
No confirmed blocking implementation defect remains after the recorded corrections;
human M4 acceptance and independent review remain explicitly pending above.
