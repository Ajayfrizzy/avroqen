# M9.1 SAMPLE content and isolation contract

M9.1 established the content, route specification and offline regression checks.
M9.2 now implements the six static pages, dedicated SAMPLE layout, ordinary-link
navigation and public landing link. No route handler, API or server action is added.
The original immutable dataset is preserved byte-for-byte. This implements preparation for [PRD F11](PRD.md), not full
[M9 acceptance](MILESTONES.md) or the outstanding [M8 live gates](TEST_PLAN.md).
The accepted design is a separate public `/demo` tree using the existing visual
language; authenticated `/workspace` remains unchanged.

## M9.2 implementation and reviewed exceptions

The public walkthrough renders only the original `SAMPLE` values and explanations.
A server-rendered shell uses literal links, including previous/next and always
visible mobile navigation; no drawer/client state is needed. Native disclosures
and core navigation work without JavaScript. Every fictional card is marked SAMPLE;
the sticky fictional-data notice cannot be dismissed. No network is connected.
Unknown steps return not-found; five generated step params plus `/demo` form the
closed route tree. Pages never read search params, cookies, headers or identity.

Two narrow import additions were reviewed: Next `notFound` and the existing
`atomicToNear` export via its relative source path. Only that domain export is
allowed; domain policy/auth schemas, other modules and package-wide imports stay
blocked. The domain module imports Zod and re-exports the read-only vault module;
neither performs I/O. Both sources are now pinned for renewed review on change.
The formatter retains at least two decimal places and all finer atomic precision.
The only new fragment link is the literal skip target `#demo-content`.

The Next config change adds no-referrer, DENY framing and nosniff only to `/demo`;
existing API rewrites, workspace headers and authentication are preserved. Its pin
is updated after reviewing this exact addition. No shared UI/root layout or live
configuration changes. App-wide source availability is not a separate-origin
security sandbox; existing cookies can accompany navigation but are never read.
No Content Security Policy is configured by this change. Before any public hosting,
define and separately review a CSP against the complete application and wallet
requirements, test it in report-only mode where appropriate, then verify enforcement
without weakening the demo isolation boundary. Current header checks do not satisfy
that pre-public-hosting security requirement.

Rendered tests exercise all six routes, synthetic-cookie equivalence, request and
wallet/storage tripwires, queries, HTTP 404s, exact amounts, native disclosures,
no-JavaScript reading/navigation, keyboard focus, four widths and axe checks.
These tests use a disposable local frontend without backend/database services;
SAMPLE test results cannot pass M8 live acceptance. Actual run outcomes are reported
separately; physical Android and manual screen-reader inspection remain M9.3 work.

M9.2 local validation: 270 unit, 67 integration and 133 adversarial tests passed;
14 focused Chromium tests passed (13 SAMPLE plus the existing landing regression),
with zero final failures/errors/skips. Lint, root/web typechecks and production
build passed. The prerender manifest contains exactly the six specified demo
routes. Chromium checks include six routes in empty and synthetic-cookie contexts,
axe, request/wallet/storage tripwires, ignored URL selectors, HTTP 404s,
no-JavaScript navigation and 320/390/768/1440px keyboard/reflow checks. Four local
SAMPLE screenshots were captured in ignored test output; desktop/mobile outcomes
were visually inspected. These are real local frontend renders with fictional
SAMPLE content, not public-chain or real-wallet acceptance.

Initial integration/browser startup hit loopback sandbox EPERM; temporary local
listener/browser permission allowed the unchanged fixture services to run. Initial
browser execution had 8 passes and 6 failures: a real sidebar contrast issue and a
badge selector ambiguity were fixed without disabling assertions. A strict test
cookie-descriptor typing error was also corrected. Docker daemon access remains
denied; Docker-backed workflow/secret scanners and image isolation were not
verified here. Scoped source heuristics and documentation/whitespace checks passed;
manual screen-reader, physical-device and full M8 acceptance remain outstanding.

The M9.1 specification below preserves the original design and baseline review.
Future-tense statements describe those original requirements; implemented coverage
is identified above and in the validation report, not inferred from the plan.

## Closed route specification

| Path | Read-only content | Navigation intent |
|---|---|---|
| `/demo` | Sample Studio, task and authority boundaries | Start or jump to a step |
| `/demo/mandate` | Immutable illustrative limits and required review | Inspect terms, not create/fund |
| `/demo/proposal` | Pre-authored restricted-agent proposal | View sample submission, not submit |
| `/demo/review` | Independent-source checks and precise claim scope | Read explanation, not attest |
| `/demo/outcomes` | Within-policy/rejected scenarios and pending/unknown explanations | Compare examples, not approve/pay |
| `/demo/evidence` | Narrative audit links, evidence classes and remaining acceptance | Inspect limitations |

