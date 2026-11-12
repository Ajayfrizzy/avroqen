# Vault governance: demonstration and proposed production design

**Current evidence boundary:** [November 11 owner-reported successful finalized corrected Wasm replacement and pinned post-deployment checks](evidence/2026-11-11-VAULT-CODE-REPLACEMENT.md) supersede November 7 **code version**, while [November 7 deployment and initialization](DEPLOYMENT_KEY_GATE_REPORT.md#owner-verified-testnet-deployment--november-7-2026) remain historical. Both Primary and Testing FullAccess keys remain retained; a narrow Primary proof is BLOCKED under D026 but account ownership is not disputed, and financial operations are DISABLED. Public payment acceptance remains pending. Replacement deployment, key changes and financial activation each require separate explicit owner authorization. The retained FullAccess risks below still apply.

## Current hackathon architecture

The dedicated demonstration account is `avroqen-vault.testnet`. The owner reports creating it through their own wallet and accepts retaining an owner-controlled FullAccess deployment key for a controlled, low-value Testnet demonstration (D018). This is not an immutable deployment or a fully noncustodial service. A FullAccess key can replace code, transfer account funds outside MandateVault restrictions, delete the account, and change keys. Contract-level authorization cannot constrain those account-level powers.

The November 11 replacement was separately authorized and finalized; this governance document does **not** authorize a further deployment, funding, key mutation or financial transaction. API, worker, agent and verifier services never hold that key. Application roles and offchain consent never replace owner-signed contract authorization. Current M3 guards remain authoritative only while the approved contract runs. Pinning code and public-key permissions detects observed changes; it cannot rule out replacement between observations.

## Verified public account observation

Read-only HTTPS Testnet RPC observation at 2026-11-02 21:26:01 UTC (22:26:01 Africa/Lagos):
finalized height **275954911**, hash
`3cEVcND99HGRMm1p2YMUhkC6GmwGbVfYFFxoaM34iBbo`.
Account exists, balance **4.5 NEAR**, locked balance **0**, storage **182 bytes**.
Zero code hash (`11111111111111111111111111111111`) indicates no deployed contract.
One Ed25519 FullAccess public key was returned; its permission fingerprint is
`01323ff188aed5cb6d5d74e27131a25f6b77ede4556b06bb89bac9360012ab82`.
See [public RPC evidence](evidence/M6_TESTNET_ACCOUNT_2026-11-02.json).
This supersedes the earlier UNKNOWN_ACCOUNT observation. We did not fund the account.

RPC proves observed account/key state under the trusted-provider assumption, not human key custody. If additional control evidence is needed, the owner can approve a fresh, short-lived NEP-413 account-control challenge in their wallet. Verify the signature and active FullAccess key at finalized Testnet state, binding exact account, network, application origin, purpose, nonce and expiry with single-use consumption. Record only the public account, key fingerprint and verification outcome, not the signed payload. This does not require a transaction, new key or disclosure of wallet secrets; it has not been performed in this review.

## Proposed production direction — not implemented

**Target architecture:** create a separate **non-custodial vault account for each user or organization**, using a versioned, verified factory. Each customer controls their vault's authorization, custody and upgrade/migration decision, rather than pooling customer funds in the current dedicated demonstration account. Each vault has its own explicit owner, mandate policies and funding/withdrawal rights. Factory admission or application membership must not confer mandate authorization. No Avroqen master withdrawal key, platform-owned customer-vault FullAccess key or unilateral platform upgrade authority is permitted. Factory deployment must transition any bootstrap authority away from platform control and independently verify resulting account keys/code before deposits; no shared platform treasury masquerading as per-user custody.

A factory may create a new child account, deploy an approved artifact, initialize its owner and complete key governance in an atomic, fail-closed sequence. NEAR parent/subaccount naming alone does not grant continuing authority over the child. A compromised factory or creation flow can nevertheless install malicious code/keys at birth. Owners must verify a pinned version and the resulting code, owner, keys and deployment receipts before funding. A factory update may affect future deployments only; it must not control existing vaults.

**Not a drop-in M3 change:** current `new` requires signer = predecessor = vault account, and owner-sensitive methods require direct calls. Factory initialization and DAO/multisig ownership therefore need a separately reviewed contract version and explicit authorization design. Do not relax these checks in M6.

| Future option | Benefits | Risks and required decisions |
| --- | --- | --- |
| Immutable, keyless vault | No retained account key or upgrade method can replace code | Bugs/key loss may be irrecoverable; new versions require explicit migration; verify no hidden upgrade method before removing keys |
| User-governed upgradeable vault | User/organization can adopt repairs | Upgrade authority can also bypass policy; separately review multisig, timelock, notification, consent and direct-call compatibility |
| Platform-governed upgrade | Operational convenience | Rejected production direction: unilateral customer custody/control |

Factory bootstrap authority and temporary deployment keys require a verifiable transition with no residual platform keys. Never assume deleting one key removes all upgrade paths. Keyless deployment removes account-key recovery too; adding a recovery authority recreates trust and must be explicitly reviewed rather than described as free recovery.

An upgrade/migration/recovery specification must address retained state compatibility, all outstanding payment/withdrawal obligations, callback routing, audit continuity and informed user consent. Unknown outcomes cannot be released or swept into a new vault on a timeout. Migration is not a master drain. Guardian emergency authority remains pause-only; it cannot seize funds, settle unknown outcomes or resume an owner's mandate. No recovery design is approved or implemented here.

## Costs and provenance

Users control deposits, mandate allocations and permitted withdrawals. Explicitly identify who pays factory creation/deployment, permanent storage backing, owner storage credit, signer transaction gas and protocol reserve before approval. No silent fee, pooled subsidy or deduction from payment allocations. Contract versions should publish source revision, reproducible-build instructions, exact Wasm hash, reviewed interface/state version, factory version, deployment receipt and resulting account/key governance. Auditable provenance does not itself constitute an independent audit.

Production requires separate review of factory, governance transitions, upgrade/migration/recovery and deployment operations. This document records direction and tradeoffs, not production approval or implementation.
