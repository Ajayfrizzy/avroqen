import { createHash } from "node:crypto";
import bs58 from "bs58";
import { expect, it } from "vitest";
import {
  deploymentConfig,
  FINALIZED_BLOCK_MAX_AGE_MS,
  FINALIZED_BLOCK_MAX_FUTURE_SKEW_MS,
  financialSubmissionEnabled,
  fingerprint,
  NearReader,
  readOnlyDeploymentConfig,
} from "../../services/chain/rpc.js";

const now = 1_800_000_000_000;
const manifest = {
  account: "vault.testnet",
  network: "testnet" as const,
  wasmSha256: createHash("sha256").update("fixture-code").digest("hex"),
  keyFingerprints: [fingerprint('ed25519:fixture-public-key:"FullAccess"')],
  authorization: "fixture-authorization",
};
const configured = {
  M6_TRANSACTIONS_ENABLED: "false",
  M6_VAULT_ACCOUNT: manifest.account,
  NEAR_NETWORK: manifest.network,
  M6_WASM_SHA256: manifest.wasmSha256,
  M6_KEY_FINGERPRINTS: manifest.keyFingerprints[0],
  M6_AUTHORIZATION_REFERENCE: manifest.authorization,
};
const envelope = (init: RequestInit | undefined, value: object) => {
  const request = JSON.parse(String(init?.body)) as { id: string };
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: request.id, ...value }),
  );
};
const rawEnvelope = (init: RequestInit | undefined, result: string) => {
  const request = JSON.parse(String(init?.body)) as { id: string };
  return new Response(
    `{"jsonrpc":"2.0","id":${JSON.stringify(request.id)},"result":${result}}`,
  );
};

it("separates read-only deployment configuration from financial submission", () => {
  expect(readOnlyDeploymentConfig({})).toBeNull();
  expect(readOnlyDeploymentConfig({ NEAR_NETWORK: "testnet" })).toBeNull();
  expect(financialSubmissionEnabled({})).toBe(false);
  expect(readOnlyDeploymentConfig(configured)?.account).toBe("vault.testnet");
  expect(deploymentConfig(configured)).toBeNull();
  expect(
    deploymentConfig({ ...configured, M6_TRANSACTIONS_ENABLED: "true" })
      ?.account,
  ).toBe("vault.testnet");
  expect(() => deploymentConfig({ M6_TRANSACTIONS_ENABLED: "true" })).toThrow(
    "DEPLOYMENT_MANIFEST_REQUIRED",
  );
  expect(() =>
    financialSubmissionEnabled({ M6_TRANSACTIONS_ENABLED: "yes" }),
  ).toThrow("INVALID_SUBMISSION_GATE");
  expect(() =>
    readOnlyDeploymentConfig({ M6_VAULT_ACCOUNT: "vault.testnet" }),
  ).toThrow();
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

it("accepts an exact valid JSON-RPC 2.0 envelope and correlates its ID", async () => {
  const transport: typeof fetch = async (_url, init) =>
    envelope(init, { result: { chain_id: "testnet" } });
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).resolves.toEqual({ chain_id: "testnet" });
});

it.each([
  [
    "network failure",
    async () => {
      throw new Error("private network diagnostic");
    },
    "RPC_UNAVAILABLE",
  ],
  [
    "timeout",
    async () => {
      throw new DOMException("private timeout diagnostic", "TimeoutError");
    },
    "RPC_TIMEOUT",
  ],
  [
    "HTTP failure",
    async () => new Response("private provider diagnostic", { status: 503 }),
    "RPC_HTTP_STATUS",
  ],
  ["empty body", async () => new Response(null), "RPC_EMPTY_RESPONSE"],
] as const)(
  "classifies %s without provider details",
  async (_name, transport, code) => {
    const error = await new NearReader(undefined, transport as typeof fetch)
      .rpc("status", [])
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(code);
    expect(String(error)).not.toContain("private");
  },
);

it.each([
  ["missing protocol", { id: "REQUEST", result: {} }, "RPC_PROTOCOL_VERSION"],
  [
    "wrong protocol",
    { jsonrpc: "1.0", id: "REQUEST", result: {} },
    "RPC_PROTOCOL_VERSION",
  ],
  ["wrong ID", { jsonrpc: "2.0", id: "wrong", result: {} }, "RPC_ID_MISMATCH"],
  [
    "result and error",
    {
      jsonrpc: "2.0",
      id: "REQUEST",
      result: {},
      error: { code: -1, message: "no" },
    },
    "RPC_AMBIGUOUS_ENVELOPE",
  ],
  [
    "neither result nor error",
    { jsonrpc: "2.0", id: "REQUEST" },
    "RPC_AMBIGUOUS_ENVELOPE",
  ],
  [
    "extra envelope field",
    { jsonrpc: "2.0", id: "REQUEST", result: {}, secret: "leak" },
    "RPC_INVALID_ENVELOPE",
  ],
  [
    "invalid error",
    { jsonrpc: "2.0", id: "REQUEST", error: { message: "missing code" } },
    "RPC_INVALID_ENVELOPE",
  ],
] as const)("rejects %s", async (_name, template, code) => {
  const transport: typeof fetch = async (_url, init) => {
    const id = (JSON.parse(String(init?.body)) as { id: string }).id;
    return new Response(
      JSON.stringify(template).replace('"REQUEST"', `"${id}"`),
    );
  };
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).rejects.toThrow(code);
});

