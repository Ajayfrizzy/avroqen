# MandateVault compatibility Wasm fixtures

These immutable bytes exist only to reproduce the local old-to-new state
compatibility and rollback regression in `upgrade_compatibility.rs`. Tracking a
fixture is not approval to deploy it, sign a deployment transaction, or replace
the code on `avroqen-vault.testnet`.

## State-v1 fixtures

| Fixture | Size | SHA-256 | Provenance |
| --- | ---: | --- | --- |
| `state-v1/mandate-vault-old-b2ce7469.wasm` | 366735 bytes | `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48` | Byte-for-byte copy of the existing approved historical artifact at `docs/evidence/mandate-vault-approved.wasm`. |
| `state-v1/mandate-vault-candidate-d2ec5048.wasm` | 367353 bytes | `d2ec5048af0577b60c0aef4ecfd1aad1def4289828c841b2d7a7f83dd0f8428d` | Byte-for-byte copy of the locally reviewed corrected candidate associated with source commit `7363adc637f3c7b583920c3e016d46cfb70009ce`. |

The candidate contains absolute Cargo source paths from the review host. Its
hash was reproducible on that same host, but a normal build in a different
checkout or on GitHub Actions is not expected to reproduce the same bytes.
Pinning the reviewed bytes here makes the regression portable; it does not turn
the fixture into a reproducible release build or an approved live deployment
artifact.

Neither fixture contains wallet credentials, private keys, signatures, signed
transactions, deployment authorization, or protected runtime evidence. The
regression verifies each size and SHA-256 before starting its disposable local
NEAR sandbox.

Source or toolchain changes must not silently replace either file. Any fixture
change requires separate byte-level review, a newly recorded size and SHA-256,
an explicit compatibility assessment, and owner approval. Current Rust build
output under `target/` is deliberately not consulted by the regression.
