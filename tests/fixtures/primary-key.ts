import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { serialize } from "borsh";
import bs58 from "bs58";
import { vi } from "vitest";
import {
  type Challenge,
  createEngine,
} from "../../scripts/primary-key-verification/core.js";
import type { Policy } from "../../scripts/primary-key-verification/rpc.js";

export const fixturePair = () => {
  const pair = generateKeyPairSync("ed25519");
  return {
    ...pair,
    key: `ed25519:${bs58.encode(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32))}`,
  };
};
export function harness() {
  const primary = fixturePair(),
    testing = fixturePair();
  const policy = {
    account: "avroqen-vault.testnet",
    primary: primary.key,
    testing: testing.key,
  };
  let time = 1_794_074_400_000;
  const now = () => time;
  const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    const blockHash = bs58.encode(Buffer.alloc(32, 7));
    const pin = { block_hash: blockHash, block_height: 100 };
    let result: unknown;
    switch (request.method) {
      case "status":
        result = { chain_id: "testnet" };
        break;
      case "block":
        result = {
          header: {
            hash: blockHash,
            height: 100,
            timestamp_nanosec: String(BigInt(time) * 1_000_000n),
          },
        };
        break;
      case "query":
        if (request.params.request_type === "view_account")
          result = {
            ...pin,
            amount: "1",
            locked: "0",
            storage_usage: 1,
            code_hash: blockHash,
          };
        else if (request.params.request_type === "view_access_key_list")
          result = {
            ...pin,
            keys: [primary.key, testing.key].map((public_key) => ({
              public_key,
              access_key: { nonce: 1, permission: "FullAccess" },
            })),
          };
        else if (request.params.request_type === "view_access_key")
          result = { ...pin, nonce: 1, permission: "FullAccess" };
        else throw new Error("Unexpected RPC");
        break;
      default:
        throw new Error("Unexpected RPC");
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  });
  const engine = createEngine(policy, fetcher, now);
  return {
    engine,
    fetcher,
    primary,
    testing,
    policy,
    now,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
export function proof(
  c: Challenge,
  policy: Policy,
  pair: ReturnType<typeof fixturePair>,
  overrides: Record<string, unknown> = {},
) {
  // Independent Borsh serialization, not the implementation's messageDigest.
  const value = {
    message: c.message,
    nonce: [...Buffer.from(c.nonce, "base64")],
    recipient: c.recipient,
    callback: null,
    ...overrides,
  };
  const bytes = serialize(
    {
      struct: {
        tag: "u32",
        message: "string",
        nonce: { array: { type: "u8", len: 32 } },
        recipient: "string",
        callback: { option: "string" },
      },
    },
    { tag: 2147484061, ...value },
  );
  return {
    challengeId: c.challengeId,
    accountId: policy.account,
    network: "testnet",
    publicKey: pair.key,
    signature: sign(
      null,
      createHash("sha256").update(bytes).digest(),
      pair.privateKey,
    ).toString("base64"),
  };
}
