# Avroqen UI design system

## Direction and tokens

Light fintech workspace: navy navigation, off-white canvas, restrained emerald actions. Source of truth: `apps/web/app/styles.css`.

| Token | Value / use |
|---|---|
| Navy / ink | `#102638` / `#162d3d` |
| Canvas / surface | `#f4f6f8` / white |
| Emerald | `#08745e`, hover `#065844` |
| Muted / border | `#60717f` / `#dce3e8` |
| Warning / danger | Amber/red with text labels, never color alone |
| Spacing / radius | 8px base; 14px cards; 8px controls |
| Typography | Local system stack, Inter when already installed; 14px body, 1.55 line height |
| Motion | 140ms controls; reduced-motion removes transitions and smooth scrolling |

No remote fonts, analytics, image service or production UI dependency is introduced. Icons are local decorative SVGs. Layout adapts to narrow screens; verified widths: 320, 390, 768 and 1440px. Controls have a 44px minimum height, visible keyboard focus and disabled states.

## Components and navigation

`components/shell.tsx` owns desktop sidebar, active route, mobile modal drawer, topbar public account/organization/network and server-invalidating sign-out. Public identity is React context only. It does not persist session material. Navigation retains existing routes: Overview (journey), Mandates, Agents & proposals, Verification, Payments, Security, Organization.

`components/ui.tsx` provides PageHeader, Card, Metric, Badge, EmptyState, LoadingState, Feedback, TechnicalDetails, Timeline, Dialog, GuidedForm, FormReview and TransactionSummary. Buttons, icon buttons, inputs, responsive record cards, summaries and tables share CSS primitives and semantic native elements. Dialog uses native modality, explicit keyboard wrapping, Escape handling and focus restoration. Emergency controls remain distinct from ordinary actions.

## Guided interactions

Mandate creation has five steps; independent verification has six. Each step is an explicit child wrapper. All inputs remain mounted to preserve exact values, with inactive steps hidden. Continue validates current fields; final submit checks all required inputs and exposes the first invalid step. Enter cannot prematurely submit an unfinished wizard. Back preserves exact decimal strings, including one yoctoNEAR. Progress, focus and scrolling identify the active step; reduced-motion users get immediate movement.

Saving a draft does not approve it. Existing wallet review and signing remain separate. The evidence wizard never computes source independence or signs on behalf of a verifier. Local hashing proves byte integrity only. TransactionSummary displays network, signer, receiver and method; the existing immutable transaction reconstruction remains authoritative. Technical identifiers/atomic values stay inspectable in disclosures.

## Data and authority

Overview uses authorized existing endpoints. Metrics label loaded-record/selected-mandate scope; unavailable values are not zero. Confirmed payment counts require the verified execution outcome and explorer reference. Recommended next action is advisory, including distinct per-claim quorum and original-owner approval; it never authorizes execution. Changing organization clears previous observations. Unknown operations stay visible and quarantined.

Sign-out fetches a fresh session and submits the CSRF-protected server logout; failure retains the session and displays an error. No backend, contract, wallet signature format, role or accounting rule changes.

## Verification and maintenance

See [redesign report](M8_UX_REDESIGN_REPORT.md) for screenshots, test counts and limitations. Test-only pinned `@axe-core/playwright@4.14.0` adds axe-core 4.14.0; neither is imported into production code. Lockfile review found no unrelated dependency upgrades. Automated axe checks supplement keyboard and visual inspection; they are not a full accessibility certification.
