# M1 identity design review

M0 baseline: `84ffd209d767660d0cae5c369aa2aa52a54148e8`.
Branch: `feat/m1-identity-access`. No custody code changes are in scope.

## Pending identity decision

Proposed: NEP-413 offchain message signing with an active full-access Ed25519
key, verified against finalized access-key state on the server-selected network.
Restricted function-call keys must not authenticate as wallet owners: a compromised
agent key could otherwise impersonate its account. The official NEP-413 standard
requires full-access keys and separates its signed payload from transactions.

Alternative: restricted keys could represent separately scoped application
identities, but would require a new explicit permission mapping and must never
inherit wallet-owner identity. This alternative is not the proposed M1 login.

Owner approval of the login policy was requested before implementing its dependent
verification/session issuance path. Neither a signature nor an application role
will authorize an onchain transfer or policy change. Signing stays in the user's
wallet; no private key is accepted by the API.

## Proposed protocol and boundaries

- Server-selected network; account ID included in the exact challenge message.
- NEP-413 tag/Borsh/SHA-256/Ed25519 verification; bind recipient, origin, callback,
  account, network, challenge ID and expiration. 32 random nonce bytes, 5-minute TTL.
- HttpOnly preauthentication cookie binds the challenge to the initiating browser.
  A successful signature from another browser must fail, preventing login CSRF.
- Consume nonce and insert session in one PostgreSQL transaction with a conditional
  update; simultaneous successful submissions can create at most one session.
- Opaque random sessions, hashes stored in DB, 15-minute absolute expiry, server-side
  logout/revocation. Production cookies Secure/HttpOnly/SameSite, no Domain.
- Exact configured request origin and CSRF token required for session mutations;
  reject absent/mismatched Origin. Local HTTP exception restricted to loopback.
- Membership lookup on every organization operation, scoped by account and network.
  App owner/admin may manage agents; active members/viewers can read. Client roles,
  ownership fields and arbitrary extra properties are rejected. Org creator becomes
  app owner, which does not imply onchain ownership. No role-edit API is implied.
- Registered agents are organization-scoped records, not credentials or executors.
  Disabling is idempotent and does not claim to revoke existing onchain permissions.
- Audit fixed event/reason codes and public identifiers only; never signatures,
  cookies, CSRF tokens, raw request bodies or database connection details.
- Fail closed on RPC/DB errors. RPC trust remains an explicit assumption, and session
  lifetime bounds stale wallet-key authorization between login and expiration.

## Tests required before acceptance

Cryptographic vectors; forged/expired/replayed/account/network/origin-mismatched
signatures; missing/revoked/restricted access keys; concurrent nonce consumption;
login CSRF; session expiry/logout; missing or wrong CSRF and origin; unauthorized,
disabled and cross-organization identities; role injection/escalation; agent
registration/list/disable; actual PostgreSQL migrations/transactions; responsive UI
loading/error/empty/unauthorized states; all existing M0 checks.

## Wallet compatibility investigation

Read official NEP-413 source and MyNearWallet message-signing implementation.
MyNearWallet's current source invokes a sunset capability guard for dapp signing;
its availability must be verified before selecting it as the production connector.
Do not invent a wallet API, fall back to transaction signing, create function-call
keys, or silently treat a simulated signature/RPC lookup as live wallet evidence.

Sources:
- https://github.com/near/NEPs/blob/master/neps/nep-0413.md
- https://github.com/mynearwallet/my-near-wallet/blob/master/packages/frontend/src/routes/SignMessageWrapper.js
- https://github.com/mynearwallet/my-near-wallet/blob/master/packages/frontend/src/redux/slices/signMessage/index.js
