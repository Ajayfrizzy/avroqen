import { expect, it } from "vitest";
import { deploymentConfig, NearReader } from "../../services/chain/rpc.js";

it("disables live transactions without explicit complete approved manifest", () => {
  expect(deploymentConfig({})).toBeNull();
  expect(() => deploymentConfig({ M6_TRANSACTIONS_ENABLED: "true" })).toThrow();
});
it.each([
  "http://127.0.0.1:1",
  "https://rpc.mainnet.near.org",
  "https://evil.test",
])("rejects unapproved RPC %s", (endpoint) => {
  expect(() => new NearReader(endpoint)).toThrow();
});
it.each(["broadcast_tx_commit", "send_tx", "broadcast_tx_async"])(
  "reader cannot submit %s",
  async (method) => {
    await expect(new NearReader().rpc(method, {})).rejects.toThrow(
      "READ_ONLY_RPC",
    );
  },
);
it("sanitizes provider errors and rejects redirects/non-JSON responses", async () => {
  const transport: typeof fetch = async () =>
    new Response(JSON.stringify({ error: { message: "private diagnostic" } }), {
      status: 200,
    });
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).rejects.toThrow("RPC_UNAVAILABLE");
});
it("fails closed on wrong network before code or keys are considered", async () => {
  const transport: typeof fetch = async () =>
    new Response(JSON.stringify({ result: { chain_id: "mainnet" } }));
  await expect(
    new NearReader(undefined, transport).deployment({
      account: "vault.testnet",
      network: "testnet",
      wasmSha256: "a".repeat(64),
      keyFingerprints: ["b".repeat(64)],
      authorization: "fixture-authorization",
    }),
  ).rejects.toThrow();
});

it.each(["code", "keys", "domain", "block"])(
  "detects unexpected deployment %s from pinned RPC evidence",
  async (change) => {
    const { createHash } = await import("node:crypto");
    const { default: bs58 } = await import("bs58");
    const { fingerprint } = await import("../../services/chain/rpc.js");
    const bytes = Buffer.from("fixture-code"),
      digest = createHash("sha256").update(bytes).digest(),
      block = bs58.encode(Buffer.alloc(32, 1)),
      other = bs58.encode(Buffer.alloc(32, 2));
    const key = "ed25519:fixture-public-key";
    const transport: typeof fetch = async (_url, init) => {
      const q = JSON.parse(String(init?.body));
      let result: unknown;
      if (q.method === "status") result = { chain_id: "testnet" };
      else if (q.method === "block")
        result = {
          header: {
            hash: block,
            prev_hash: other,
            height: 100,
            timestamp_nanosec: "1",
          },
          chunks: [],
        };
      else if (q.params.request_type === "view_code")
        result = {
          block_hash: change === "block" ? other : block,
          hash: bs58.encode(digest),
          code_base64: (change === "code"
            ? Buffer.from("altered")
            : bytes
          ).toString("base64"),
        };
      else if (q.params.request_type === "view_account")
        result = {
          block_hash: block,
          code_hash: bs58.encode(digest),
          amount: "1",
          storage_usage: 1,
        };
      else if (q.params.request_type === "view_access_key_list")
        result = {
          block_hash: block,
          keys: [
            {
              public_key: key,
              access_key: {
                permission:
                  change === "keys" ? { FunctionCall: {} } : "FullAccess",
              },
            },
          ],
        };
      else
        result = {
          block_hash: block,
          result: [
            ...Buffer.from(
              JSON.stringify({
                network: "testnet",
                vault: change === "domain" ? "evil.testnet" : "vault.testnet",
              }),
            ),
          ],
        };
      return new Response(JSON.stringify({ result }));
    };
    await expect(
      new NearReader(undefined, transport).deployment({
        account: "vault.testnet",
        network: "testnet",
        wasmSha256: digest.toString("hex"),
        keyFingerprints: [fingerprint(`${key}:"FullAccess"`)],
        authorization: "fixture-authorization",
      }),
    ).rejects.toThrow(
      (
        {
          code: "DEPLOYMENT_CODE_MISMATCH",
          keys: "DEPLOYMENT_KEY_MISMATCH",
          domain: "DEPLOYMENT_DOMAIN_MISMATCH",
          block: "RPC_BLOCK_MISMATCH",
        } as Record<string, string>
      )[change],
    );
  },
);
