// Read-only public RPC evidence. No wallet, signer, credentials or transaction methods.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const endpoint = "https://rpc.testnet.near.org";
const accountId = "avroqen-vault.testnet";
async function rpc(method, params) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "m8-read-only",
      method,
      params,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Read-only RPC HTTP ${r.status}`);
  const body = await r.json();
  if (body.error) throw new Error(`Read-only RPC ${method} failed`);
  return body.result;
}
const status = await rpc("status", []);
if (status.chain_id !== "testnet") throw new Error("Network mismatch");
const block = await rpc("block", { finality: "final" });
const blockId = block.header.hash;
const [account, keys, protocol, gas] = await Promise.all([
  rpc("query", {
    request_type: "view_account",
    block_id: blockId,
    account_id: accountId,
  }),
  rpc("query", {
    request_type: "view_access_key_list",
    block_id: blockId,
    account_id: accountId,
  }),
  rpc("EXPERIMENTAL_protocol_config", { block_id: blockId }),
  rpc("gas_price", [blockId]),
]);
if ([account.block_hash, keys.block_hash].some((hash) => hash !== blockId))
  throw new Error("Unpinned account observation");
const wasm = await readFile(
  "target/wasm32-unknown-unknown/release/mandate_vault.wasm",
);
const result = {
  observedAtUtc: new Date().toISOString(),
  endpoint,
  network: status.chain_id,
  accountId,
  finality: "final",
  block: {
    height: block.header.height,
    hash: blockId,
    timestampNanosec: block.header.timestamp_nanosec,
  },
  account,
  keys: keys.keys.map((k) => ({
    publicKey: k.public_key,
    permission: k.access_key.permission,
    fingerprint: createHash("sha256")
      .update(`${k.public_key}:${JSON.stringify(k.access_key.permission)}`)
      .digest("hex"),
  })),
  protocolVersion: protocol.protocol_version,
  storageAmountPerByte: protocol.runtime_config.storage_amount_per_byte,
  transactionCosts: protocol.runtime_config.transaction_costs,
  gasPrice: gas.gas_price,
  artifact: {
    path: "target/wasm32-unknown-unknown/release/mandate_vault.wasm",
    bytes: wasm.length,
    sha256: createHash("sha256").update(wasm).digest("hex"),
  },
  scope:
    "Read-only public account observation; not ownership proof or deployment/transaction authorization.",
};
await writeFile(
  process.argv[2] ?? "docs/evidence/M8_TESTNET_ACCOUNT.json",
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    block: result.block,
    account: result.account,
    keyCount: result.keys.length,
    artifact: result.artifact,
    gasPrice: result.gasPrice,
    storageAmountPerByte: result.storageAmountPerByte,
  }),
);
