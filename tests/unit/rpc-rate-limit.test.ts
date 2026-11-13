import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRpcCooldownForTests,
  type RpcDiagnostic,
  readOnlyRpcFetch,
  retryAfterMs,
} from "../../services/chain/rpc-rate-limit";

const request: RequestInit = {
  method: "POST",
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "test",
    method: "query",
    params: {
      request_type: "view_access_key",
      finality: "final",
      account_id: "example.testnet",
      public_key: "example",
    },
  }),
};

afterEach(() => {
  clearRpcCooldownForTests();
  vi.restoreAllMocks();
});

describe("read-only RPC 429 handling", () => {
  it("uses the secondary current provider after 429, then cools down the primary", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          headers: { "Retry-After": "72" },
        }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: "test",
              result: { permission: "FullAccess" },
            }),
            { status: 200 },
          ),
        ),
      );
    const now = () => 1_000;
    const first = await readOnlyRpcFetch("testnet", request, transport, now);
    expect(first.ok).toBe(true);
    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      "https://rpc.testnet.fastnear.com",
      "https://rpc.testnet.near.org",
    ]);
    const second = await readOnlyRpcFetch("testnet", request, transport, now);
    expect(second.ok).toBe(true);
    expect(transport.mock.calls[2]?.[0]).toBe("https://rpc.testnet.near.org");
  });

  it("uses a fresh signal and falls back after a provider timeout", async () => {
    const signals: AbortSignal[] = [];
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const signal = init?.signal as AbortSignal;
      signals.push(signal);
      if (signals.length === 1)
        return new Promise<Response>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        );
      return new Response("ok");
    });
    const response = await readOnlyRpcFetch(
      "testnet",
      request,
      transport,
      Date.now,
      { perProviderTimeoutMs: 5, overallTimeoutMs: 100 },
    );
    expect(response.ok).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("bounds archival-first historical fallback exhaustion", async () => {
    const calls: string[] = [];
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      calls.push(String(url));
      if (url === "https://rpc.testnet.fastnear.com")
        return new Response("UNKNOWN_BLOCK");
      const signal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    });
    await expect(
      readOnlyRpcFetch("testnet", request, transport, Date.now, {
        preferArchival: true,
        perProviderTimeoutMs: 20,
        overallTimeoutMs: 35,
        retryResponse: async (response) =>
          (await response.text()) === "UNKNOWN_BLOCK",
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(calls).toEqual([
      "https://archival-rpc.testnet.near.org",
      "https://rpc.testnet.fastnear.com",
      "https://rpc.testnet.near.org",
    ]);
  });

  it("serializes archival calls through the bounded concurrency gate", async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const transport = vi.fn<typeof fetch>(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return new Response("ok");
    });
    const options = {
      preferArchival: true,
      perProviderTimeoutMs: 1_000,
      overallTimeoutMs: 2_000,
    };
    const first = readOnlyRpcFetch(
      "testnet",
      request,
      transport,
      Date.now,
      options,
    );
    const second = readOnlyRpcFetch(
      "testnet",
      request,
      transport,
      Date.now,
      options,
    );
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(maximum).toBe(1);
  });

  it("prioritizes interactive archival evidence over queued background reads", async () => {
    const order: string[] = [];
    const releases: Array<() => void> = [];
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const marker = JSON.parse(String(init?.body)).marker as string;
      order.push(marker);
      await new Promise<void>((resolve) => releases.push(resolve));
      return new Response("ok");
    });
    const call = (marker: string, priority: "interactive" | "background") =>
      readOnlyRpcFetch(
        "testnet",
        {
          ...request,
          body: JSON.stringify({ ...JSON.parse(String(request.body)), marker }),
        },
        transport,
        Date.now,
        {
          preferArchival: true,
          priority,
          perProviderTimeoutMs: 1_000,
          overallTimeoutMs: 3_000,
        },
      );
    const active = call("active-background", "background");
    const background = call("queued-background", "background");
    const interactive = call("interactive", "interactive");
    await vi.waitFor(() => expect(order).toEqual(["active-background"]));
    releases.shift()?.();
    await vi.waitFor(() =>
      expect(order).toEqual(["active-background", "interactive"]),
    );
    releases.shift()?.();
    await vi.waitFor(() => expect(order).toHaveLength(3));
    releases.shift()?.();
    await expect(
      Promise.all([active, background, interactive]),
    ).resolves.toHaveLength(3);
    expect(order).toEqual([
      "active-background",
      "interactive",
      "queued-background",
    ]);
  });

  it("bounds all current RPC attempts and prioritizes queued interactive work", async () => {
    let active = 0;
    let maximum = 0;
    const order: string[] = [];
    const releases: Array<() => void> = [];
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const marker = JSON.parse(String(init?.body)).marker as string;
      order.push(marker);
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return new Response("ok");
    });
    const call = (marker: string, priority: "interactive" | "background") =>
      readOnlyRpcFetch(
        "testnet",
        {
          ...request,
          body: JSON.stringify({ ...JSON.parse(String(request.body)), marker }),
        },
        transport,
        Date.now,
        { priority, overallTimeoutMs: 3_000 },
      );
    const activeCalls = [0, 1, 2, 3].map((index) =>
      call(`active-${index}`, "background"),
    );
    const queuedBackground = call("queued-background", "background");
    const interactive = call("interactive", "interactive");
    await vi.waitFor(() => expect(releases).toHaveLength(4));
    releases.shift()?.();
    await vi.waitFor(() => expect(order).toContain("interactive"));
    expect(order).not.toContain("queued-background");
    while (releases.length) releases.shift()?.();
    await vi.waitFor(() => expect(order).toContain("queued-background"));
    while (releases.length) releases.shift()?.();
    await expect(
      Promise.all([...activeCalls, queuedBackground, interactive]),
    ).resolves.toHaveLength(6);
    expect(maximum).toBe(4);
  });

  it("honors archival Retry-After and retries once within the deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok"));
    const pending = readOnlyRpcFetch("testnet", request, transport, Date.now, {
      preferArchival: true,
      perProviderTimeoutMs: 1_000,
      overallTimeoutMs: 5_000,
    });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      "https://archival-rpc.testnet.near.org",
      "https://archival-rpc.testnet.near.org",
    ]);
    vi.useRealTimers();
  });

  it.each([
    ["network failure", () => Promise.reject(new TypeError("offline"))],
    ["HTTP 500", () => Promise.resolve(new Response("", { status: 500 }))],
    ["HTTP 502", () => Promise.resolve(new Response("", { status: 502 }))],
    ["HTTP 503", () => Promise.resolve(new Response("", { status: 503 }))],
    ["HTTP 504", () => Promise.resolve(new Response("", { status: 504 }))],
  ] as const)("falls back after a transient %s", async (_name, failure) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(failure)
      .mockResolvedValue(new Response("ok"));
    await expect(
      readOnlyRpcFetch("testnet", request, transport),
    ).resolves.toMatchObject({ ok: true });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient HTTP response", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 501 }));
    const response = await readOnlyRpcFetch("testnet", request, transport);
    expect(response.status).toBe(501);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("fails closed after exhausting every provider", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("private network detail"));
    await expect(
      readOnlyRpcFetch("testnet", request, transport),
    ).rejects.toThrow("RPC_PROVIDERS_EXHAUSTED");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.map((call) => call[0])).not.toContain(
      "https://archival-rpc.testnet.near.org",
    );
  });

  it("does not let transient failures block the next independent request", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValue(new Response("ok"));
    await expect(
      readOnlyRpcFetch("testnet", request, transport),
    ).rejects.toThrow("RPC_PROVIDERS_EXHAUSTED");
    await expect(
      readOnlyRpcFetch("testnet", request, transport),
    ).resolves.toMatchObject({ ok: true });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls[2]?.[0]).toBe(
      "https://rpc.testnet.fastnear.com",
    );
  });

  it("recovers after the reported timeout, HTTP, and cooldown-exhaustion sequence", async () => {
    const stalled = vi.fn<typeof fetch>(async (_url, init) => {
      const signal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    });
    await expect(
      readOnlyRpcFetch("testnet", request, stalled, Date.now, {
        perProviderTimeoutMs: 20,
        overallTimeoutMs: 35,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });

    const httpFailure = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 503 }));
    await expect(
      readOnlyRpcFetch("testnet", request, httpFailure),
    ).rejects.toThrow("RPC_PROVIDERS_EXHAUSTED");
    expect(httpFailure).toHaveBeenCalledTimes(2);

    const recovered = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("ok"));
    await expect(
      readOnlyRpcFetch("testnet", request, recovered),
    ).resolves.toMatchObject({ ok: true });
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it("falls back when a successful HTTP response body fails", async () => {
    const diagnostics: RpcDiagnostic[] = [];
    const failedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("body transport failed"));
      },
    });
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(failedBody, { status: 200 }))
      .mockResolvedValue(new Response("ok"));
    const response = await readOnlyRpcFetch(
      "testnet",
      request,
      transport,
      Date.now,
      { diagnostic: (event) => diagnostics.push(event) },
    );
    expect(await response.text()).toBe("ok");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(diagnostics[0]).toMatchObject({
      category: "RESPONSE_BODY",
      method: "query",
      attempt: 1,
    });
  });

  it("emits bounded diagnostics without request parameters", async () => {
    const diagnostics: RpcDiagnostic[] = [];
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValue(new Response("ok"));
    await readOnlyRpcFetch("testnet", request, transport, Date.now, {
      diagnostic: (event) => diagnostics.push(event),
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        method: "query",
        provider: "rpc.testnet.fastnear.com",
        attempt: 1,
        category: "TRANSIENT_HTTP",
        status: 503,
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("example.testnet");
    expect(JSON.stringify(diagnostics)).not.toContain("public_key");
  });

  it("stops failover when the strict overall deadline expires", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const signal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    });
    await expect(
      readOnlyRpcFetch("testnet", request, transport, Date.now, {
        perProviderTimeoutMs: 100,
        overallTimeoutMs: 5,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("fails closed when every allowed provider returns 429", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("", { status: 429, headers: { "Retry-After": "72" } }),
      );
    const now = () => 1000;
    await expect(
      readOnlyRpcFetch("testnet", request, transport, now),
    ).rejects.toThrow("RPC_RATE_LIMITED");
    expect(transport).toHaveBeenCalledTimes(2);
    await expect(
      readOnlyRpcFetch("testnet", request, transport, now),
    ).rejects.toThrow("RPC_RATE_LIMITED");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("rejects RPC mutations and malformed requests before any network I/O", async () => {
    const transport = vi.fn<typeof fetch>();
    for (const body of [
      JSON.stringify({ method: "broadcast_tx_commit" }),
      JSON.stringify({ method: "send_transaction" }),
      "not-json",
    ]) {
      await expect(
        readOnlyRpcFetch("testnet", { method: "POST", body }, transport),
      ).rejects.toThrow("READ_ONLY_RPC_REQUIRED");
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
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "test",
          error: { code: -32000, message: "UNKNOWN_ACCESS_KEY" },
        }),
        { status: 200 },
      ),
    );
    const response = await readOnlyRpcFetch("testnet", request, transport);
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
