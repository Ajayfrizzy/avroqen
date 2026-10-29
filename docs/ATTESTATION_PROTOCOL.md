# MAP-1 — Mandate Attestation Protocol

**Internal protocol design, NOT a NEAR standard.** The verifier's attestation communicates a scoped claim; it is not inherently proof that the physical-world claim is true.

## Trust roots
Owner explicitly binds a verifier NEAR account (or quorum) to mandate + allowed claim types. Verifier independently fetches evidence from authenticated issuer/provider or a human authorized to approve. AI-supplied URLs, screenshots and text are suggestions only, never authoritative proof. No app administrator self-appointment of verifiers.

## Canonical fields
`protocol_version`, `network_id`, `vault_account`, `mandate_id`, `policy_version`, `proposal_id`, `asset_id`, `recipient`, `amount_atomic`, `claim_type`, `evidence_digest`, `verifier_account`, `nonce`, `issued_at_ns`, `expires_at_ns`.

## v1 verification
Authorized verifier directly submits onchain attestation from its own NEAR account. Contract checks authenticated predecessor identity, mandate registration, all exact bindings, expiration, nonce uniqueness and allowed claim type. Agent may reference an attestation but may not register it as trusted. Do not infer independence merely from a different process/container if keys share custody with agent/backend.

## Evidence classification
- `INVOICE_ISSUED`: attests that a provider issued an invoice with matching fields; does **not** prove delivery.
- `SERVICE_CONFIRMED`: independent source attests to a specific service activation/fulfillment event; define exact semantics per adapter.
- `OWNER_APPROVED`: explicit owner confirmation of a payment; may replace external delivery proof only if mandate permits.
- `DELIVERY_DISPUTED`: blocks execution pending resolution; not a generic AI confidence rating.

## Anti-replay / privacy
One-time attestation nonces and proposal binding. Store minimal onchain digest; full evidence encrypted/access-controlled offchain, with retention policy and deletion/consent requirements. Use SHA-256 digest for bytes with documented canonicalization; hash is integrity only, not confidentiality. Never place sensitive invoice contents on public chain.

## Compromised verifier
Stolen verifier key can falsely attest within its delegation. Limit mandate spend, whitelist claims, enable revocation, optional independent quorum, require owner approval for high-risk conditions, flag anomaly. No truthful-evidence guarantee without source validation. Define disputes and emergency suspension.

## Required negative tests
Wrong network/vault/mandate/proposal/version/asset/recipient/amount/claim; expired attestations; mismatched evidence digest; reused nonce; unregistered signer; attestation after verifier revocation; compromised verifier simulation. Each must fail without moving funds.
