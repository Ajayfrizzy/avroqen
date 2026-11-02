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
