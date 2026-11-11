# November 11, 2026 — corrected vault code replacement and acceptance boundary

This is a dated record of **owner-executed NEAR Testnet activity**, reported in the interactive owner session. The author of this record did not possess private credentials, independently broadcast the transaction, or perform the commands on the owner's Mac. The owner supplied read-only public RPC query results and local signed-envelope verification output. Earlier November 7 initialization evidence remains historical and is **not** overwritten.

## What was actually performed

- Account/network: `avroqen-vault.testnet` / NEAR **Testnet**; existing initialized account was **not recreated**.
- The owner separately authorized local signing and then the exact broadcast. The owner used the existing Testing FullAccess key: `ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G`.
- A protected private signed file was created on the owner machine. Local independent Borsh parsing checked **one DeployContract action**, signer = receiver = existing vault, exact Testing public key, exact corrected Wasm, and a valid Ed25519 signature. **No `new` initialization call, Transfer, AddKey or DeleteKey action** was present.
- Corrected Wasm length: **367353 bytes**; SHA-256 `d2ec5048af0577b60c0aef4ecfd1aad1def4289828c841b2d7a7f83dd0f8428d`. Earlier deployed Wasm was 366735 bytes with SHA-256 `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`.
- Authorized signed transaction: `DZW3rgRCh4wvqYxPyQrVcTWzWZnpR13mowZ9QtXxzFM2`; nonce `276402391000002`; reference block `ALSzd5AFLy4WacDFDyXdiYqRCiFmxZT98khkLPyZ5T8G`, height `277204201`.
- Before broadcast, owner RPC reported unused Testing-key nonce `276402391000001`; reference block distance 1825 at height 277206026 versus reported protocol transaction-validity period 86400. These are **time-bounded** preflight observations.
- The CLI command printed no result under `--quiet`. The owner then queried the **same transaction hash** read-only: execution `{"SuccessValue":""}`, final execution status `FINAL`, **two receipt outcomes, zero failed receipts**. The signed command was not rerun during the reported session.
- Post-deployment read-only queries were pinned to finalized block **277208022** and reported:
  - `view_code` SHA-256 exactly `d2ec5048af0577b60c0aef4ecfd1aad1def4289828c841b2d7a7f83dd0f8428d`; code length 367353 bytes.
  - Both existing public keys retained, both FullAccess, no extra key: Testing above and Primary `ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz`.
  - `get_accounting` still readable: `network=testnet`, `vault=avroqen-vault.testnet`, and `available`, `payment_reserved`, `withdrawal_pending`, `storage_credit`, `storage_locked`, `unallocated_owner_balance` all zero; reported `account_balance` matches `view_account.amount`.
  - `storage_usage=367786` bytes (618-byte increase); account balance `4394387651746143900000000` yoctoNEAR (**4.3943876517461439 NEAR**). Reported backing covers measured storage and 0.1 NEAR protocol reserve.

Public transaction reference: https://testnet.nearblocks.io/txns/DZW3rgRCh4wvqYxPyQrVcTWzWZnpR13mowZ9QtXxzFM2

## What this proves — and does not prove

**Confirmed from owner-reported checks:** finalized successful contract replacement; exact new deployed code digest; same two active FullAccess public keys; readable initialized contract state; no recorded active financial allocations/reservations/withdrawal obligations at sampled finalized block.

**Not performed/proven in this checkpoint:** no new mandate registration, storage credit deposit, escrow funding, agent proposal, authentic independent-source verification, verifier's onchain `attest_proposal`, distinct owner `OWNER_APPROVED` attestation, native token execution, recipient balance-delta proof, or complete M8 financial acceptance. No public production launch, independent external security audit, key deletion/revocation or governance migration. Application submission stayed **`M6_TRANSACTIONS_ENABLED=false`**; mere manifestation of deployment data must not change it. Historical unexplained balance decrease before this replacement was not investigated to a conclusive cause. No proof was obtained ruling out every possible in-flight asynchronous callback; a zero-obligation read is not that proof. Receipt-level burned gas/refunds are **not yet individually reconciled**; balance changes alone are not a fee receipt.

**Primary-key terminology:** prior narrowly scoped Primary-key proof was labeled **BLOCKED** in D026. That does not assert the owner lacks custody of their existing account. Owner controls the account and completed this replacement through Testing. Further Primary-key proof is **not a prerequisite to documenting this completed event**, and is not silently marked passed. The owner has not authorized removing either key.

**Security caveat:** Testing and Primary retain FullAccess powers over this **dedicated low-value hackathon account**. These powers can bypass contract restrictions through account-level code replacement/direct transfers. The corrected contract rejects newly registered or proposed verifier identity overlap with owner, agent, recipient and vault; that source behavior is now deployed, but the new deployment alone is not proof of a real independently attested payment. Existing historical policies and callback/in-flight limitations require separate treatment.

## Next operational checkpoints

1. Update deployment metadata/manifest using this **measured** digest, correct public-key permission fingerprints, Testnet network and this authorization reference, **read-only first**, with `M6_TRANSACTIONS_ENABLED=false`. Verify complete fields and fresh finalized onchain code/key/domain evidence; no key or financial transaction is implied.
2. Perform separately authorized **real Testnet financial acceptance** with genuine original-owner, restricted agent, independently controlled verifier and recipient. Obtain independent source evidence, separate onchain claim attestations and owner approval, final execution/callback receipts, exact account and recipient deltas, negative tests and safe UNKNOWN handling. Specify gas/storage/transfer caps before enabling submissions.
3. Keep the user/organization-owned **non-custodial vault roadmap** in [vault governance](../VAULT_GOVERNANCE.md): separate vault per user or organization, versioned verified factory, owner-controlled governance, no platform master withdrawal/upgrade keys. This is **future architecture**, not implemented in the current shared Testnet demonstration account.
4. After reconciliation, review sensitive temporary signed-file retention/secure removal on the **owner device** only. Do not commit or print signed envelopes, keys or source evidence.

This record grants no new deployment, key mutation, financial activation, transfer, production release or spending authority.
