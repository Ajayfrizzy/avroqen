# M1 findings and required disposition

**Current integration disposition (2026-11-01):** the owner permits M1 hackathon
testnet integration without an external independent audit. No confirmed critical
or high-severity blocking defect was identified in the reviewed M1 paths at
`c0d4063197432a65bd9a936a526b7c1ef51ee338`; foundation/rust passed in
[run 41317104005](https://github.com/Ajayfrizzy/avroqen/actions/runs/41317104005).
This supersedes older draft-only/unpushed/independent-review-as-integration-gate
language below. Independent review remains NOT PERFORMED and this package remains
its handoff, not an audit. Residual risks and manual gaps remain open; iOS is
deferred. See ../../archive/milestones/M1_REPORT.md for the current scoped acceptance and merge boundary.


This is an implementation-team review inventory, not independent audit findings.
Severity describes the boundary at risk, not a claim of observed exploitation.

| ID | Finding / risk | Disposition | What can close the evidence gap |
| --- | --- | --- | --- |
| M1-R01 | SDK-native key/signature objects failed strict request validation (availability/compatibility) | Fixed in baseline; real desktop login confirmed | Automated serialization/schema/crypto regression passes; independent review checks encoding assumptions |
| M1-R02 | Explicit signing cancellation appeared as generic outage | Fixed in baseline; desktop cancel/retry confirmed | SDK-shape and UI retry tests pass; actual Android cancellation/retry is owner-confirmed; separate popup variants remain pending |
| M1-R03 | Two SDK V1 console calls bypassed disabled logging and exposed connection/proof data (sensitive data exposure) | Logging-only pinned patch in baseline; installed-artifact gate passes | Tests establish those calls are removed. Independent dependency-wide data-flow/message-origin review remains OPEN; do not claim the SDK audited |
| M1-R04 | Session/nonce rollback when successful-login audit fails lacked explicit integration evidence | Additional local PostgreSQL regression added | Injected audit failure must yield sanitized 503, zero sessions, unconsumed challenge; recovery retry succeeds. This is automatically resolvable, not a reason to weaken audit requirements |
| M1-R05 | Trusted HTTPS/device cookie behavior lacked an executable local setup | Local TLS proxy, CA tooling and strict HTTPS origin override prepared | Automated CA trust/rejection, fixed-routing/Host guards, secure challenge-cookie headers and wrong-Origin checks; Android remote DevTools TLS and displayed session attributes are owner-confirmed; issuance/deletion no-Domain and challenge-cookie protection now have real-route regressions, not a claim of all browser enforcement attacks |
| M1-R06 | Finalized RPC is a trusted service; revoking a wallet key does not immediately revoke an existing app session | Explicit approved design limit, not silently fixed | Tests cover parser permissions and absolute 15-minute expiry. Independent human assessment/owner policy review is needed for changed trust/revalidation design; more mocks cannot prove RPC honesty |
| M1-R07 | Same proxy peer shares rate budgets; expiry/audit retention, ingress/CSP and least-privilege production DB policy remain unresolved | Operational limits; no public deployment authorized | Automated abuse/load/retention tests can validate a selected policy. Independent/owner review must choose that policy before production changes |
| M1-R08 | Session/membership revocation contention requires deterministic interleaving evidence | Two scheduled PostgreSQL lock-wait regressions now pass: committed session/membership revocation blocks the waiting agent mutation | Audit rollback and the two scheduled orderings pass; other orderings and lock-graph review still require independent assessment |
| M1-R09 | Remaining negative wallet compatibility cases and independent acceptance | Desktop/Android positive flows and Android isolation/TLS/session attributes confirmed; iOS explicitly DEFERRED | Use NEGATIVE_AUTH_CASES.md for unobserved cases; no automated pass is labeled a human/independent pass |

No newly demonstrated backend authorization bypass was found in this supplement.
That statement is limited to inspected paths and executed tests, not proof of
absence. Unsupported mobile/native bridge flows remain blocked/pending; do not add
transactions, access-key creation, trust bypasses or broader key permissions to
force wallet compatibility. No material identity/financial authority decision has
been changed by the private HTTPS setup.

Automated findings can be fixed and retested by implementers. Independent review
requires a reviewer independent of this implementation; a self-review, another
agent invocation, or a green CI badge cannot substitute for that assurance.
