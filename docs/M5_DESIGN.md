# M5 independent evidence and MAP-1 design

Status: owner approved A and selected B2 on 2026-11-02; implementation in progress. Base is merged M4 PR #8 commit
`2dc51a44f9fbe6ca5515cc6a7867885ace5b61f8`; branch `feat/m5-independent-verifier`.
MAP-1 is Avroqen's internal protocol, not a NEAR standard.

## A — Approved application verifier authentication

Approved: reuse M1 wallet login to identify the human, then require a fresh
NEP-413 signature for each approval, rejection, dispute or owner per-payment
assessment. Login alone cannot approve a review. Finalized RPC must confirm the
signing Ed25519 key is an active FullAccess key for the exact designated account on
the configured network. No key is created, exported, stored by the app or passed to
the rules engine. The wallet retains its key.

Each action message commits to the exact canonical MAP-1 payload, immutable policy
digest, organization, source assessment ID/digest, review action, origin, initiating
session, single-use challenge ID and five-minute expiry. The server stores an
opaque session binding, not a session token in the message. Use a random32-byte
NEP-413 nonce and atomic consumption. Raw proofs/tokens must never appear in audit,
logs or reports. Recheck all permissions and source state after RPC and under locks.
A separately generated UUID MAP-1 nonce is unique per verifier; it is not the
NEP-413 transport nonce. Prepared attestations expire after15 minutes or mandate
expiry, whichever is earlier; expired records never contribute to a current quorum.

A selected verifier may access only assigned proposal evidence and required claim
scopes through verifier-specific routes, even without general organization
membership. It gains no organization list/member/agent-management permission.
Owner and organization roles never appoint additional verifiers. An account equal
to the proposing agent cannot count as independent third-party verification in the
M5 application workflow. Existing policies are not silently rewritten; incompatible
policies are flagged for a new owner-approved mandate. Distinct accounts do not
prove separate human control: disclose collusion and shared-control risks.

OWNER_APPROVED requires the original wallet owner's separate per-payment signature
and cannot count as a third-party claim or reuse M2 consent. DELIVERY_DISPUTED may
be signed by the original owner or a selected verifier. No other role can resolve
or override a terminal dispute. Offchain dispute blocks further app approvals and
transaction preparation; only actual inclusion in M3 can block onchain dispatch.
No already-dispatched payment can be canceled by this workflow.

Alternative A2: designated-wallet M1 sessions authorize offchain assessments without
an additional message; actual onchain attestations still need a separate transaction.
This reduces wallet prompts but exposes decisions to session compromise for the
session lifetime. It must not be silently selected as an implementation shortcut.

## B2 — Approved independent human source workflow

The owner selected B2, not the recommended synthetic issuer service. A designated
human obtains records through their own authenticated issuer/provider access,
independently of agent-supplied links/files. No automated source fetch, provider
credential, local issuer service or new signing key is introduced. The adapter
validates bounded structured observations and exact bindings, not real-world truth.

The human records source class (authenticated provider portal, authenticated issuer
communication, or explicit local exercise), issuer and reference, observed document
digest, recipient/amount and separate invoice/service event, observation time and
independence confirmation. All inputs remain human assertions until wallet-signed;
backend validation cannot prove portal access or prevent a dishonest verifier lying.
Local exercises are labeled synthetic and cannot count toward live readiness or
produce an onchain attestation candidate. Missing source data becomes UNVERIFIABLE;
temporary unavailability remains PENDING_REVIEW. Invoice issuance is never delivery.
Positive third-party decisions require source independence and exact matching fields.

The UI labels verified results “Human verified — not automated provider validation”.
A fresh wallet message commits to the full provenance observation and MAP-1 body.
Owner per-payment approval remains separate and cannot satisfy third-party quorum.
A live judge demo requires actual independently obtained evidence and separately
approved testnet transactions; synthetic exercises are not production evidence.

Alternative B1 (not selected): separately authenticated synthetic issuer registry
and isolated verifier adapter. A future provider adapter needs explicit trust roots,
credentials and source semantics; it must not be silently added to this human flow.

## Evidence bytes, access and persistence

Agent intake is a claim, never authoritative evidence. Bind immutable metadata to
one M4 proposal: digest, allowlisted source class, bounded issuer/reference,
media type and byte length. Claim and event belong to each signed observation. Compute SHA-256 over exact
original bytes, with no newline/Unicode/JSON reserialization. Metadata JSON uses evidenceInput schema field order and UTF-8 JSON.stringify;
its SHA-256 is separately named submissionDigest. It is not the original file digest.
The original evidence digest must exactly match the immutable M4 proposal/M3 field;
changing evidence requires a new proposal, not mutation of existing authorization.

