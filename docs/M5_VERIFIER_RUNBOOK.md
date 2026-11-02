# M5 verifier operations and manual acceptance

Status: procedures prepared; M5 human wallet/provider tests **not yet performed**.
Owner approved B2 independent human source verification and fresh NEP-413 decisions
(D016). This is not an automated provider integration or independent security audit.
iOS remains deferred. Never collect wallet secrets, auth bodies, signatures, cookies,
nonces or tokens as test evidence. Record only date/device, action, visible status,
HTTP error code and a redacted screen showing nonsensitive identifiers.

## Start privately

Use the existing environment, volume and certificates. Do not run setup:env over
an existing environment or replace the CA. From the repository:

```sh
docker compose -f compose.yaml -f compose.https.yaml up --build -d --wait
pnpm dev:https
```

Run `pnpm dev:https` only if the existing loopback proxy is not running. Visit
`https://127.0.0.1:8443/workspace`; auth/config must report that HTTPS origin.
`pnpm test:https` checks CA-validated TLS and challenge-cookie protections; it does
not prove Chrome trusts the CA. Follow the existing M1 HTTPS/USB runbook for device
CA installation and `adb reverse tcp:8443 tcp:8443`. Do not bypass browser TLS errors.
No LAN/public tunnel, database exposure or paid infrastructure is required.

## Roles and source boundary

Use existing wallets only. Owner creates an offchain-consented mandate with a
registered active agent, exact recipient/atomic budget, required claims and selected
verifier accounts. Select humans independent of the agent; separate account names
alone do not establish independence. An unassigned wallet must see no assignment
and must be denied direct evidence access. Verifier assignment grants no org roles.

Owner prepares an M4 proposal through `/workspace/proposals` with SHA-256 of the
exact source bytes. Evidence review link opens `/workspace/evidence?proposal=UUID`;
click **Open evidence**. Submit nonsensitive issuer/reference/type/size metadata.
The scoped agent API can also submit the identical metadata; it cannot verify it.
A different digest or metadata retry must fail, not overwrite the record.

The verifier must independently access their own authenticated provider portal or
issuer communication. Do not follow an agent URL or accept a screenshot/LLM prose
as source authentication. Validate recipient, amount, document digest, issuer,
reference and actual service activation/fulfillment. Invoice issuance alone is not
service delivery. Exact-byte hashing changes with every newline/encoding change;
a digest only identifies bytes, not truth. The optional file picker hashes locally
(maximum 5 MiB, allowlisted MIME), never uploads bytes. Do not use confidential
customer records for a demo. Provider credentials remain outside Avroqen.

For a wholly synthetic local rehearsal, select **Local exercise — never live
evidence**. Even correctly signed exercise records are SYNTHETIC_ONLY, excluded
from live quorum and transaction preparation. Do not select a genuine source class
for synthetic data to make readiness green. Real provider integration is not required
for B2, but the human must actually obtain the claimed authenticated source.

## Desktop and Android checklist — all pending human verification

1. Sign in as the selected verifier. Load assigned proposals, select one, click
   Open evidence. Confirm exact recipient/yoctoNEAR/network/vault and claim quorum.
2. Enter independently observed values, choose the supported claim/event/source,
   and check independence only when true. Review exact decision: section should
   scroll/focus on narrow screens and with reduced motion.
3. Cancel the Meteor review message. Expect neutral cancellation, no new decision,
   no blockchain transaction. Retry must request a fresh review challenge.
4. Approve only a **Sign Message** prompt with exact offchain review terms. If the
   wallet asks for a transaction or access-key creation, stop. Confirm the recorded
   human decision, provenance and expiry; NOT_DEPLOYED/NOT_SUBMITTED must remain.
5. Refresh and sign out/in: records persist, but no auth session substitutes for a
   fresh per-decision signature. Different wallet must not reuse the challenge.
6. When required, owner signs a separate OWNER_APPROVED payment decision using
   Owner decision source/event. M2 mandate consent is insufficient. One service
   signature cannot satisfy invoice quorum, another verifier's slot or owner approval.
7. Record PENDING when source is temporarily unavailable and UNVERIFIABLE when it
   cannot be established. No positive attestation candidate is created. For missing
   observations use the proposal's claimed fields only as identifiers, not claims
   of independent confirmation; leave independence unchecked and never APPROVE.
8. Mismatch recipient/digest/amount/issuer/reference or use invoice-only event for
   service: expect a stable rejection and no recorded approval.
9. An authorized wallet can sign DELIVERY_DISPUTED with DISPUTE/Disputed event.
   Further app approvals/preparations stop. This does not cancel dispatched transfers
   or deliver a real onchain dispute. A new proposal/proofs are needed for resolution.
10. Disable the proposing agent or revoke offchain consent; new review challenges
    must fail and prepared candidates must disappear. Existing immutable records remain.

Negative proofs, replay, concurrent consumes, expiry, Origin/CSRF and cross-tenant
access are automated with isolated PostgreSQL and synthetic cryptographic identities.
Do not hand-edit a real signed payload or share browser auth bodies to repeat them.
For manual expiry, prepare a review challenge and delay signing beyond five minutes;
expect rejection, then prepare a fresh review. A signed final record expires after
15 minutes (or earlier mandate expiry); the same signer/claim cannot be refreshed on
that proposal, matching M3 duplicate-attestation semantics. Use a new proposal.

## Operations and limits

Metadata is immutable, one submission/proposal; review/event records append-only.
Maximum 256 lifetime challenges and 128 decisions per evidence record. Final
VERIFIED/REJECTED/DISPUTED/SYNTHETIC_ONLY decisions are unique per signer/claim.
These bounds prevent unbounded review writes but canceled requests can exhaust the
challenge allowance; no reset bypass exists. New proposal requires owner-controlled
M4 capability. Temporary source decisions can be revisited within these limits.

Server clock controls expiry and rejects future observations. Keep browser and
server clocks synchronized. RPC outage or missing/restricted FullAccess key fails
closed. Raw review signatures are verified transiently, not persisted; immutable
records retain the bound human observation and public MAP-1 body. DB administrators
are outside append-only trigger guarantees; offchain status never authorizes spending.

Public testnet path and transaction approval prerequisites: [M5_MAP1_INTEGRATION.md](M5_MAP1_INTEGRATION.md).