`SAMPLE_ROUTES` and exact `sampleRoute(unknown)` lookup are the sole route list.
Unknown paths fail closed. The lookup accepts no query, fragment, URL, ID, encoded
path, normalization or network selector. A future router must validate the step
against this list; ordinary queries must never choose data, identity, origin or
live mode. No runtime input, upload, API mocking layer or URL-driven dataset.
Future pages should be pre-rendered with direct links, previous/next navigation
and an unknown-step not-found result. No automatic link into authenticated flows.

## Single display dataset

`apps/web/app/demo/sample-data.ts` exports the deeply frozen `SAMPLE` version 1,
synthetic `sample-*` identifiers and role aliases. Its types are inferred readonly
display types, not production mandate/intent/accounting schemas. It imports no
application or network code. Supporting negative fixtures are inert source strings
in tests; no second runtime dataset, private key or signed payload is provided.

| Term | Illustrative value | Atomic units (10^24 per NEAR) |
|---|---|---|
| Total policy ceiling | 0.10 NEAR | `100000000000000000000000` |
| Per-payment cap | 0.05 NEAR | `50000000000000000000000` |
| Permitted example | 0.04 NEAR | `40000000000000000000000` |
| Rejected example | 0.07 NEAR | `70000000000000000000000` |

At most two executions; fixed illustrative time context, not a live deadline.
Amounts remain decimal atomic strings, tested using existing checked conversion
helpers and BigInt, never floating-point token arithmetic. The rejected example
is below the total ceiling but above the per-payment cap. No available balance,
deposit, reservation, spent value, account, transaction or chain record is created.
Only the existing pure conversion helpers may be considered for future renderer
reuse after import review; the current demo contract needs no domain dependency.

Within-policy is **not authorization**. Both examples retain `NOT_GRANTED`,
`ILLUSTRATIVE_ONLY` and `NOT_SUBMITTED`. The accepted narrative still requires
original-owner per-payment approval. No signature, attestation, actual source
verification, quorum or payment is inferred. An invoice claim does not prove
delivery; a hash proves bytes, not truth or independent access. Unknown means no
blind retry or timeout release. Pause/revoke cannot reverse dispatched transfers.

Every synthetic display card carries its own visible `SAMPLE` label. The future
layout must always show: **SAMPLE — Fictional data. No wallet connection or
transactions.** No dismiss control. Label screenshots/crops independently. Show
“No network connected”, never a live Testnet badge or wallet identity.

The evidence page distinguishes SAMPLE, automated fixture, local sandbox and
owner-verified public Testnet evidence. The dataset embeds none of their real
records. Any future link to the [existing deployment report](DEPLOYMENT_KEY_GATE_REPORT.md)
must remain a separately reviewed provenance reference: deployment/initialization
is not a payment receipt, fresh observation or proof of Primary control. Current
literal-link checks deliberately permit only the six routes and `/`; changing
that policy requires a reviewed narrow exception, not arbitrary external URLs.

## Enforced source/import boundary

`tests/support/sample-isolation.ts` parses, never evaluates, all demo TS/TSX source
using the parser bundled with pinned Next.js. Existing default unit/adversarial
commands run these checks without a new script or dependency. Imports are closed
to files present under the demo directory, selected React presentation hooks,
`next/link`, `usePathname` and named reviewed UI primitives. Missing dependency
targets, namespace/side-effect/dynamic imports, wildcard re-exports and handlers
fail. Local dependency files are checked too. Symlinks and unreviewed asset types
fail source discovery.

No wallet SDK, auth/session helper, API client, RPC, financial operation, archived
Primary module, workspace page or `AppShell` import is permitted, including type
imports. Selected `components/ui.tsx` primitives may be reused; `GuidedForm` is not
allowed. UI imports, root layout and Next config are SHA-256-pinned in tests so
changes require renewed review. No shared component or Next config is changed now.

The guard rejects network/browser-identity/storage/eval capabilities, computed
access that can conceal them, server-action directives and active/network markup.
Links must be literal members of the closed presentation navigation policy.
It is intentionally restrictive and is a regression gate, **not a JavaScript
sandbox, whole-program proof or defense against malicious same-origin code**.
New helpers, capabilities, assets and parser/toolchain updates require review;
do not silence the gate or update pins without inspecting the change.

## Global layout, cookies and route behavior

At this baseline the root layout imports global CSS and metadata; it reads no
session. No Next middleware/proxy entrypoint was found. Tests detect new known
middleware/proxy paths and changes to reviewed globals. CSS currently contains
one inline decorative SVG; remote CSS/imports are rejected by the regression.
Existing `/api` rewrites and `/workspace` headers do not authenticate `/demo`.
No headers, cookies, middleware, feature flags or authentication behavior change
in M9.1. `/demo` headers and rendered-route tests remain M9.2 review work.

Browsers may send same-origin cookies on navigation. Future demo rendering must
not read them or import identity state; empty and synthetic-cookie contexts receive
the same static sample. This test does not establish an authenticated session. No
auth request, session refresh, logout, storage write,
bearer or CSRF token is involved. Existing API authorization remains mandatory:
the demo is not a separate-origin security sandbox or a new authorization mode.