it.each([
  [
    "duplicate protocol",
    (id: string) =>
      `{"jsonrpc":"2.0","jsonrpc":"1.0","id":"${id}","result":{}}`,
  ],
  [
    "duplicate decoded key",
    (id: string) =>
      `{"jsonrpc":"2.0","id":"${id}","result":{"key":1,"\\u006bey":2}}`,
  ],
  [
    "duplicate decoded surrogate-pair key",
    (id: string) =>
      `{"jsonrpc":"2.0","id":"${id}","result":{"😀":1,"\\ud83d\\ude00":2}}`,
  ],
])("rejects %s before JSON parsing", async (_name, body) => {
  const transport: typeof fetch = async (_url, init) => {
    const id = (JSON.parse(String(init?.body)) as { id: string }).id;
    return new Response(body(id));
  };
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).rejects.toThrow("RPC_DUPLICATE_KEY");
});

it.each([
  ["malformed", "{"],
  ["truncated", '{"jsonrpc":"2.0","id":"m6-1","result":'],
])("rejects %s JSON", async (_name, body) => {
  const transport: typeof fetch = async () => new Response(body);
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).rejects.toThrow("RPC_MALFORMED_RESPONSE");
});

it.each(["01", "1.", ".1", "1e", "1e+", "--1", "-"])(
  "rejects malformed JSON number %s",
  async (number) => {
    const transport: typeof fetch = async (_url, init) =>
      rawEnvelope(init, number);
    await expect(
      new NearReader(undefined, transport).rpc("status", []),
    ).rejects.toThrow("RPC_MALFORMED_RESPONSE");
  },
);

it("accepts valid JSON fraction and exponent syntax", async () => {
  const transport: typeof fetch = async (_url, init) =>
    rawEnvelope(init, "[-1.25,1e2,3E-1]");
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).resolves.toEqual([-1.25, 100, 0.3]);
});

it("rejects overlong numeric tokens without allocating a numeric substring", async () => {
  const transport: typeof fetch = async (_url, init) =>
    rawEnvelope(init, "1".repeat(129));
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).rejects.toThrow("RPC_MALFORMED_RESPONSE");
});

it("rejects malformed Unicode escapes in object keys", async () => {
  const transport: typeof fetch = async (_url, init) =>
    rawEnvelope(init, '{"\\uZZZZ":1}');
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).rejects.toThrow("RPC_MALFORMED_RESPONSE");
});

it("enforces the documented JSON nesting limit", async () => {
  const nested = (depth: number) => `${"[".repeat(depth)}0${"]".repeat(depth)}`;
  const accepted: typeof fetch = async (_url, init) =>
    rawEnvelope(init, nested(63));
  const rejected: typeof fetch = async (_url, init) =>
    rawEnvelope(init, nested(64));
  await expect(
    new NearReader(undefined, accepted).rpc("status", []),
  ).resolves.toBeDefined();
  await expect(
    new NearReader(undefined, rejected).rpc("status", []),
  ).rejects.toThrow("RPC_MALFORMED_RESPONSE");
});

