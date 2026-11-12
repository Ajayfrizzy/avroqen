# M6 transaction orchestration and reconciliation

The API prepares one immutable, typed FunctionCall per intent. It never broadcasts or signs. Preparation requires the original owner role, scoped agent wallet or exact designated M5 review author; active sessions, origin, CSRF, tenant bindings and live consent/agent checks apply. Recovery withdrawals/pause/revoke remain available after offchain consent revocation. The Rust contract remains the financial authority.

The wallet connector uses in-memory storage, refuses key storage, omits all access-key installation parameters and sets `useFunctionCallKey:false`. It connects the exact account and network before persisting `AWAITING_WALLET`, then opens one transaction prompt. Pinned Meteor SDK 3.24.1's `near::sign_transactions` action uses its `sign` route to sign and broadcast and documents `FinalExecutionOutcome[]`; Avroqen accepts the transaction hash from a single consistent `transaction.hash`, `transaction_outcome.id`, or the SDK's exported legacy hash-only result. The result remains only an untrusted reported hash. Conflicting/missing hashes, cancellation and wallet-declared submission failure remain distinctly labeled but quarantined as UNKNOWN; the application does not automatically repeat them.

`chain_intents` persists operation bytes, actor/org/mandate, deployment manifest, idempotency key, finalized scan anchor, claimed/verified hashes, receipt IDs and observation height/hash. One unresolved intent per wallet/vault prevents app-level parallel retries. Append-only `chain_events` record status changes atomically. SQL triggers protect scope and terminal observations. Worker leases use `SKIP LOCKED`, expire after process loss, and compare the lease and hash claim before publishing observations. Terminal records are not reprocessed; stale/conflicting finalized observations cannot advance a projection. A database rollback does not advance progress or imply success.

`services/chain/rpc.ts` has only allowlisted read RPC methods and fixed NEAR testnet endpoints. It checks actual chain ID, finalized bytecode SHA-256/code hash, all pinned access-key permission fingerprints and contract domain. Each response must be an unambiguous JSON-RPC 2.0 envelope with the exact issued request ID; duplicate decoded object keys, extra envelope members, conflicting result/error members, malformed/truncated bodies and responses over 4 MiB fail closed. Provider details are reduced to fixed diagnostic codes, and neither raw provider errors nor transaction/authentication payloads are logged. This is authenticated HTTPS **trusted-RPC verification**, not consensus/light-client proof. A malicious trusted provider is a residual risk; no claim of independent multi-provider consensus is made.

The current finalized deployment head must be no older than 120 seconds and no
more than 30 seconds ahead of the application clock. Exact boundary values pass;
missing/invalid, older or further-future timestamps fail closed. Code, account,
complete access-key set and accounting/domain queries are pinned to that verified
block hash. Explicit historical receipt-block checks do not apply current-head age
to the old block; reconciliation first requires a fresh current deployment check
and then verifies each attributable historical block by its exact hash and canonical
height. This preserves historical receipt verification without treating an old
provider head as current.

The receipt verifier matches signer, receiver, one exact FunctionCall, argument bytes, gas and deposit; requires `FINAL` and a complete, nonduplicated descendant outcome graph. For native transfers it requires the dispatch's exact returned callback, private predecessor/receiver bindings, matching transfer amount/recipient, callback data dependency, finalized transfer outcome, successful callback result and matching contract execution/withdrawal state. Failed callbacks quarantine funds even if a recipient received a transfer. `SuccessReceiptId` is a promise reference, not an immediate success value. Failure before dispatch is a confirmed rejection; transfer failure is terminal only after a successful false callback and `ConfirmedFailed` state.

The worker scans finalized blocks/chunks for exact operation matches when a wallet hash is lost. It advances only a contiguous verified block chain, at most 12 heights per cycle. Multiple candidates remain ambiguous. Explicit UNKNOWN_BLOCK heights can be skipped only while preserving the previous block hash; the next actual block must link to that hash. Other outages stop the cursor. Pruned/missing existing blocks cannot be silently bypassed because the next previous-hash link will disagree. Unavailable history requires provider investigation, never a transfer retry. Normal hash-based reconciliation is unaffected. The public provider may prune historical transactions or omit receipts from untracked shards; unavailable historical code/keys/receipt bodies leave UNKNOWN. The archival testnet endpoint is allowlisted for a separately reviewed provider switch, not automatically trusted as a consensus override.

No indexer can undo a NEAR transfer, repair an irrecoverably missing callback or force contract reserve release. Retained deployment keys can replace code between checks; pinned current and receipt-block inspections reduce accidental mismatch but do not make mutable deployment governance immutable.

## Historical transaction attribution

Before promoting any reported/recovered hash, compare its inclusion block to the immutable finalized intent anchor. Inclusion must be strictly later, and the anchor's canonical height/hash must still match. A transaction at or before that anchor remains UNKNOWN with TRANSACTION_PREDATES_INTENT, no verified hash and no release of the unresolved-intent lock. Conflicting anchor evidence fails closed. This applies even to identical funding/storage calls and does not alter contract nonce/accounting semantics.

This temporal check does not prove a wallet UX event caused a transaction: an independently submitted identical transaction after the anchor remains indistinguishable without an onchain intent identifier. Multiple scanned matches remain quarantined. Current M3 operations are unchanged; users must avoid out-of-band duplicate submissions, and no automatic retry is allowed.

## Intent lifecycle and wallet uncertainty

