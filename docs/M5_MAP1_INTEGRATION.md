# M5 MAP-1 integration and controlled testnet path

MAP-1 is internal to Avroqen, not a NEAR standard. `packages/domain/src/evidence.ts`
parses all 16 canonical fields. u128 amounts and u64 nanoseconds are decimal strings;
UUIDs/digests are canonical lowercase. No floating-point token math. A signature
binds policy digest, org, proposal, metadata digest, complete source observation,
MAP-1 body, Origin, challenge ID/expiry; server binds its originating session.
NEP-413 uses a random 32-byte transport nonce distinct from the MAP-1 UUID nonce.

`attestationIntent` prepares `{evidence: MAP1}` for the existing Rust
`attest_proposal`. Signer must equal verifier_account; receiver is vault_account;
third-party deposit is 0; OWNER_APPROVED and owner's DELIVERY_DISPUTED attach exactly
1 yoctoNEAR. Owner and verifier direct-call restrictions remain. Compiled-contract
sandbox tests enforce exact fields, global signer/nonce replay and terminal disputes.
No offchain signature is submitted to this Rust method as authorization.

`apps/web/app/workspace/evidence/transaction-preview.ts` builds a pure
`TMeteorSdkV1Transaction` checked against pinned Meteor 3.24.1 types: one FunctionCall,
exact JSON args, 30 Tgas preview budget and exact deposit. It cannot sign or send.
This is not a completed public-network wallet transport. Modern MeteorConnect
`near::sign_transactions` instead takes native NEAR actions; the SDK exports
`convertSelectorActionToNearAction`. Future integration must convert explicitly,
target the exact account/network, set `useFunctionCallKey:false`, preserve the
existing prohibited local key store and request a separate wallet transaction prompt.
Never add function-call keys or silently use a cached key. Gas must be validated
against the approved deployed build before live use.

## Implemented versus pending

| Stage | Status |
| --- | --- |
| M2 immutable owner consent / M4 scoped offchain proposal | Implemented; no onchain authority |
| B2 human provenance + fresh wallet review | Implemented; human truth assertion, not automated provider proof |
| Strict MAP-1 / non-submitting intent / pinned SDK shape | Implemented and tested |
| Rust attestation validation and local sandbox execution | Implemented; local valueless sandbox, not public testnet |
| Public deployment verification/code hash/key governance | Pending separate approval and deployment work |
| Wallet transaction transport and finalized chain preflight | Pending controlled integration; no UI broadcast control |
| Public testnet attestation/payment/receipt reconciliation | Pending authorization and M6 work |

## Live sequence — preparation only, do not execute without approval

1. Obtain explicit authorization for the exact testnet contract deployment, network,
   account/key governance and spending bounds. Verify compiled Wasm/code hash and
   initialization; no mainnet. Available testnet balance is not authorization.
2. Owner separately signs storage credit and exact onchain mandate registration;
   compare canonical policy/digest against M2 and actual vault/network.
3. Owner explicitly funds the mandate; never allocate storage credit as payment funds.
4. Authorized agent registers the exact immutable M4 proposal ID, amount, recipient
   and digest onchain; existing M4 app bearer is not a blockchain signing credential.
5. Independent designated human retrieves source records and signs fresh scoped
   review; obtain any distinct per-claim verifier quorum and separate owner approval.
6. Before each separately authorized wallet attestation, validate finalized code,
   mandate active status, proposal state, every MAP-1 field, signer/key/claim scope,
   expiry and nonce, and reshow exact readable terms. Submit only approved function
   and deposit. App prepared/ready status alone cannot pass these future gates.
7. A DELIVERY_DISPUTED transaction must actually reach the contract before dispatch
   to block execution there; a local dispute cannot undo an already dispatched call.
8. Owner explicitly signs authorize_and_execute after contract checks. M6 must
   observe finalized transaction/receipt outcomes, distinguish pending/unknown from
   definitive failure, and reconcile reservations without automatic retries.

No public transaction hashes or receipts exist for M5. Do not fabricate links or
show CONFIRMED based on a backend response. Human wallet/device acceptance and
independent security review are separate from automated fixture results.
