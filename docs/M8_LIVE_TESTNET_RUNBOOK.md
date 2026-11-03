# Coordinated M8 live acceptance — pending, not executed

Use one coordinated desktop/physical Android session after integrated implementation review. Earlier owner-confirmed M1/M2 desktop/Android login, cancellation/retry, organization/agent persistence and mandate consent/revocation remain valid only for those earlier tests. They do not pass M5 independent-source or M6–M8 public financial acceptance. iOS explicitly deferred. Browser fixtures are not physical Android evidence.

## 0. Authorization and setup

Read M8_DEPLOYMENT_AUTHORIZATION and M6_TESTNET_RUNBOOK. Record explicit owner approval for exact artifact, deployment transaction, identities and each gas/storage/funding/payment cap. **Without that approval, stop only the public transaction steps**; local automated/read-only checks can continue. Never request/export keys, install privileged keys, use a faucet/paid service automatically or bypass wallet/TLS errors.

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

Use existing CA trust instructions in M1_WALLET_ACCEPTANCE; no certificate regeneration, public tunnel or database exposure. USB disconnection breaks this loopback route. Record Chrome/macOS/Android versions and actual device, not only viewport dimensions. A missing lock icon alone does not diagnose TLS; inspect Chrome connection/security details without clicking through certificate errors.

## 1. Actor sheet and wallet baseline

Record only public account IDs and roles: original fund owner, designated agent, independent verifier(s) for each claim, recipient, optional guardian and organization admin. Confirm each account/network in its wallet. Do not use vault deployment key as agent/verifier. If one human controls multiple accounts, label role separation as account-level only; do not claim independent human verification.

Owner signs in using Meteor NEP-413, cancels once, confirms neutral cancellation/no authenticated session, retries, then selects organization. Second wallet must not see or mutate unrelated organization records. Logout and attempt a privileged request through the normal interface, then sign back in. Automated server-side session/nonce tests remain distinct from these observations. Record only outcome, account/network and safe reference, not cookies/nonces/signatures.

## 2. Deploy and verify (separate authorization required)

Owner-controlled deployment tool executes only the approved atomic DeployContract + `new` transaction from the package. Record actual hash and finalized receipt IDs; verify exact deployed code hash, keys, account, network, reserve and measured storage before enabling the M6 manifest. Any mismatch stops the run. Do not invent a hash or enable a mock deployment.

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

Current statuses: coordinated human session **pending**; genuine source **pending**; live deployment/financial acceptance **not authorized/pending**; physical Android integrated pass **pending**; iOS **deferred**; independent assessment **not performed**. At end disable new submissions, retain read-only reconciliation for unresolved operations and document any incident. No merge/public hosting/mainnet/funds approval is implied.
