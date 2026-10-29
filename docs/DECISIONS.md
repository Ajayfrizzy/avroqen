# Architecture decision log

## Settled design choices
- **D001:** Product name provisional Avroqen, replace previous working label MandateFlow, retain technical history. Do not invent trademark/domain clearance.
- **D002:** Contract-controlled custody in `MandateVault` with owner-approved allocation and withdrawal; account-held funds outside vault remain untouched.
- **D003:** Agent is an untrusted proposer; no owner/verifier full-access keys in AI runtime.
- **D004:** Scope of spending set in typed immutable mandate, enforced onchain. Material terms require new owner authorization.
- **D005:** Independent MAP-1 attestation from owner-designated NEAR account; agent-created evidence is not sufficient.
- **D006:** Atomic reservation before async transfer; safe callback; no blind retries on unknown outcomes.
- **D007:** Native NEAR initial custody/transfer; NEP-141 and Intents are later adapters only if independently validated.
- **D008:** No unilateral platform-admin withdrawal/upgrades; stop-only guardian scope; owner recovery.
- **D009:** Security uses assume-breach mindset; no claims of invulnerability or audited status.
- **D010:** Zero-out-of-pocket engineering requirement; sandbox/testnet or granted credits only.

## Open decisions requiring explicit owner/technical approval
- **O01:** Legal/branding verification and final name/tagline; Avroqen not asserted available.
- **O02:** Whether mandatory third-party claims require 1 verifier, quorum, or per-mandate owner co-approval; proposal: configurable policy, default owner co-approval for hard-to-verify outcomes.
- **O03:** FT token support and exact token contracts; requires asset-specific audit.
- **O04:** Contract upgrade governance and migration; cannot sacrifice custody protections for easier ops.
- **O05:** Agent inference provider / costs; prefer deterministic orchestrator baseline and free existing inference if available.
- **O06:** Deployment infrastructure, testnet faucets and free quotas; verify current constraints.
- **O07:** Relationship between onchain 'proposal' and offchain proposal: choose single canonical identifiers, prevent spoofing.

## Blocking design reviews before value-bearing deployment
Prove deposits/withdrawals incl gas/storage, private callbacks, non-replay, budget conservation under concurrency, and attestation identity semantics in actual compiled contract. These are implementation tests, not assumed established properties.
