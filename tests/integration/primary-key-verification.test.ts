import { expect, it } from "vitest";
import { createEngine } from "../../scripts/primary-key-verification/core.js";
import { RPC } from "../../scripts/primary-key-verification/rpc.js";
import { harness, proof } from "../fixtures/primary-key.js";

it("only issues read-only RPC, pins all queries and checks exact key at the same block", async () => {
  const h = harness(),
    c = h.engine.issue();
  await h.engine.verify(proof(c, h.policy, h.primary));
  const calls = h.fetcher.mock.calls.map(([url, options]) => {
    expect(url).toBe(RPC);
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    return JSON.parse(String(options?.body));
  });
  expect(calls.map((c) => c.method)).toEqual([
    "status",
    "block",
    "query",
    "query",
    "query",
  ]);
  expect(calls[1].params).toEqual({ finality: "final" });
  for (const c of calls.slice(2)) {
    expect(c.params.account_id).toBe(h.policy.account);
    expect(c.params.block_id).toBeDefined();
    expect(c.params).not.toHaveProperty("finality");
    expect(c.params.block_id).toBe(calls[2].params.block_id);
  }
  expect(calls[4].params.public_key).toBe(h.policy.primary);
});
const mutations = [
  "chain",
  "id",
  "jsonrpc",
  "rpc-error",
  "missing",
  "http",
  "json",
  "throw",
  "stale",
  "future",
  "negative-time",
  "bad-hash",
  "height",
  "unpin-hash",
  "unpin-height",
  "account",
  "third",
  "missing-key",
  "duplicate-key",
  "substituted-key",
  "restricted-list",
  "restricted-primary",
  "bad-nonce",
  "inconsistent-nonce",
  "expire-during-rpc",
  "cancel-during-rpc",
  "rollback-during-rpc",
] as const;
it.each(mutations)(
  "fails closed on %s, redacts errors and never retries a failed proof",
  async (kind) => {
    const h = harness();
    const fetcher: typeof fetch = async (url, options) => {
      const request = JSON.parse(String(options?.body));
      if (kind === "http")
        return new Response("provider secret", { status: 503 });
      if (kind === "json") return new Response("invalid json");
      if (kind === "throw") throw new Error("signature and provider secret");
      const response = await h.fetcher(url, options);
      const body = await response.json();
      if (kind === "id") body.id = "wrong";
      if (kind === "jsonrpc") body.jsonrpc = "1.0";
      if (kind === "rpc-error") body.error = { message: "provider secret" };
      if (kind === "missing") delete body.result;
      if (kind === "chain" && request.method === "status")
        body.result.chain_id = "mainnet";
      if (request.method === "block") {
        if (kind === "stale")
          body.result.header.timestamp_nanosec = String(
            BigInt(h.now() - 120001) * 1_000_000n,
          );
        if (kind === "future")
          body.result.header.timestamp_nanosec = String(
            BigInt(h.now() + 5001) * 1_000_000n,
          );
        if (kind === "negative-time")
          body.result.header.timestamp_nanosec = "-1";
        if (kind === "bad-hash") body.result.header.hash = "not-a-hash";
        if (kind === "height") body.result.header.height = -1;
      }
      if (request.method === "query") {
        if (kind === "unpin-hash") body.result.block_hash = "wrong";
        if (kind === "unpin-height") body.result.block_height = 101;
        if (
          kind === "account" &&
          request.params.request_type === "view_account"
        )
          body.result.amount = "1.2";
        if (request.params.request_type === "view_access_key_list") {
          const keys = body.result.keys;
          if (kind === "third") keys.push({ ...keys[0] });
          if (kind === "missing-key") keys.pop();
          if (kind === "duplicate-key") keys[1] = keys[0];
          if (kind === "substituted-key")
            keys[1].public_key = "ed25519:unknown";
          if (kind === "restricted-list")
            keys[1].access_key.permission = { FunctionCall: {} };
        }
        if (request.params.request_type === "view_access_key") {
          if (kind === "restricted-primary")
            body.result.permission = { FunctionCall: {} };
          if (kind === "bad-nonce")
            body.result.nonce = Number.MAX_SAFE_INTEGER + 1;
          if (kind === "inconsistent-nonce") body.result.nonce = 2;
          if (kind === "expire-during-rpc") h.advance(300000);
          if (kind === "cancel-during-rpc") engine.cancel(c.challengeId);
          if (kind === "rollback-during-rpc") h.advance(-1);
        }
      }
      return Response.json(body);
    };
    const engine = createEngine(h.policy, fetcher, h.now),
      c = engine.issue(),
      p = proof(c, h.policy, h.primary);
    await expect(engine.verify(p)).rejects.toThrow(
      "PRIMARY_VERIFICATION_FAILED",
    );
    await expect(engine.verify(p)).rejects.toThrow("CHALLENGE_UNAVAILABLE");
  },
);
it("rechecks block age at completion, not only when block arrives", async () => {
  const h = harness();
  const fetcher: typeof fetch = async (url, options) => {
    const response = await h.fetcher(url, options);
    const req = JSON.parse(String(options?.body));
    if (req.params.request_type === "view_access_key") h.advance(120001);
    return response;
  };
  const engine = createEngine(h.policy, fetcher, h.now),
    c = engine.issue();
  await expect(engine.verify(proof(c, h.policy, h.primary))).rejects.toThrow();
});

it("accepts reversed approved keys and exact freshness boundaries", async () => {
  for (const age of [120000, -5000]) {
    const h = harness();
    const fetcher: typeof fetch = async (url, options) => {
      const result = await h.fetcher(url, options),
        body = await result.json();
      const req = JSON.parse(String(options?.body));
      if (req.method === "block")
        body.result.header.timestamp_nanosec = String(
          BigInt(h.now() - age) * 1_000_000n,
        );
      if (req.params.request_type === "view_access_key_list")
        body.result.keys.reverse();
      return Response.json(body);
    };
    const engine = createEngine(h.policy, fetcher, h.now),
      c = engine.issue();
    await expect(
      engine.verify(proof(c, h.policy, h.primary)),
    ).resolves.toBeDefined();
  }
});

it("fails closed on RPC timeout without exposing provider data", async () => {
  const h = harness();
  const fetcher: typeof fetch = async () => {
    throw new DOMException("provider details", "TimeoutError");
  };
  const engine = createEngine(h.policy, fetcher, h.now),
    c = engine.issue();
  await expect(engine.verify(proof(c, h.policy, h.primary))).rejects.toThrow(
    "PRIMARY_VERIFICATION_FAILED",
  );
  await expect(engine.verify(proof(c, h.policy, h.primary))).rejects.toThrow(
    "CHALLENGE_UNAVAILABLE",
  );
});

it("exposes only fixed diagnostic flags, never a partial success", async () => {
  const h = harness();
  const engine = createEngine(
    h.policy,
    async () => {
      throw new Error("RPC secret");
    },
    h.now,
  );
  const c = engine.issue();
  await expect(
    engine.verify(proof(c, h.policy, h.primary)),
  ).rejects.toMatchObject({
    message: "PRIMARY_VERIFICATION_FAILED",
    signatureValid: true,
    permissionValid: false,
  });
  const d = engine.issue();
  await expect(
    engine.verify(proof(d, h.policy, h.testing)),
  ).rejects.toMatchObject({ signatureValid: false, permissionValid: false });
});
