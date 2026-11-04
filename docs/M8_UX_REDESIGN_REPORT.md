# M8 UI/UX redesign report

Date: 2026-11-03. Branch: `feat/m8-integrated-acceptance`. PR #12 was found already merged externally at `0d5852e7038ad8d6114b6be508533d48a2ce6b86`; this redesign is delivered in successor draft PR #13 targeting staging. The identical pre-redesign staging tree was reconciled into the feature history without changing staging or main. This is frontend experience work, not deployment or full live acceptance.

## Implementation

- Shared navy sidebar, accessible mobile drawer, account/organization/Testnet topbar and server-invalidating sign-out.
- Consistent cards, typography, feedback, statuses, controls, technical disclosures, activity timeline and exact transaction summaries across Organization/wallet, Overview, Mandates, Agents & proposals, Verification, Payments and Security.
- Overview uses existing authorized API data with explicit scope, unavailable states and conservative next-action guidance. No fictional balances, charts or settlement events.
- Five-step mandate creation and six-step evidence review preserve original validation, exact values, independent-source declarations and separate wallet signatures.
- Security overview groups severity, incidents and monitoring; containment uses an accessible confirmation dialog and existing authorization.
- Production dependency set unchanged. Pinned dev-only axe tooling provides automated accessibility scans.

See [UI_DESIGN_SYSTEM](UI_DESIGN_SYSTEM.md) for components and behavior.

## Actual automated evidence

| Check | Result |
|---|---|
| `pnpm check` | PASS lint, TypeScript, 166 unit + 19 integration + 13 adversarial |
| `pnpm test:identity-db` | PASS 175 real PostgreSQL tests using isolated schemas |
| `pnpm build` | PASS optimized Next.js and TypeScript |
| `CAPTURE_UI=true pnpm test:e2e` | PASS 133 Chromium browser tests |
| Rust format / Clippy all targets `-D warnings` | PASS |
| Release Wasm build / method allowlist | PASS |
| Workflow validation / Gitleaks secret scan | PASS; no leaks found |
| Rebuilt containers / PostgreSQL / smoke / trusted HTTPS | PASS; non-root images, no environment/Git metadata, host-only Secure/HttpOnly/SameSite challenge cookie, wrong-origin rejection |
| `cargo test --workspace --locked -- --nocapture` | PASS 33 unit + 7 local NEAR sandbox |

Total: **546 tests** (373 application/database, 133 browser, 40 Rust/sandbox), zero failures or skipped tests in these suites. Browser coverage adds 66 tests to the existing 67; unit coverage adds four dashboard status cases. Existing auth, immutable consent, evidence, financial refresh and emergency-control regressions remain passing.

Browser checks cover seven routes at 1440/768/390/320px, all seven in signed-out/loading/empty/error states, drawer Tab/Escape/focus, wizard validation/back/exact-value retention, tenant observation clearing and logout failure/success/CSRF. Axe WCAG 2 A/AA and 2.1 AA checks passed in 28 populated route/width combinations and six guided states. These scans do not prove all accessibility requirements or real-device behavior.

Development failures corrected before the final run: explicit step wrappers prevent formatter-driven fragment flattening; native drawer focus escape is corrected with Tab wrapping; selectors use accessible combobox roles; the offscreen skip-link is visually hidden until focused, including scrolled full-page captures, with a keyboard regression. No security assertions or tests were disabled.

## Rendered visual evidence

Actual Playwright browser captures, visually inspected as desktop/mobile contact sheets and selected full-size views. All use clearly labeled **synthetic API fixtures**, not live wallet/payment evidence.

| Screen | Desktop | Mobile |
|---|---|---|
| Overview | [1440](evidence/ui/overview-1440.png) | [390](evidence/ui/overview-390.png) |
| Organization | [1440](evidence/ui/wallet-1440.png) | [390](evidence/ui/wallet-390.png) |
| Sign-in | [1440](evidence/ui/sign-in-1440.png) | [390](evidence/ui/sign-in-390.png) |
| Mandates | [1440](evidence/ui/mandates-1440.png) | [390](evidence/ui/mandates-390.png) |
| Mandate wizard | [1440](evidence/ui/mandate-wizard-1440.png) | [390](evidence/ui/mandate-wizard-390.png) |
| Proposals | [1440](evidence/ui/proposals-1440.png) | [390](evidence/ui/proposals-390.png) |
| Verification | [1440](evidence/ui/verification-1440.png) | [390](evidence/ui/verification-390.png) |
| Evidence document step | [1440](evidence/ui/evidence-document-1440.png) | [390](evidence/ui/evidence-document-390.png) |
| Payments | [1440](evidence/ui/payments-1440.png) | [390](evidence/ui/payments-390.png) |
| Security | [1440](evidence/ui/security-1440.png) | [390](evidence/ui/security-390.png) |

Inspection led to collapsing evidence lookup and technical IDs after selection, compact security columns and consistent severity layout. Focused wizard screenshots intentionally show focus/scroll feedback. No horizontal overflow was detected at tested widths.

## Security review and remaining acceptance

Diff is limited to frontend, tests/smoke assertion, test dependency and documentation/evidence. Backend, database schema, Rust and wallet transaction reconstruction are unchanged. The smoke assertion now matches the truthful public-authorization disclosure while retaining the API payments-disabled assertion. Original-owner and tenant boundaries, independent evidence, distinct payment approval, receipt confirmation, unknown quarantine, pause-only guardian authority and incident integrity remain enforced by existing services/contracts. Dashboard guidance does not grant authority. Self-review is not an independent security assessment.

Historical owner-confirmed M1/M2 tests remain historical; this redesign has not been physically tested on Android or with genuine wallet/source flows. Pending: coordinated desktop and physical Android integrated acceptance, screen-reader/manual accessibility review, genuine independent verifier evidence/signing and separately authorized public Testnet receipt verification. iOS remains deferred. Responsive viewport tests are not device acceptance. Dark mode is intentionally not introduced. No deployment, funding, transaction, key rotation or visibility change is authorized or performed.

Hosted CI and final commit are reported in the successor draft PR metadata and the delivery message; older green checks do not certify this redesign.