it("scans a dense numeric array within the Node 24 CI budget", async () => {
  const body = `[${Array.from({ length: 50_000 }, () => "0").join(",")}]`;
  const transport: typeof fetch = async (_url, init) => rawEnvelope(init, body);
  const started = performance.now();
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).resolves.toHaveLength(50_000);
  // This is a regression budget for the pinned local/CI runtime, not a formal bound.
  expect(performance.now() - started).toBeLessThan(2_000);
});

it("rejects oversized responses", async () => {
  const transport: typeof fetch = async () =>
    new Response(`{"padding":"${"x".repeat(4 * 1024 * 1024)}"}`);
  await expect(
    new NearReader(undefined, transport).rpc("status", []),
  ).rejects.toThrow("RPC_RESPONSE_LIMIT");
});

it("sanitizes provider errors without exposing their messages", async () => {
  const transport: typeof fetch = async (_url, init) =>
    envelope(init, {
      error: {
        code: -32000,
        message: "private provider diagnostic",
        data: "private data",
      },
    });
  const error = await new NearReader(undefined, transport)
    .rpc("status", [])
    .catch((value: unknown) => value);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe("RPC_PROVIDER_ERROR");
  expect(String(error)).not.toContain("private");
});

it("preserves the explicit unknown-block classification for block scans", async () => {
  const transport: typeof fetch = async (_url, init) =>
    envelope(init, {
      error: {
        code: -32000,
        message: "unknown block",
        cause: { name: "UNKNOWN_BLOCK" },
      },
    });
  await expect(new NearReader(undefined, transport).block(123)).rejects.toThrow(
    "UNKNOWN_BLOCK",
  );
});

type DeploymentChange =
  | "code"
  | "keys"
  | "domain"
  | "block"
  | "account"
  | undefined;
