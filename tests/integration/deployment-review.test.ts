import { once } from "node:events";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import {
  PUBLIC_KEY,
  SHA256,
} from "../../packages/domain/src/deployment-preview.js";
import { inspectSdk } from "../../scripts/deployment-review/sdk-inspection.js";
import {
  createReviewer,
  observe,
} from "../../scripts/deployment-review/server.js";

const servers: ReturnType<typeof createReviewer>[] = [];
async function start(live = false, provider?: () => Promise<unknown>) {
  const server = createReviewer(live, provider);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve, reject) => {
          s.close((e) => (e ? reject(e) : resolve()));
          s.closeAllConnections();
        }),
    ),
  );
});
it("round-trips the full approved artifact through actual pinned Meteor serialization", async () => {
  const { evidence } = await inspectSdk();
  expect(evidence.artifactSha256).toBe(SHA256);
  expect(evidence.publicKey).toBe(PUBLIC_KEY);
  expect(evidence.artifactBytes).toBe(366735);
  expect(evidence.base64Characters).toBeGreaterThan(480000);
  expect(evidence.actionOrder).toEqual(["DeployContract", "FunctionCall"]);
  expect(evidence.deposit).toBe("0");
});
it("serves a deterministic no-script preview without cookies or a wallet API", async () => {
  const provider = vi.fn();
  const base = await start(false, provider);
  const a = await fetch(`${base}/inspection.json`);
  const b = await fetch(`${base}/inspection.json`);
  expect(await a.text()).toBe(await b.text());
  expect(provider).not.toHaveBeenCalled();
  expect(a.headers.get("set-cookie")).toBeNull();
  expect(a.headers.get("content-security-policy")).toContain(
    "script-src 'none'",
  );
  const html = await (await fetch(base)).text();
  expect(html).toContain("Offline historical preview");
  expect(html).not.toMatch(/<script|<form|<iframe/);
  for (const path of ["/sign", "/broadcast", "/api/auth/config", "/../.env"]) {
    expect((await fetch(base + path)).status).toBe(404);
  }
  expect((await fetch(base, { method: "POST" })).status).toBe(405);
  expect(
    await new Promise((resolve) => {
      const req = request(base, { headers: { Host: "evil.test" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.end();
    }),
  ).toBe(403);
  expect(
    (await fetch(base, { headers: { Origin: "https://evil.test" } })).status,
  ).toBe(403);
  expect(
    (await fetch(base, { headers: { "Sec-Fetch-Site": "cross-site" } })).status,
  ).toBe(403);
});
it("fails closed and sanitizes RPC and invalid account errors, without retaining successful state", async () => {
  const fixture = JSON.parse(
    readFileSync("docs/evidence/DEPLOYMENT_KEY_GATE_ACCOUNT.json", "utf8"),
  );
  fixture.observedAtUtc = new Date().toISOString();
  fixture.block.timestampNanosec = (BigInt(Date.now()) * 1000000n).toString();
  const provider = vi
    .fn()
    .mockResolvedValueOnce(fixture)
    .mockRejectedValueOnce(new Error("INTERNAL_SENTINEL"));
  const base = await start(true, provider);
  expect((await fetch(base)).status).toBe(200);
  const denied = await fetch(base);
  expect(denied.status).toBe(503);
  expect(await denied.text()).not.toContain("INTERNAL_SENTINEL");
});
it("pins read-only account/key queries to fresh final block and never sends transaction methods", async () => {
  const fixture = JSON.parse(
    readFileSync("docs/evidence/DEPLOYMENT_KEY_GATE_ACCOUNT.json", "utf8"),
  );
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => {
    const { method, params } = JSON.parse(String(options?.body));
    calls.push({ method, params });
    let result: unknown;
    if (method === "status") result = { chain_id: "testnet" };
    else if (method === "block")
      result = {
        header: {
          ...fixture.block,
          timestamp_nanosec: (BigInt(Date.now()) * 1000000n).toString(),
        },
      };
    else if (method === "query")
      result =
        params.request_type === "view_account"
          ? fixture.account
          : {
              block_hash: fixture.block.hash,
              block_height: fixture.block.height,
              keys: fixture.keys.map(
                (k: { publicKey: string; permission: string }) => ({
                  public_key: k.publicKey,
                  access_key: { permission: k.permission },
                }),
              ),
            };
    else if (method === "gas_price") result = { gas_price: fixture.gasPrice };
    else
      result = {
        protocol_version: 88,
        runtime_config: {
          storage_amount_per_byte: fixture.storageAmountPerByte,
        },
      };
    return new Response(JSON.stringify({ result }));
  }) as typeof fetch;
  const result = await observe(fetcher);
  expect(result.accountId).toBe("avroqen-vault.testnet");
  expect(calls.map((c) => c.method)).toEqual([
    "status",
    "block",
    "query",
    "query",
    "EXPERIMENTAL_protocol_config",
    "gas_price",
  ]);
  for (const c of calls.filter((c) => c.method === "query"))
    expect(c.params.block_id).toBe(fixture.block.hash);
});
it("rejects a wrong network before querying the account", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ result: { chain_id: "mainnet" } })),
  ) as typeof fetch;
  await expect(observe(fetcher)).rejects.toThrow("NETWORK_MISMATCH");
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(["stale block", "key block mismatch", "RPC error"])(
  "rejects %s in the live read-only path",
  async (fault) => {
    const fixture = JSON.parse(
      readFileSync("docs/evidence/DEPLOYMENT_KEY_GATE_ACCOUNT.json", "utf8"),
    );
    const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const { method, params } = JSON.parse(String(options?.body));
      if (fault === "RPC error")
        return new Response(
          JSON.stringify({ error: { message: "INTERNAL_SENTINEL" } }),
        );
      let result: unknown;
      if (method === "status") result = { chain_id: "testnet" };
      else if (method === "block")
        result = {
          header: {
            ...fixture.block,
            timestamp_nanosec: (
              (BigInt(Date.now()) -
                BigInt(fault === "stale block" ? 300000 : 0)) *
              1000000n
            ).toString(),
          },
        };
      else if (method === "query")
        result =
          params.request_type === "view_account"
            ? fixture.account
            : {
                block_hash:
                  fault === "key block mismatch" ? "wrong" : fixture.block.hash,
                block_height: fixture.block.height,
                keys: [],
              };
      else if (method === "gas_price") result = { gas_price: fixture.gasPrice };
      else
        result = {
          protocol_version: 88,
          runtime_config: {
            storage_amount_per_byte: fixture.storageAmountPerByte,
          },
        };
      return new Response(JSON.stringify({ result }));
    }) as typeof fetch;
    await expect(observe(fetcher)).rejects.toThrow(
      fault === "stale block"
        ? "STALE_FINALIZED_BLOCK"
        : fault === "key block mismatch"
          ? "BLOCK_MISMATCH"
          : "RPC_UNAVAILABLE",
    );
  },
);
