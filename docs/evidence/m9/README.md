# M9 judge screenshot evidence manifest

**Status:** nine local SAMPLE screenshots recaptured on November 8, 2026. These
are genuine renders of fictional SAMPLE pages, not wallet, authenticated-session,
public-host, physical-device, source-evidence, financial-authorization or
blockchain-settlement evidence. All nine recaptured files were manually inspected;
capture and inspection do not authorize publication.

## Capture session

| Field | Recorded value |
| --- | --- |
| Evidence classification | `SAMPLE` — fictional judge walkthrough only |
| Base source Git SHA | `ad0be88c8c8faddd6c8840fc8b3822bc99951af4` |
| Screenshot artifact commit | Not yet committed; source attribution is intentionally separate |
| Capture script SHA-256 | `fd8f0182bcb7035070f93a066f4602811cabfc3cc0d34603f30b36d790956ad8`; uncommitted evidence tooling, excluded from rendering inputs |
| Immutable SAMPLE dataset blob | `31b5475496e942847e41725cc663f4a319fce105` |
| Base origin | `http://127.0.0.1:3000` |
| Build mode | Fresh local production build created by the capture workflow after deleting the prior `.next`; all tracked and untracked rendering inputs matched the base source SHA |
| Build command | `pnpm --filter @avroqen/web exec next build` (performed by the capture script) |
| Build ID | `UfSMoK-NBhEZGoHjZAtQZ` |
| Capture tool | Playwright Chromium via `scripts/capture-m9-screenshots.mjs` |
| Capture command | `node scripts/capture-m9-screenshots.mjs` |
| Playwright package | `@playwright/test` 1.64.1 |
| Browser | Chromium 156.0.8078.4, headless isolated contexts |
| Operating system | macOS 27.0.1 (26A434), arm64 |
| Desktop viewport | 1440 × 900 CSS pixels |
| Mobile viewport | 390 × 844 CSS pixels; Chromium viewport emulation, not physical Android verification |
| Screenshot mode | Full page; output height expands to include the complete document |
| Device-pixel ratio | 1 |
| Zoom | 100% native CSS scale; no simulated or native browser zoom |
| JavaScript | Enabled |
| Color scheme | Light |
| Reduced motion | `reduce` |
| Locale | `en-US` |
| Stored browser state | None; fresh non-persistent context per image, isolated HOME/TMPDIR, no cookies or authorization headers |
| Observed browser requests | 9 exact SAMPLE documents, 63 same-origin Next static assets, 0 favicon requests; zero unclassified requests |

The workflow used a reviewed minimal environment for build, server and browser
processes. It did not pass arbitrary shell variables, `.env` values, tokens or
wallet configuration. The server bound only to `127.0.0.1:3000`. Document
requests were limited to the six exact approved SAMPLE paths using GET or HEAD;
only same-origin `/_next/static/` assets and `/favicon.ico` were additionally
allowed. Unknown SAMPLE paths, APIs, RPC, authenticated routes, external origins,
credential-bearing requests and unexpected methods were blocked and reported.

## Artifact inventory

All timestamps are UTC. SHA-256 values cover the exact PNG bytes in this directory.

