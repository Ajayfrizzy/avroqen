# MAP-1 — Mandate Attestation Protocol

**Internal protocol design, NOT a NEAR standard.** The verifier's attestation communicates a scoped claim; it is not inherently proof that the physical-world claim is true.

## Trust roots
Owner explicitly binds a verifier NEAR account (or quorum) to mandate + allowed claim types. Every designated third-party verifier must be distinct from the mandate owner, restricted agent, exact recipient and vault account. Verifier independently fetches evidence from authenticated issuer/provider or a human authorized to approve. AI-supplied URLs, screenshots and text are suggestions only, never authoritative proof. No app administrator self-appointment of verifiers.

## Canonical fields
`protocol_version`, `network_id`, `vault_account`, `mandate_id`, `policy_version`, `proposal_id`, `asset_id`, `recipient`, `amount_atomic`, `claim_type`, `evidence_digest`, `verifier_account`, `nonce`, `issued_at_ns`, `expires_at_ns`.

## v1 verification
Authorized verifier directly submits onchain attestation from its own NEAR account. Contract checks authenticated predecessor identity, mandate registration, all exact bindings, expiration, nonce uniqueness and allowed claim type. Agent may reference an attestation but may not register it as trusted. Do not infer independence merely from a different process/container if keys share custody with agent/backend.

## Evidence classification
- `INVOICE_ISSUED`: attests that a provider issued an invoice with matching fields; does **not** prove delivery.
- `SERVICE_CONFIRMED`: independent source attests to a specific service activation/fulfillment event; define exact semantics per adapter.
- `OWNER_APPROVED`: separate original-owner per-payment approval when required by the mandate, additional to the distinct designated-verifier quorum for each required third-party claim; it cannot substitute for that quorum or independent evidence.
- `DELIVERY_DISPUTED`: terminal for the proposal; no resolution transition restores its eligibility. An offchain dispute blocks application readiness; contract dispatch is blocked only after the separately authorized onchain dispute is included. It cannot cancel an already-dispatched transfer and is not a generic AI confidence rating.

## Anti-replay / privacy
One-time attestation nonces and proposal binding. Store minimal onchain digest; full evidence encrypted/access-controlled offchain, with retention policy and deletion/consent requirements. Use SHA-256 digest for bytes with documented canonicalization; hash is integrity only, not confidentiality. Never place sensitive invoice contents on public chain.

## Compromised verifier
Stolen verifier key can falsely attest within its delegation. Limit mandate spend, whitelist claims, enable revocation, optional independent quorum, require owner approval for high-risk conditions, flag anomaly. No truthful-evidence guarantee without source validation. Define disputes and emergency suspension.

## Required negative tests
Wrong network/vault/mandate/proposal/version/asset/recipient/amount/claim; owner/agent/recipient/vault designated as a third-party verifier; expired attestations; mismatched evidence digest; reused nonce; unregistered signer; attestation after verifier revocation; compromised verifier simulation. Each must fail without moving funds.

## Application review and onchain attestation boundary

MAP-1 has the 15 canonical fields listed above. u128 atomic amounts and u64
nanoseconds are canonical decimal strings; UUIDs/digests are canonical lowercase.
The M5 NEP-413 message binds the exact MAP-1 body, immutable policy digest,
organization, proposal/source assessment and metadata digest, full human source
observation, review action, Origin, initiating-session binding, single-use challenge
ID and expiry. The 32-byte CSPRNG NEP-413 transport nonce is distinct from the
MAP-1 UUID nonce. [Current human-evidence contracts](IMPLEMENTATION_SPEC.md#human-evidence) specify fresh FullAccess verification,
atomic challenge consumption and the human-source trust limits. A digest proves
byte integrity, not source truth or independent control of accounts.

Validate the exact network/vault/mandate/version/proposal/asset/recipient/amount/
evidence digest and designated signer/claim against the immutable policy/proposal;
require valid issue/expiry times, per-claim distinct quorum and any separate
original-owner approval. Synthetic local exercises cannot produce a live candidate.
No session, backend readiness boolean, agent digest or offchain review supplies
onchain authority. A verifier must independently obtain the source, then separately
review and authorize the onchain transaction when explicitly approved.

The onchain call is `attest_proposal {evidence: MAP1}` with signer equal to
`verifier_account` and receiver equal to `vault_account`. Third-party calls attach
zero yoctoNEAR. OWNER_APPROVED and an owner's DELIVERY_DISPUTED attach exactly
one yoctoNEAR. Direct signer/predecessor rules remain enforced by the contract.
Offchain disputes stop application readiness but block contract dispatch only
after the corresponding authorized onchain dispute is included; they cannot cancel
already-dispatched transfers. See [reconciliation](runbooks/financial/RECONCILIATION.md) for the
preview/transport distinction and finalized receipt requirements.