function deploymentTransport(timestamp?: string, change?: DeploymentChange) {
  const bytes = Buffer.from("fixture-code"),
    digest = createHash("sha256").update(bytes).digest(),
    block = bs58.encode(Buffer.alloc(32, 1)),
    other = bs58.encode(Buffer.alloc(32, 2));
  const transport: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as {
      method: string;
      params: Record<string, unknown>;
    };
    let result: unknown;
    if (request.method === "status") result = { chain_id: "testnet" };
    else if (request.method === "block")
      result = {
        header: {
          hash: block,
          prev_hash: other,
          height: 100,
          ...(timestamp === undefined ? {} : { timestamp_nanosec: timestamp }),
        },
        chunks: [],
      };
    else if (request.params.request_type === "view_code")
      result = {
        block_hash: change === "block" ? other : block,
        hash: bs58.encode(digest),
        code_base64: (change === "code"
          ? Buffer.from("altered")
          : bytes
        ).toString("base64"),
      };
    else if (request.params.request_type === "view_account")
      result = {
        block_hash: change === "account" ? other : block,
        code_hash: bs58.encode(digest),
        amount: "1",
        storage_usage: 1,
      };
    else if (request.params.request_type === "view_access_key_list")
      result = {
        block_hash: block,
        keys: [
          {
            public_key: "ed25519:fixture-public-key",
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
    return envelope(init, { result });
  };
  return transport;
}

it("accepts finalized timestamps at the exact age and future-skew boundaries", async () => {
  for (const offset of [
    -FINALIZED_BLOCK_MAX_AGE_MS,
    FINALIZED_BLOCK_MAX_FUTURE_SKEW_MS,
  ]) {
    const timestamp = (BigInt(now + offset) * 1_000_000n).toString();
    await expect(
      new NearReader(
        undefined,
        deploymentTransport(timestamp),
        () => now,
      ).deployment(manifest),
    ).resolves.toMatchObject({ accounting: { network: "testnet" } });
  }
});

it.each([
  ["stale", -FINALIZED_BLOCK_MAX_AGE_MS - 1, "STALE_RPC"],
  ["future-skewed", FINALIZED_BLOCK_MAX_FUTURE_SKEW_MS + 1, "RPC_CLOCK_SKEW"],
] as const)("rejects %s finalized timestamps", async (_name, offset, code) => {
  const timestamp = (BigInt(now + offset) * 1_000_000n).toString();
  await expect(
    new NearReader(
      undefined,
      deploymentTransport(timestamp),
      () => now,
    ).deployment(manifest),
  ).rejects.toThrow(code);
});

it.each([undefined, "", "not-a-time", "-1"])(
  "rejects missing or invalid finalized timestamp %j",
  async (timestamp) => {
    await expect(
      new NearReader(
        undefined,
        deploymentTransport(timestamp),
        () => now,
      ).deployment(manifest),
    ).rejects.toThrow("RPC_BLOCK_INVALID");
  },
);

it.each(["+1", "00", "1.0", "1e9", "18446744073709551616", "1".repeat(10_000)])(
  "rejects noncanonical or excessive finalized timestamp %s",
  async (timestamp) => {
    await expect(
      new NearReader(
        undefined,
        deploymentTransport(timestamp),
        () => now,
      ).deployment(manifest),
    ).rejects.toThrow("RPC_BLOCK_INVALID");
  },
);

it("accepts the maximum u64 timestamp representation at the schema boundary", async () => {
  await expect(
    new NearReader(
      undefined,
      deploymentTransport("18446744073709551615"),
      () => now,
    ).block(),
  ).resolves.toMatchObject({ header: { height: 100 } });
});

it("rejects a block that expires while pinned deployment reads are in flight", async () => {
  let current = now;
  const base = deploymentTransport(
    (BigInt(now - FINALIZED_BLOCK_MAX_AGE_MS) * 1_000_000n).toString(),
  );
  const transport: typeof fetch = async (url, init) => {
    const response = await base(url, init);
    const request = JSON.parse(String(init?.body)) as {
      params?: { request_type?: string };
    };
    if (request.params?.request_type === "call_function") current = now + 1;
    return response;
  };
  await expect(
    new NearReader(undefined, transport, () => current).deployment(manifest),
  ).rejects.toThrow("STALE_RPC");
});

it("fails closed when the clock rolls back during pinned deployment reads", async () => {
  let current = now;
  const base = deploymentTransport((BigInt(now) * 1_000_000n).toString());
  const transport: typeof fetch = async (url, init) => {
    const response = await base(url, init);
    const request = JSON.parse(String(init?.body)) as {
      params?: { request_type?: string };
    };
    if (request.params?.request_type === "call_function")
      current = now - FINALIZED_BLOCK_MAX_FUTURE_SKEW_MS - 1;
    return response;
  };
  await expect(
    new NearReader(undefined, transport, () => current).deployment(manifest),
  ).rejects.toThrow("RPC_CLOCK_SKEW");
});

it("does not cache a previously fresh deployment beyond the freshness window", async () => {
  let current = now;
  const reader = new NearReader(
    undefined,
    deploymentTransport((BigInt(now) * 1_000_000n).toString()),
    () => current,
  );
  await expect(reader.deployment(manifest)).resolves.toBeDefined();
  current = now + FINALIZED_BLOCK_MAX_AGE_MS + 1;
  await expect(reader.deployment(manifest)).rejects.toThrow("STALE_RPC");
});

it("does not apply current-head freshness to explicitly pinned historical receipt blocks", async () => {
  await expect(
    new NearReader(undefined, deploymentTransport("1"), () => now).deployment(
      manifest,
      bs58.encode(Buffer.alloc(32, 1)),
    ),
  ).resolves.toMatchObject({ block: { height: 100 } });
});

it("fails closed on wrong network before code or keys are considered", async () => {
  const transport: typeof fetch = async (_url, init) =>
    envelope(init, { result: { chain_id: "mainnet" } });
  await expect(
    new NearReader(undefined, transport, () => now).deployment(manifest),
  ).rejects.toThrow();
});

it.each(["code", "keys", "domain", "block", "account"] as const)(
  "detects unexpected deployment %s from pinned RPC evidence",
  async (change) => {
    await expect(
      new NearReader(
        undefined,
        deploymentTransport((BigInt(now) * 1_000_000n).toString(), change),
        () => now,
      ).deployment(manifest),
    ).rejects.toThrow(
      {
        code: "DEPLOYMENT_CODE_MISMATCH",
        keys: "DEPLOYMENT_KEY_MISMATCH",
        domain: "DEPLOYMENT_DOMAIN_MISMATCH",
        block: "RPC_BLOCK_MISMATCH",
        account: "RPC_BLOCK_MISMATCH",
      }[change],
    );
  },
);