| File | Route | Viewport CSS px | Image px | Captured | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `sample-start-1440.png` | `/demo` | 1440 × 900 | 1440 × 1086 | 2026-11-08T15:42:33.543Z | `59c6ac66e12c082fabf7e2031cfcf97bdfc58be4476a7870fed7fda67b8016e9` |
| `sample-mandate-1440.png` | `/demo/mandate` | 1440 × 900 | 1440 × 1057 | 2026-11-08T15:42:34.198Z | `3d35e142fab045429f7444ace1653f28ecbbe48bbba5eb34bbaa198d23c0bcf6` |
| `sample-proposal-1440.png` | `/demo/proposal` | 1440 × 900 | 1440 × 984 | 2026-11-08T15:42:34.832Z | `2aae06ab834d3ff89fdba249844ead9351e63f50cffa347d068aa45f56789e32` |
| `sample-review-1440.png` | `/demo/review` | 1440 × 900 | 1440 × 972 | 2026-11-08T15:42:35.466Z | `422736fec96f4ea572e1a731cd78562942ab9ea1e4b1795ad17f08403d26ed00` |
| `sample-outcomes-1440.png` | `/demo/outcomes` | 1440 × 900 | 1440 × 1660 | 2026-11-08T15:42:36.112Z | `001dc176037acdabc5ac20744f5ed99b42115bf78079b70869a34a1be54da79d` |
| `sample-evidence-1440.png` | `/demo/evidence` | 1440 × 900 | 1440 × 1936 | 2026-11-08T15:42:36.781Z | `8f1fd6c8ce8769b21148b75d7c24495a932c6e2c6922bedea21c721fe167b72a` |
| `sample-start-390.png` | `/demo` | 390 × 844 | 390 × 1776 | 2026-11-08T15:42:37.425Z | `605c9c4fe98ca7612ea55a8f224f00073313b2ae55747c60730a1a6e94e07a0a` |
| `sample-outcomes-390.png` | `/demo/outcomes` | 390 × 844 | 390 × 2781 | 2026-11-08T15:42:38.083Z | `45ad99339aae95a45ad17b43a183d217d1991073c52716e0ad14254bb4f0d6f1` |
| `sample-evidence-390.png` | `/demo/evidence` | 390 × 844 | 390 × 2961 | 2026-11-08T15:42:38.743Z | `d3429b0ccfa100fa0e3c5fe7b0e79602d52df1f2d625a1d4452d0478eda1b005` |

## Automated capture validation

Before publication, the capture workflow verified:

- The pinned base SHA, immutable SAMPLE blob and clean rendering-input set.
- A fresh successful production build tied to that source.
- Exactly nine approved names/routes, complete PNG structure, expected widths,
  full-page heights and matching manifest hashes.
- HTTP 200, font readiness, two animation frames and network idle.
- DOM text presence for the fictional-data notice, “No network connected” and a
  SAMPLE label in every rendered card. Visual visibility requires the separate
  manual inspection below.
- One `h1`, one `main`, and no form, input, iframe or horizontal overflow.
- No misleading payment-success wording or rendered user-bound account, Ed25519
  key, credential, protected path or protected evidence.
- No popup, worker, WebSocket, unclassified request, wallet-provider access,
  cookie read/write, storage mutation, IndexedDB open, beacon or cookie.
- Safe non-symlink publication targets and rollback-protected set replacement.

Automated checks are not a manual visual review, accessibility audit,
physical-device test, wallet test or financial acceptance result.

## Manual visual inspection

The coding agent inspected all nine exact published PNGs on
**2026-11-08T15:42:53Z** with the local image viewer. The persistent fictional-data
notice, “No network connected,” page title, navigation, SAMPLE labels, complete
cards, Previous/Next controls and footer were visible where applicable. The
approved amounts and limits were legible; policy eligibility, owner authority,
independent review, pending/unknown outcomes and deployment-only evidence remained
distinct. No image presented a SAMPLE outcome as a completed payment.

The full-page desktop and emulated-mobile images contained the intended content
without a missing card, overlapping content, horizontal overflow or unexpected
clipping. No browser chrome, user identity, credential, signature, wallet address,
private evidence, notification or machine-specific path was visible.

This was a coding-agent visual inspection, not an independent security or
accessibility review.

Physical Android, manual screen-reader, native zoom, non-Chromium, hosted and
public-URL validation remain outstanding. Publication approval remains pending.

Deployment/initialization evidence is not payment evidence. These screenshots do
not establish a funded mandate, genuine independent source, verifier or owner
signing, public payment, recipient delta, Primary-key control, Testing-key
retirement or independent security audit. Primary proof remains **BLOCKED**, the
temporary Testing FullAccess key remains **RETAINED**, and financial operations
remain **DISABLED**.
