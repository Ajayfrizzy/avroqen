# Coordinated M8 live financial acceptance — pending, not executed

**Deployment checkpoint (updated November 11):** [owner-reported finalized corrected code replacement and post-deployment verification](../../evidence/2026-11-11-VAULT-CODE-REPLACEMENT.md) supersede the older deployed-code digest. The [November 7 initialization](../../DEPLOYMENT_KEY_GATE_REPORT.md#owner-verified-testnet-deployment--november-7-2026) remains historical. Primary and Testing FullAccess keys are both retained; D026's narrow Primary proof remains BLOCKED but is not a denial of account control. Financial submissions remain DISABLED, and no real public-chain payment has been accepted. No new deployment is needed merely to begin separately authorized genuine-source payment testing.

Use one coordinated desktop/physical Android session after integrated implementation review. Earlier owner-confirmed M1/M2 desktop/Android login, cancellation/retry, organization/agent persistence and mandate consent/revocation remain valid only for those earlier tests. They do not pass M5 independent-source or M6–M8 public financial acceptance. iOS explicitly deferred. Browser fixtures are not physical Android evidence.

## 0. Authorization and setup

This is the current coordinated acceptance procedure. The archived
[M8 deployment proposal](../../archive/deployment/M8_DEPLOYMENT_AUTHORIZATION.md) and
[M6 preparation package](../../archive/milestones/M6_TESTNET_RUNBOOK.md) provide historical context only;
their old account observations and proposed amounts are not current authorization.
Record explicit owner approval for the exact reviewed source/artifact, identities,
retained-key risk and each gas/storage/funding/payment cap. Any replacement
deployment needs its own fresh exact transaction approval. **Without approval,
stop the public transaction steps**; local automated/read-only checks can continue.
Never request/export keys, install privileged keys, use a faucet/paid service
automatically or bypass wallet/TLS errors.

## Financial authorization and activation gate

Record original owner, designated agent, independently controlled verifier(s),
recipient, optional pause-only guardian and relevant application roles using
existing public Testnet identities. Do not invent accounts or infer independent
human control from different account names. The vault deployment key is not a
routine agent/verifier credential. Owner, agent and verifier wallet actions remain
distinct; application roles/bearers and offchain signatures never authorize custody.
Require genuine independently retrieved evidence, exact per-claim quorum and any
separate original-owner per-payment approval.

Review current protocol/gas price, finalized balance, code, all keys, initialized
domain, reserve and storage before approving an exact plan. Reconcile the existing
deployment evidence rather than treating its old observation as fresh. Review artifact/source identity and cross-host build hashes; the currently verified November 11 deployed artifact is **367353 bytes**, SHA-256 `d2ec5048af0577b60c0aef4ecfd1aad1def4289828c841b2d7a7f83dd0f8428d`, not the historical 366735-byte November 7 archive. Any future replacement must use a freshly approved account/network, signer, exact actions, and artifact; do not apply the historical initial deploy+initialization recipe to an already initialized vault; no implicit AddKey/DeleteKey/Transfer approval is granted.

Set explicit per-actor and aggregate gas ceilings, owner prepaid-storage credit,
mandate storage allowance, funding allocation, policy/per-payment limits, recipient,
execution cap and authorized negative-test costs. Re-estimate each transaction
and stop for new approval if a cap is insufficient; never top up automatically.
Historical proposed amounts in the archived packages remain unapproved proposals,
not defaults or current spending limits. Keep storage backing, nonwithdrawable
protocol reserve, unused storage credit, available/reserved payment funds and gas
costs separate. Retained-record storage stays locked. Include one-yocto deposits
and receipt/action fees in actual cost accounting, never subtract fees silently
from authorized recipient amounts or count locked storage twice.

Only after a separately approved plan and successful exact code/key/domain,
finalized receipt and solvency checks may an authorized operator configure the
Testnet manifest and submission gate. The reviewed fields are
`M6_TRANSACTIONS_ENABLED`, `NEAR_NETWORK`, `M6_VAULT_ACCOUNT`, `M6_WASM_SHA256`,
`M6_KEY_FINGERPRINTS` and `M6_AUTHORIZATION_REFERENCE`; listing them is not
authorization to change them. Partial/mismatched configuration fails closed.
Current financial operations remain **DISABLED**; this documentation does not
activate them. The worker receives no signing key and reconciles existing intents
even while new submission is disabled.

A complete approved manifest may first be configured with
`M6_TRANSACTIONS_ENABLED=false` for authenticated read-only verification. That
state must report a configured and verified deployment while keeping
`submissionEnabled=false`; manifest presence is never transaction authorization.
Current-head verification rejects finalized blocks older than 120 seconds or more
than 30 seconds in the future and pins code, account, complete key-set and contract
domain/accounting reads to that block. JSON-RPC responses require version 2.0,
the exact issued request ID, one result-or-error member and no duplicate/extra
envelope fields. Failure or mismatch stops the run. These checks reduce trusted-RPC
risk but are not light-client consensus or an independent chain observation.

Unexpected code/key/state/receipt changes halt new submission and require
investigation. FullAccess replacement is not rollback and cannot reverse transfers.
There is no administrative reserve release, forced settlement or unreviewed recovery
override. Migration, key deletion, replacement deployment and financial activation
remain separate authorizations. At the end of a future authorized run, disable new
submission and keep read-only reconciliation running until every known intent is
terminal or explicitly quarantined. Record public finalized hashes/heights, receipt
graphs, costs, recipient deltas and matching contract accounting; exclude proofs,
cookies, tokens, private source files and signed envelopes from evidence.

```sh
pnpm check
pnpm build
pnpm test:identity-db
pnpm test:contract
pnpm test:wasm
node scripts/observe-testnet.mjs
# Existing private environment and retained volumes/certificates:
docker compose -f compose.yaml -f compose.https.yaml up --build -d --wait
pnpm dev:https
```

If the existing HTTPS proxy is already listening, reuse it instead of starting a second copy. Desktop opens **https://127.0.0.1:8443/workspace/journey**. `pnpm test:https` must pass with the existing CA, matching HTTPS origin and host-only Secure/HttpOnly/SameSite cookies. Do not use TLS verification bypass. On Android, connect the existing trusted phone by USB, unlock it and authorize debugging:

```sh
adb devices
adb reverse tcp:8443 tcp:8443
adb reverse --list
adb shell am start -a android.intent.action.VIEW -d 'https://127.0.0.1:8443/workspace/journey' com.android.chrome
```

Use existing CA trust instructions in [M1_WALLET_ACCEPTANCE](../security/WALLET_ACCEPTANCE.md); no certificate regeneration, public tunnel or database exposure. USB disconnection breaks this loopback route. Record Chrome/macOS/Android versions and actual device, not only viewport dimensions. A missing lock icon alone does not diagnose TLS; inspect Chrome connection/security details without clicking through certificate errors.

## 1. Actor sheet and wallet baseline

Record only public account IDs and roles: original fund owner, designated agent, independent verifier(s) for each claim, recipient, optional guardian and organization admin. Confirm each account/network in its wallet. Do not use vault deployment key as agent/verifier. If one human controls multiple accounts, label role separation as account-level only; do not claim independent human verification.

Owner signs in using Meteor NEP-413, cancels once, confirms neutral cancellation/no authenticated session, retries, then selects organization. Second wallet must not see or mutate unrelated organization records. Logout and attempt a privileged request through the normal interface, then sign back in. Automated server-side session/nonce tests remain distinct from these observations. Record only outcome, account/network and safe reference, not cookies/nonces/signatures.

## 2. Deploy and verify (separate authorization required)

First reconcile the existing owner-verified deployment record; do not repeat the historical deployment procedure. Verify exact deployed code hash, keys, account, network, reserve and measured storage as part of a separately authorized acceptance plan. Any mismatch stops the run. If replacement is necessary, obtain new explicit owner authorization for the exact atomic DeployContract + `new` transaction and record its actual hash and finalized receipt IDs. Manifest configuration and financial activation remain separately gated. Do not invent a hash or enable a mock deployment.

## 3. Owner mandate, storage and funding

From Journey → Mandates, select active agent and exact target vault, recipient, decimal NEAR limits, expiration, execution cap, claim quorum and separate owner approval. Review immutable terms; sign offchain consent. Confirm it remains labelled offchain. In Settlement, deposit approved storage credit, register exact mandate and fund exact allocation in separate explicit owner wallet prompts. For each operation compare Testnet, signer, receiver, method, arguments, gas and attached deposit. Wait for verified finality before the next step. Record accounting after each step; policy ceiling alone is not a balance.

Optional guardian is an explicit pause-only account in the registration form. Leave blank for no guardian, or enter the separately approved guardian account before preparing. Verify `guardian` in exact wallet arguments; browser/server reconstruction and contract authorization still apply. It grants no resume/revoke/execute/withdraw authority. Record this public identity for the optional guardian case.

## 4. Agent, genuine evidence and independent verifier

Use restricted agent workflow with exact decimal amount and authentic source document; local hash calculation never uploads the file. Submit the offchain proposal; then the designated agent independently signs its exact onchain `propose_payment` action in Settlement. Scoped demo capability is not a blockchain key. Ensure source privacy and lawfulness; do not commit invoice contents.

Designated verifier opens Evidence assignments, independently retrieves the authentic issuer/provider record outside agent control, hashes those exact bytes locally, checks source ID/reference, recipient and amount, selects the precise claim and explicitly confirms independent access. If byte versions differ, reconcile the source discrepancy rather than copying the agent hash. Sign fresh NEP-413 review; inspect that it does not claim onchain quorum. Then sign the separate onchain attestation via Settlement. Repeat with distinct designated identities per required claim/quorum. Owner separately reviews and signs per-payment OWNER_APPROVED attestation where required; owner consent is not that approval. Do not use local exercise/synthetic source as real evidence.

## 5. Execute and prove settlement

Before execution, read finalized recipient balance and mandate/accounting using read-only RPC. Use public IDs only; template:

```sh
curl --fail --silent --show-error https://rpc.testnet.near.org \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":"acceptance-read","method":"query","params":{"request_type":"view_account","finality":"final","account_id":"REPLACE_WITH_APPROVED_RECIPIENT"}}'
```

Pin subsequent views to the returned finalized block hash when comparing a snapshot. Record amount, block/hash and time. Original owner reviews the eligible proposal and explicitly authorizes execution. Observe prepared → wallet → pending/finalizing → verified outcome; cancellation after prompt/begin or a lost hash must not produce a fresh retry. On uncertainty, retain the operation and inspect reconciliation/history.

Require actual finalized transaction/action/transfer/callback receipts, matched immutable proposal/recipient/amount/digest, successful callback and contract `Succeeded`. Read recipient post-balance after finalized receipt inclusion and compare exact BigInt delta to payment. Recipient must avoid unrelated transactions during the observation; otherwise reconcile each unrelated delta/fee and do not claim an unexplained balance proves the transfer. Verify `available + reserved + spent + withdrawal_pending + withdrawn = funded`, spent+reserved within policy, and execution counts. Never label a successful transaction shell or wallet toast alone a paid result.

## 6. Negative, emergency and recovery session

Only within separately approved gas limits, try a payment missing required approval or above allowed terms using the normal wallet flow. Preflight rejection proves app denial only; for contract denial require an actual authorized negative transaction and finalized failure. Compare protected balance/reserve/spent and recipient pre/post: no unauthorized transfer. Do not weaken preflight just to create a demo result; retain contract-level sandbox evidence if a safe live path is unavailable.

Original owner pauses; wait for finalized inclusion, then confirm new prohibited execution is denied. Guardian pause-only case requires the explicitly registered guardian described above; no implicit role substitution. Pause/revoke cannot cancel previously dispatched transfers. Inspect Security incidents, acknowledge/investigate/resolve with an authorized responder and confirm this never changes custody. Reconciliation should preserve unresolved obligations across worker restart/RPC outage; use existing local outage tests for destructive fault injection rather than interrupting public financial actions irresponsibly. Restart the local worker only when safe and keep all known intent records. No blind resend, timeout reserve release or manual DB success edits.

## 7. Device and evidence record

Repeat key transitions on physical Android: login/cancel/retry, readable amount and review, independent-source file hashing, wallet return, unknown/pending warnings, logout, navigation/focus/no horizontal overflow and emergency review. Do not repeat financial payments simply to test layout; reuse verified read-only history or separately approved distinct proposals/budgets. Desktop and Android share the approved origin via USB; confirm Secure cookie attributes through inspected metadata, never copy cookie values.

For each case record: commit/artifact, device/version, public account roles, genuine versus synthetic source, consent/proposal/review safe IDs, actual network/hash/receipts, block-height/balance/accounting deltas, expected result, observed result and PASS/FAIL/PENDING. Store redacted screenshots of UI only; exclude private documents, session tokens, signatures, nonces and credentials. Retain signed message material only in the application's intended transient flow, not reports.

Current statuses: November 7, 2026 owner-verified Testnet contract deployment and initialization **recorded**; genuine coordinated public Testnet financial acceptance **pending**; any replacement contract deployment **requires separate explicit owner authorization**; coordinated human session **pending**; genuine source **pending**; physical Android integrated pass **pending**; iOS **deferred**; independent assessment **not performed**. Primary proof remains **BLOCKED**, the temporary Testing FullAccess key **RETAINED**, and financial operations **DISABLED**. At end of a future authorized run disable new submissions, retain read-only reconciliation for unresolved operations and document any incident. No merge/public hosting/mainnet/funds approval is implied.

## Acceptance Test 6 — explicit Testnet simulation

This hackathon-only run uses a fictional invoice. It does not pass the genuine
source or independent commercial verification gates above. Use a fresh mandate
and proposal; do not reuse an expired policy or a proposal with a finalized
review. Required public accounts are owner `demo-testing.testnet`, agent
`lapobaby.testnet`, designated verifier `ajayfrizzy.testnet`, recipient
`frizzy.testnet`, and vault `avroqen-vault.testnet`. The exact payment is
`0.1 NEAR` (`100000000000000000000000` yoctoNEAR).

Preparation, with no wallet action:

1. Confirm `NEAR_NETWORK=testnet`, the reviewed deployment manifest, and
   `M8_TESTNET_SIMULATION_ENABLED=true`; restart API only after human review.
   The flag is invalid on Mainnet and defaults to false.
2. Read finalized balances for the owner and vault. Confirm the owner can cover
   gas and any storage deposit, and confirm the vault can cover the exact payment,
   storage reserve and gas. Stop if balances/accounting are insufficient; never
   top up automatically.
3. Create a fictional invoice file locally. Record only its SHA-256 digest,
   media type, byte length, fictional issuer and reference in Avroqen. Do not
   upload or commit the file. Select an expiry leaving enough time for every
   wallet prompt and finalized reconciliation.

Sequential UI execution, with a human explicitly approving every signature and
transaction:

1. Sign in as `demo-testing.testnet`. Create a fresh mandate for
   `lapobaby.testnet`, vault `avroqen-vault.testnet`, recipient
   `frizzy.testnet`, maximum payment and budget at least `0.1 NEAR`, one
   execution, designated verifier `ajayfrizzy.testnet`, required claim
   `INVOICE_ISSUED`, and separate owner approval. Review the expiry and immutable
   terms, then sign the offchain consent.
2. On Payments, prepare `register_mandate`. Inspect signer, vault, policy digest,
   storage limit, gas and one-yocto deposit, then explicitly approve in Meteor.
   Wait until Avroqen independently shows confirmed success.
3. Sign in as `lapobaby.testnet`, open **Assigned to me**, create a proposal for
   exactly `0.1 NEAR`, `frizzy.testnet`, and the fictional invoice digest. Then
   prepare `submit_proposal`, inspect the exact call and explicitly approve it in
   Meteor. Wait for independently reconciled success.
4. Sign in as `demo-testing.testnet` and submit the fictional invoice metadata
   for that proposal. This is an untrusted claim and must remain labelled as such.
5. Sign in as `ajayfrizzy.testnet`, open Evidence assignments, select
   **Fictional invoice — Testnet simulation only**, claim `INVOICE_ISSUED`, and
   enter the exact fictional issuer, reference, recipient, amount and digest.
   Sign the NEP-413 review. Confirm the result remains `SYNTHETIC_ONLY` and says
   it is not independent commercial verification.
6. On Payments, inspect the exact MAP-1 payload and zero-deposit
   `attest_proposal` call. Explicitly approve it in Meteor and wait for independent
   onchain reconciliation.
7. Sign in as `demo-testing.testnet`, record a separate `OWNER_APPROVED` review
   using `OWNER_DECISION`. Sign its NEP-413 message, then inspect and explicitly
   approve the separate one-yocto `attest_proposal` transaction. Wait for
   independent reconciliation. Never treat consent or the simulated verifier
   review as owner approval.
8. Prepare `fund_mandate` for the exact reviewed allocation needed by the
   `0.1 NEAR` proposal. Inspect deposit, gas, signer and receiver; explicitly
   approve it in Meteor and wait until finalized vault accounting is visible.
9. Record a finalized pre-execution balance for `frizzy.testnet`. Prepare
   `authorize_and_execute`, verify the exact proposal, recipient and
   `100000000000000000000000` yoctoNEAR amount, then explicitly approve it in
   Meteor once.
10. Wait for Avroqen to verify the transaction, receipt graph, successful
    recipient transfer, callback, contract proposal state and finalized block.
    Confirm the recipient delta and vault accounting. A wallet toast or explorer
    listing alone is not acceptance; an uncertain outcome remains quarantined and
    must not be replayed.
11. Record only safe mandate/proposal/intent IDs, transaction/receipt hashes,
    finalized heights, accounting and redacted UI captures. Never record session
    tokens, nonces, signatures, signed messages or invoice contents. Disable the
    simulation flag after the demonstration; this does not alter retained records.
