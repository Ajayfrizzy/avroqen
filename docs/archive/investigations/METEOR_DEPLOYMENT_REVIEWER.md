# Local deployment reviewer usage

> **Historical archive:** retained implementation/preparation evidence, not current
> operational authority. See [active documentation](../../README.md) and the
> [archive index](../README.md) for provenance and current replacement guidance.

This is an isolated **preview only** server. No wallet button, credential input, signing or broadcasting capability exists. You do not need to connect or unlock Meteor. Do not enter keys or seed phrases anywhere.

From the repository root with the existing pinned dependencies:

```sh
node --import tsx scripts/deployment-review/server.ts
```

Open **http://127.0.0.1:3456/** on the same computer. This default deterministic mode makes no external network requests; it labels the November4 snapshot **Offline historical preview — not current chain readiness**. Inspect both actions, exact hash/size, argument bytes, network, signer/receiver, zero deposit,100Tgas and cost breakdown. `/inspection.json` contains public inspection details only, not an unsigned or signed transaction.

For a fresh public account observation, stop the server with Ctrl-C and run:

```sh
node --import tsx scripts/deployment-review/server.ts --live-read-only
```

The URL is unchanged. This makes fixed read-only HTTPS requests to `https://rpc.testnet.near.org`, never wallet/API requests. Reload triggers a new observation, not a transaction. If any check fails, the page says **Preview blocked**; stop and investigate without weakening a check. A successful observation expires conceptually as soon as chain state changes; it does not authorize deployment later. Do not change `.env` or `M6_TRANSACTIONS_ENABLED`.

Local HTTP here serves public data without cookies, login or scripts; it does not replace the app's HTTPS authentication stack or relax its cookie policy. No LAN listener, tunnel, public hosting, CA regeneration or proxy change is needed. Mobile viewport tests are automated only; do not infer physical Android/Meteor deployment compatibility.

Expected inspection:

- Network Testnet; signer and receiver `avroqen-vault.testnet`.
- First action DeployContract,366735bytes, SHA-256 `b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48`.
- Second action FunctionCall `new`; UTF-8 `{"network":"testnet"}`; base64 `eyJuZXR3b3JrIjoidGVzdG5ldCJ9`;100000000000000gas;0yoctoNEAR deposit.
- One existing owner-controlled FullAccess key, exact fingerprint and finalized observation block.
- No nonce or signing block prepared; wallet invocation unavailable; compatibility blocked pending actual wallet review.

Retained FullAccess can replace code and transfer funds outside MandateVault. This is a low-value Testnet demonstration architecture, not immutable or production approval.

Evidence you may collect: public inspection JSON, screenshot of public review terms, mode and observation timestamp, Git commit, test result summary. Do not collect wallet storage, private keys, authentication payloads, signatures or session tokens.

Stop with Ctrl-C. The process has no database access and cannot modify organization/mandate/proposal data. See [compatibility assessment](METEOR_DEPLOYMENT_COMPATIBILITY.md) for prerequisites before a separately authorized wallet review-and-cancel session. Do not try a signing prompt during this phase.