The recorded lifecycle is PREPARED → AWAITING_WALLET → BROADCAST_REPORTED →
SUBMITTED → FINALIZING → CONFIRMED_SUCCESS / CONFIRMED_FAILED. UNKNOWN represents
wallet/RPC ambiguity, not a terminal failure. Wallet output is only a hash claim;
only the finalized receipt graph and matching contract state can establish the
terminal result. One unresolved signer/vault operation blocks application retries.

Connect the exact account and Testnet before persisting AWAITING_WALLET, and
persist that uncertainty before opening the transaction prompt. Cancellation before
the transaction prompt may leave an unsigned PREPARED intent. After the prompt can
have opened, cancellation, wallet-declared submission failure or a missing hash
does not prove absence of broadcast: retain UNKNOWN with its distinct reason and
operation lock. If the browser obtains a hash but its report request fails, it must
not replace that hash with a null report; the durable AWAITING_WALLET intent remains
eligible for exact-operation scanning from its pre-prompt anchor. No timeout releases contract reservations,
creates another transaction or authorizes a blind retry. Reconciliation is
read-only, idempotent and restartable; unavailable/pruned history, ambiguous matches
or missing receipt bodies remain unresolved. It cannot repair contract state.

## Controlled replacement of a historical hashless storage deposit

Controlled replacement is available only for an original `STORAGE_DEPOSIT` intent
that is `UNKNOWN`, has no reported or verified hash and has no prior replacement.
It does not clear, fail or stop reconciliation of the original. The operator and
owner must first wait until a fresh finalized head is at least 90,000 blocks after
the immutable anchor. At both pinned blocks the configured deployment must verify,
the signer's complete access-key list (public keys, permissions and nonces) must be
identical, and `get_storage_credit` must be null. A partial scan, explorer absence,
timeout or null credit alone is insufficient.

The owner selects **Review controlled replacement** and signs the displayed
NEP-413 message. This message sends no transaction. It authorizes one exact unsigned
replacement preparation and discloses that the old outcome remains unknown and
trusted RPC is a residual risk. The server repeats the evidence check after the
signature and atomically stores the challenge/evidence, one-way marker and identical
`PREPARED` replacement. The owner must then separately review and approve the normal
wallet transaction. Never script either approval or automatically open the second
prompt.

If the validity distance is short, any signer key/nonce/permission changed, storage
credit is non-null, a hash appears, RPC is unavailable or block binding conflicts,
leave the operation `UNKNOWN`. Do not edit the marker or prepare another intent.
If an original transaction later appears after replacement authorization, halt the
replacement before wallet approval when possible, preserve both records and perform
incident reconciliation; do not create a second replacement.

## Manifest and immutable operation boundary

Submission is disabled by default. A complete manifest may be configured for
authenticated read-only deployment verification while submission remains disabled;
manifest presence never enables transactions. Any separately authorized enabled manifest must
pin Testnet, vault account, approved Wasm SHA-256, every expected public-key/permission
fingerprint and the authorization reference. Finalized read-only RPC checks actual
chain ID, account/code hashes, all access keys and initialized contract domain at
the same pinned block. Partial/malformed configuration or a mismatch fails closed.
Trusted HTTPS RPC is an explicit trust assumption, not a light-client proof;
retained FullAccess keys can replace code between checks.

An intent binds the authenticated account, organization, network, deployment,
immutable canonical policy/digest, applicable proposal/review and one allowlisted
FunctionCall with exact arguments, gas and deposit. Canonical integer strings are
required. A client cannot choose arbitrary receiver/method/arguments or a Transfer
action. M2 consent and M5 NEP-413 review never replace a separate onchain wallet
authorization. LOCAL_EXERCISE evidence is ineligible. Original-owner recovery
withdrawal/revocation remains accessible after offchain consent expiry/revocation;
recovery never restores spending authority. No server/worker signer or broadcast
path is introduced by manifest configuration.

The authenticated chain status reports manifest configuration, successful
read-only verification and submission enablement as separate facts. Public process
health reports only non-secret configuration booleans; it does not expose the
vault, artifact hash, key fingerprints or authorization reference and does not
claim that a configured deployment has just been verified. Database readiness
remains database-connectivity-only. The application flag is not an onchain pause.

## MAP-1 transaction versus offchain review

The exact message, nonce and policy/source/proposal bindings are specified in
[MAP-1](../../ATTESTATION_PROTOCOL.md#application-review-and-onchain-attestation-boundary).
For `attest_proposal`, signer is `verifier_account`, receiver is `vault_account`,
and arguments are exactly `{evidence: MAP1}`. OWNER_APPROVED and an owner's
DELIVERY_DISPUTED attach exactly one yoctoNEAR; third-party claims/disputes attach
zero. The direct-caller restrictions in the contract remain authoritative. A fresh
onchain transaction is required; an offchain message cannot be forwarded as its
authorization.

The retained M5 `meteorAttestationPreview` is a pure pinned-SDK shape preview with
a 30-Tgas preview value, `submissionEnabled=false` and a component-local
`NOT_DEPLOYED` marker. Those fields describe that preview, not global observed
deployment or live readiness. Actual M6 transport converts selector actions to
native NEAR actions, checks exact signer/network, uses `useFunctionCallKey:false`,
refuses local key custody and requires a distinct wallet transaction prompt. Gas
must be reviewed against the approved build and current authorized plan; the
preview value is not a live gas approval.