Initial file boundary: accept bounded metadata/digests; reject multipart, binary,
base64 files and arbitrary URL fetching. This is an explicit metadata-only intake,
not an insecure document upload feature. Local exercises use nonsensitive synthetic bytes only. If real private-file upload is later required, specify private
encrypted storage, retention, deletion, content validation and independent scanning
before enabling it. Never persist invoice contents in onchain payloads or audit logs.

Migration004 adds immutable submissions, review challenges, signed review records
and append-only events. Source observations and MAP-1 preparations live inside the
immutable review record; they are not separate provider-authenticated records. Use transactions,
unique source/review idempotency keys, distinct verifier/claim constraints and global
verifier/nonce uniqueness. No mutable assessment can retroactively change a signed
review. Audit-write failure rolls back decision, nonce consumption and preparation.
Use existing consent/agent locking order and extend it for evidence/review rows;
perform source/RPC requests outside SQL locks and recheck state before commit.

## Application state versus onchain state

Show agent submission, source provenance, verifier assessment, verifier-signed
preparation and chain acceptance separately. Application progress:
SUBMITTED -> PENDING_REVIEW -> VERIFIED / REJECTED / UNVERIFIABLE / DISPUTED.
A verified source observation alone is not a signed verifier decision. Count only
unexpired designated distinct verifier decisions per required claim in the offchain
readiness view; show owner approval separately. Never label this chain quorum.
Disputes dominate app readiness and are terminal for that proposal.

Prepared MAP-1 bodies retain all canonical Rust fields and exact decimal u128/u64
representations. Onchain status stays NOT_SUBMITTED with deployment status
NOT_DEPLOYED until independently observed. PREPARED/AWAITING_VERIFIER_SIGNATURE
refer explicitly to the separate onchain transaction signature, not the NEP-413
assessment message. No fabricated SUBMITTED_ONCHAIN/CONFIRMED, tx hash or link.
Future broadcast failure/unknown handling must not infer chain failure from timeout.

## Contract integration and real testnet path

The existing Rust attest_proposal receives {evidence: MAP-1}; it requires direct
signer=predecessor=verifier, exact network/vault/policy/proposal/recipient/amount/digest,
fresh expiry, unique UUID nonce and allowed claim. Third-party calls attach zero;
owner approval and owner dispute require1 yoctoNEAR. These rules are preserved.
No offchain message may be forwarded as a replacement for that transaction.

M5 prepares readable typed wallet transaction intents and a pure pinned Meteor v1
transaction preview. Submission is unconditionally disabled. Deployment verification,
onchain mandate/proposal preflight and transaction transport are future M6 gates,
not implemented checks in this preview. No send is performed in this work.
When not deployed, signing/submission remains unavailable. Compatibility must be
proved with actual compiled-contract sandbox tests and the pinned wallet SDK shape;
manual public testnet wallet transaction acceptance remains pending authorization.

Live sequence needing separate approval: verify exact deployed code/network/account
and deployment-key governance; owner registers immutable mandate and storage credit;
owner funds it; agent registers the exact M4 proposal UUID/amount/recipient/digest;
verifier independently obtains evidence and reviews/signs its own attestation
transaction; owner signs separate per-payment approval if required; owner explicitly
executes; M6 records finalized receipts and reconciles pending/unknown outcomes.
Available testnet balance is not permission to deploy, create keys or transact.

## Verification and delivery gates

Add focused tests before sensitive code: forged/missing/unavailable source records,
digest/identity/amount mismatches, injection/SSRF, oversized/file inputs, selected
verifier impersonation and tenant isolation, agent escalation, owner substitution,
per-claim quorum, expired/replayed proofs/nonces, concurrency, mutation and rollback,
terminal disputes, and no fake chain state. Retain all M1–M4/Rust sandbox checks.
Browser tests cover readable terms, loading/error/empty states, focus/reduced motion,
mobile layouts and clearly separate source/decision/chain statuses.

Preserve the currently running HTTPS override for local tests; never silently
restore HTTP PUBLIC_ORIGIN when restarting Compose. Retain PostgreSQL volumes.
Record actual results in M5_REPORT, publish only the authorized feature branch/draft
PR to staging, verify foundation/rust on its exact head, and do not merge/deploy.
