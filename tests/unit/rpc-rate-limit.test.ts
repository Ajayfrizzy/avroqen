import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRpcCooldownForTests,
  readOnlyRpcFetch,
  retryAfterMs,
} from "../../services/chain/rpc-rate-limit";

const request: RequestInit = {
  method: "POST",
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "test",
    method: "query",
    params: { request_type: "view_access_key", finality: "final",
      account_id: "example.testnet", public_key: "example" },
  }),
};

afterEach(() => {
  clearRpcCooldownForTests();
  vi.restoreAllMocks();
});

describe("read-only RPC 429 handling", () => {
  it("uses the approved archival endpoint after 429, then cools down the primary", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", {
        status: 429,
        headers: { "Retry-After": "72" },
      }))
      .mockResolvedValue(new Response(JSON.stringify({
        jsonrpc: "2.0", id: "test", result: { permission: "FullAccess" },
      }), { status: 200 }));
    const now = () => 1_000;
    const first = await readOnlyRpcFetch("testnet", request, transport, now);
    expect(first.ok).toBe(true);
    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      "https://rpc.testnet.near.org",
      "https://archival-rpc.testnet.near.org",
    ]);
    const second = await readOnlyRpcFetch("testnet", request, transport, now);
    expect(second.ok).toBe(true);
    expect(transport.mock.calls[2]?.[0]).toBe(
      "https://archival-rpc.testnet.near.org",
    );
  });

  it("fails closed when every allowed provider returns 429", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("", { status: 429, headers: { "Retry-After": "72" } }),
    );
    const now = () => 1000;
    const response = await readOnlyRpcFetch("testnet", request, transport, now);
    expect(response.status).toBe(429);
    expect(transport).toHaveBeenCalledTimes(2);
    await expect(readOnlyRpcFetch("testnet", request, transport, now))
      .rejects.toThrow("RPC_RATE_LIMITED");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("rejects RPC mutations and malformed requests before any network I/O", async () => {
    const transport = vi.fn<typeof fetch>();
    for (const body of [
      JSON.stringify({ method: "broadcast_tx_commit" }),
      JSON.stringify({ method: "send_transaction" }),
      "not-json",
    ]) {
      await expect(readOnlyRpcFetch("testnet", { method: "POST", body }, transport))
        .rejects.toThrow("READ_ONLY_RPC_REQUIRED");
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("bounds Retry-After and accepts valid HTTP dates", () => {
    expect(retryAfterMs("72", 0)).toBe(72000);
    expect(retryAfterMs("999999", 0)).toBe(120000);
    expect(retryAfterMs(null, 0)).toBe(15000);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:01:00 GMT", 0)).toBe(60000);
    expect(retryAfterMs("invalid", 0)).toBe(15000);
  });

  it("does not treat an unauthorized key response as successful identity", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({
        jsonrpc: "2.0", id: "test",
        error: { code: -32000, message: "UNKNOWN_ACCESS_KEY" },
      }),
      { status: 200 },
    ));
    const response = await readOnlyRpcFetch("testnet", request, transport);
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});