## Acceptance checks and remaining renderer tests

Implemented offline gates: exact route set and selector rejection; recursive
immutability; exact amount bounds; per-card labels; no authorization/settlement
inference; evidence-class separation; no real-address/signature/chain fields;
prohibited imports (including aliases and type imports), hidden local dependencies,
requests, storage/identity reads, dynamic loading, active markup and server actions.
Adversarial snippets are parsed strings only; no wallet/network/signing code runs.

Before any visual/demo release, add Playwright checks against real rendered pages:

- Abort and fail on demo-triggered `/api`, RPC, wallet, external requests, popups,
  workers, beacons or sockets; allow only reviewed app/static navigation assets.
- Fail on storage/cookie writes, wallet provider access, signing or transaction
  attempts. Compare content with empty and synthetic-cookie contexts; never use real
  sessions. A cookie fixture is not authenticated-session evidence. No financial
  forms, server actions or mutation handlers may exist.
- Assert persistent and per-card labels, no synthetic success toast, live balance,
  transaction hash or explorer link. Queries cannot change content or identity.
- Keyboard: skip link, logical headings/landmarks, visible focus, direct/previous/
  next links and `aria-current`; no color-only meaning. The implemented shell uses
  ordinary links and has no drawer or drawer-specific focus behavior.
- Widths 320, 390, 768 and 1440px, 44px controls, 200% zoom/reflow, no horizontal
  page overflow; reduced motion; no autoplay or required animated transitions.
- With JavaScript disabled, all narrative content and ordinary route links remain
  accessible; mobile navigation must have a non-JS fallback. No form wizard is
  required merely to read. Run axe plus manual keyboard/screen-reader and physical
  mobile inspection; automated scans are not a complete accessibility audit.

At M9.1 these rendered/browser checks were pending because no pages existed.
Reuse [UI_DESIGN_SYSTEM](UI_DESIGN_SYSTEM.md) presentation
primitives and existing `tests/e2e/design-system.spec.ts` conventions, not their
authenticated API fixture layer. Keep pure data and source checks in unit and
adversarial suites. No new CI workflow hook or live integration is introduced.

### M9.3 targeted responsive and accessibility corrections

Card summaries use container queries, with a single-column fallback when space is
limited; wide comparisons retain two columns. Role-card spacing, bounded prose,
readable evidence headings and a 44px brand-link target refine the existing shell.
Readable labels derive from unchanged status codes; optional disclosures retain
the exact codes. Eligibility is not authorization, submission is not payment and
unknown is not confirmed failure. Each of the six routes has a distinct SAMPLE
document title, including direct navigation and refresh. The immutable dataset
and ordinary-link navigation remain unchanged.

Offline validation: 272 unit, 67 integration and 133 adversarial tests passed;
14 focused Chromium tests passed. Integration initially hit sandbox loopback
restrictions, then passed unchanged with temporary listener permission. Lint,
root/web typechecks and production build passed. All six routes were captured at
320, 390, 768 and 1440 CSS pixels: 24 additional axe scans found no violations,
and measurements found no horizontal overflow or prohibited requests. Six CSS
200% magnification checks and six 720px reflow proxies passed; these are simulated
checks, not genuine browser zoom. Physical Android, manual assistive technology,
native zoom and other browser engines remain unverified. Docker-backed workflow
and secret scanners were unavailable locally; scoped static checks are not a
security audit. These results do not establish M8 live acceptance or M9 release
readiness.

## Delivery and authorization boundaries

M9.2 implements static pages/shell, scoped headers and browser isolation tests;
M9.3 refines responsive/accessibility behavior; subsequent review prepares judge
instructions and evidence captures. Hosting, publication and submission remain
separately authorized under [the submission checklist](HACKATHON_SUBMISSION.md).
No SAMPLE pass completes M9's genuine hosted Testnet demonstration requirement.

Outstanding M8: real independent-source access; designated-verifier and distinct
owner signatures; actual authorized settlement/accounting/recipient delta;
emergency/recovery results and physical Android wallet acceptance. No source/file
provenance, contract enforcement, deployed-state observation or independent audit
is established by this dataset. iOS stays deferred.

D026 still stops the private Meteor integration. **Primary proof BLOCKED. Temporary
Testing FullAccess key RETAINED. Financial operations DISABLED.** No wallet message,
live challenge, contract call, key change or live configuration is authorized.

## M9.5 judge documentation status

The [canonical judge walkthrough and evidence ledger](M9_JUDGE_DEMO.md) is prepared
for documentation review. It records the six-step presentation, evidence classes,
acceptance boundaries, local reproduction and human release gates without changing
this contract or the immutable SAMPLE dataset. The linked
[M9 artifact manifest](evidence/m9/README.md) is intentionally empty: no screenshot,
recording, hosted capture, hash or publication is claimed. M9.5 documentation does
not complete M8 live acceptance or full M9 release readiness.
