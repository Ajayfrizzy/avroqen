# Threat model — assume compromise

## Assets
Deposited funds, mandate integrity, signing credentials, private evidence, user identity, event history, transaction status, service availability.

## Adversaries
Malicious/compromised AI runtime; hostile web documents and tool responses; impersonating providers; compromised backend/DB; compromised verifier; dishonest owner or colluding provider; compromised wallet/session; buggy or malicious dependency; smart contract attacker; RPC/indexer failure; privileged infra administrator.

## Entry points and defenses
| Threat | Prevention / containment | Detection / recovery |
|---|---|---|
| Prompt injection | Tool outputs as data; typed tools; no spending keys in LLM context | Flag suspicious prompts; trace source and deny transactions |
| Agent forged service proof | Independent signer and scoped claim; owner option | Hash/provenance audit; verifier revocation |
| Wallet/agent compromise | Restricted function-call key, onchain mandate cap, rate limits | Owner revokes, rotate keys, incident record |
| Budget bypass via splits/races | Atomic reserve; aggregate cap; count pending slots | Invariant alerts and reconciliation |
| Replay | Per-execution ID, per-attestation nonce, domain binding | Reuse alert and rejection log |
| Backend compromise | No custody keys; contract rejects policy escalation | Rotate app credentials, rebuild projection |
| Verifier compromise | Claims scope, independent quorum for high-risk, owner stop | Revoke verifier, pause affected mandates |
| RPC/callback outages | No blind retry; chain authoritative | Reconciliation/monitoring, manual incident resolution |
| Contract bug | Restricted pool size, rigorous testing; immutable/owner-governed upgrades | Emergency pause (if functional), safe disclosure, migration plan |
| Storage/gas exhaustion | Account required reserves, bounded storage/input, metering | Alert and safe suspension |
| Phishing / owner consent | Display exact typed wallet action, confirm wallet signature | User education; revoke and rotate |

## Explicit non-guarantees
Unaudited smart contracts may be exploitable; owner may approve harmful mandate; trusted verifier may lie; source API may be compromised; cross-chain settlement may fail; blockchain transactions may be irreversible. 'No successful exploit' in test suite is not evidence of impossibility.

## Abuse cases
A malicious owner creates a fraudulent marketplace transaction; a provider and verifier collude; attacker drains only per-mandate budget; social engineering induces owner to expand budget; compromised guardian DoS pause. Document residual exposures and mitigation ownership.

## Security review gate
Review external call ordering, callback authorization, arithmetic/conservation, access control, timestamp behavior, proposal uniqueness, compromised-key exposure and tenant isolation. Do not promote to material real-money production use without independent professional review.
