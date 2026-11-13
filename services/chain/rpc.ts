import { createHash } from "node:crypto";
import bs58 from "bs58";
import { z } from "zod";
import { nearAccount } from "../../packages/domain/src/index.js";
import {
  HISTORICAL_RPC_OVERALL_TIMEOUT_MS,
  HISTORICAL_RPC_PER_PROVIDER_TIMEOUT_MS,
  READ_ONLY_RPC_OVERALL_TIMEOUT_MS,
  READ_ONLY_RPC_RESPONSE_LIMIT,
  type RpcReadPriority,
  readOnlyRpcFetch,
} from "./rpc-rate-limit.js";
export const chainHash = z.string().refine((v) => {
  try {
    return bs58.decode(v).length === 32;
  } catch {
    return false;
  }
});
export const manifestSchema = z.strictObject({
  account: nearAccount,
  network: z.literal("testnet"),
  wasmSha256: z.string().regex(/^[a-f0-9]{64}$/),
  keyFingerprints: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(8),
  authorization: z.string().min(8).max(160),
});
export type Manifest = z.infer<typeof manifestSchema>;
const manifestValues = (env: NodeJS.ProcessEnv) => [
  env.M6_VAULT_ACCOUNT,
  env.M6_WASM_SHA256,
  env.M6_KEY_FINGERPRINTS,
  env.M6_AUTHORIZATION_REFERENCE,
];
export function readOnlyDeploymentConfig(
  env: NodeJS.ProcessEnv,
): Manifest | null {
  if (!manifestValues(env).some(Boolean)) return null;
  return manifestSchema.parse({
    account: env.M6_VAULT_ACCOUNT,
    network: env.NEAR_NETWORK,
    wasmSha256: env.M6_WASM_SHA256,
    keyFingerprints: env.M6_KEY_FINGERPRINTS?.split(","),
    authorization: env.M6_AUTHORIZATION_REFERENCE,
  });
}
export function financialSubmissionEnabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.M6_TRANSACTIONS_ENABLED;
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("INVALID_SUBMISSION_GATE");
}
export function deploymentConfig(env: NodeJS.ProcessEnv): Manifest | null {
  if (!financialSubmissionEnabled(env)) return null;
  const manifest = readOnlyDeploymentConfig(env);
  if (!manifest) throw new Error("DEPLOYMENT_MANIFEST_REQUIRED");
  return manifest;
}
export const fingerprint = (v: string) =>
  createHash("sha256").update(v).digest("hex");
const endpoints = [
  "https://rpc.testnet.fastnear.com",
  "https://rpc.testnet.near.org",
  "https://archival-rpc.testnet.near.org",
] as const;
export const FINALIZED_BLOCK_MAX_AGE_MS = 120_000;
export const FINALIZED_BLOCK_MAX_FUTURE_SKEW_MS = 30_000;
export const DEPLOYMENT_VERIFICATION_TIMEOUT_MS = 15_000;
export const HISTORICAL_DEPLOYMENT_VERIFICATION_TIMEOUT_MS = 25_000;
const RPC_JSON_MAX_DEPTH = 64;
const RPC_JSON_MAX_NUMBER_LENGTH = 128;
const TIMESTAMP_NANOSECONDS_MAX_DIGITS = 20;
const U64_MAX = 18_446_744_073_709_551_615n;
const rpcMethods = new Set([
  "status",
  "gas_price",
  "query",
  "block",
  "chunk",
  "EXPERIMENTAL_tx_status",
  "EXPERIMENTAL_receipt",
]);
const rpcError = (code: string): Error => new Error(code);
const transportError = (error: unknown) => {
  if (
    error instanceof Error &&
    ["RPC_RATE_LIMITED", "RPC_PROVIDERS_EXHAUSTED"].includes(error.message)
  )
    return rpcError(error.message);
  return rpcError(
    error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
      ? "RPC_TIMEOUT"
      : "RPC_UNAVAILABLE",
  );
};

/**
 * JSON.parse keeps the last duplicate object member. Critical RPC fields must
 * instead be unambiguous, so scan the bounded response before parsing it.
 */
function rejectDuplicateJsonKeys(source: string) {
  let offset = 0;
  const whitespace = () => {
    while (/\s/u.test(source[offset] ?? "")) offset++;
  };
  const fail = (): never => {
    throw rpcError("RPC_MALFORMED_RESPONSE");
  };
  const string = (): string => {
    if (source[offset] !== '"') return fail();
    const start = offset++;
    while (offset < source.length) {
      const char = source[offset++];
      if (char === '"') {
        try {
          return JSON.parse(source.slice(start, offset)) as string;
        } catch {
          return fail();
        }
      }
      if (char === "\\") {
        const escaped = source[offset++];
        if (escaped === "u") {
          const hex = source.slice(offset, offset + 4);
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) return fail();
          offset += 4;
        } else if (!escaped || !'"\\/bfnrt'.includes(escaped)) return fail();
      } else if (!char || char.charCodeAt(0) < 0x20) return fail();
    }
    return fail();
  };
  const value = (depth: number): void => {
    if (depth > RPC_JSON_MAX_DEPTH) fail();
    whitespace();
    const char = source[offset];
    if (char === "{") {
      offset++;
      whitespace();
      const keys = new Set<string>();
      if (source[offset] === "}") {
        offset++;
        return;
      }
      while (true) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw rpcError("RPC_DUPLICATE_KEY");
        keys.add(key);
        whitespace();
        if (source[offset++] !== ":") fail();
        value(depth + 1);
        whitespace();
        const delimiter = source[offset++];
        if (delimiter === "}") return;
        if (delimiter !== ",") fail();
      }
    }
    if (char === "[") {
      offset++;
      whitespace();
      if (source[offset] === "]") {
        offset++;
        return;
      }
      while (true) {
        value(depth + 1);
        whitespace();
        const delimiter = source[offset++];
        if (delimiter === "]") return;
        if (delimiter !== ",") fail();
      }
    }
    if (char === '"') {
      string();
      return;
    }
    for (const literal of ["true", "false", "null"])
      if (source.startsWith(literal, offset)) {
        offset += literal.length;
        return;
      }
    const start = offset;
    const digit = (value: string | undefined) =>
      value !== undefined && value >= "0" && value <= "9";
    const consume = () => {
      offset++;
      if (offset - start > RPC_JSON_MAX_NUMBER_LENGTH) fail();
    };
    if (source[offset] === "-") consume();
    if (source[offset] === "0") {
      consume();
      if (digit(source[offset])) fail();
    } else {
      const first = source[offset];
      if (first === undefined || first < "1" || first > "9") fail();
      do consume();
      while (digit(source[offset]));
    }
    if (source[offset] === ".") {
      consume();
      if (!digit(source[offset])) fail();
      do consume();
      while (digit(source[offset]));
    }
    if (source[offset] === "e" || source[offset] === "E") {
      consume();
      if (source[offset] === "+" || source[offset] === "-") consume();
      if (!digit(source[offset])) fail();
      do consume();
      while (digit(source[offset]));
    }
  };
  value(0);
  whitespace();
  if (offset !== source.length) fail();
}

function parseRpcResponse(source: string, expectedId: string) {
  rejectDuplicateJsonKeys(source);
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw rpcError("RPC_MALFORMED_RESPONSE");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw rpcError("RPC_INVALID_ENVELOPE");
  const body = parsed as Record<string, unknown>;
  if (body.jsonrpc !== "2.0") throw rpcError("RPC_PROTOCOL_VERSION");
  if (body.id !== expectedId) throw rpcError("RPC_ID_MISMATCH");
  const result = Object.hasOwn(body, "result");
  const error = Object.hasOwn(body, "error");
  if (result === error) throw rpcError("RPC_AMBIGUOUS_ENVELOPE");
  const allowed = new Set(["jsonrpc", "id", result ? "result" : "error"]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    throw rpcError("RPC_INVALID_ENVELOPE");
  if (result) return { result: body.result } as const;
  const rpcFailure = z
    .object({ code: z.number().int(), message: z.string() })
    .passthrough()
    .safeParse(body.error);
  if (!rpcFailure.success) throw rpcError("RPC_INVALID_ENVELOPE");
  return { error: rpcFailure.data } as const;
}

function unknownBlockFailure(error: unknown): boolean {
  return z
    .object({
      code: z.literal(-32000),
      cause: z.object({ name: z.literal("UNKNOWN_BLOCK") }),
    })
    .passthrough()
    .safeParse(error).success;
}

function historicalPinnedRequest(method: string, params: unknown): boolean {
  if (!params || typeof params !== "object" || Array.isArray(params))
    return false;
  const blockId = (params as Record<string, unknown>).block_id;
  return (
    (method === "block" || method === "query") &&
    typeof blockId === "string" &&
    chainHash.safeParse(blockId).success
  );
}

function waitForCaller<T>(
  pending: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}

export class UnknownBlock extends Error {}
export class NearReader {
  private requestId = 0n;
  private historicalInFlight = new Map<string, Promise<unknown>>();
  private currentPinnedHashes: string[] = [];
  constructor(
    private endpoint: string = endpoints[0],
    private transport: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {
    if (!(endpoints as readonly string[]).includes(endpoint))
      throw new Error("RPC_ENDPOINT_NOT_ALLOWED");
  }
  async rpc(
    method: string,
    params: unknown,
    parentSignal?: AbortSignal,
    priority: RpcReadPriority = "background",
  ): Promise<unknown> {
    if (!rpcMethods.has(method)) throw new Error("READ_ONLY_RPC");
    const blockId =
        params && typeof params === "object" && !Array.isArray(params)
          ? (params as Record<string, unknown>).block_id
          : undefined,
      historical =
        historicalPinnedRequest(method, params) &&
        !this.currentPinnedHashes.includes(String(blockId));
    if (!historical)
      return this.rpcRequest(method, params, parentSignal, false, priority);
    const key = JSON.stringify([method, params]);
    let pending = this.historicalInFlight.get(key);
    if (!pending) {
      pending = this.rpcRequest(method, params, undefined, true, priority);
      this.historicalInFlight.set(key, pending);
      const clear = () => {
        if (this.historicalInFlight.get(key) === pending)
          this.historicalInFlight.delete(key);
      };
      pending.then(clear, clear);
    }
    return waitForCaller(pending, parentSignal);
  }
  private async rpcRequest(
    method: string,
    params: unknown,
    parentSignal: AbortSignal | undefined,
    historical: boolean,
    priority: RpcReadPriority,
  ): Promise<unknown> {
    const id = `m6-${++this.requestId}`;
    let response: Response;
    try {
      const requestSignal = AbortSignal.timeout(
          historical
            ? HISTORICAL_RPC_OVERALL_TIMEOUT_MS
            : READ_ONLY_RPC_OVERALL_TIMEOUT_MS,
        ),
        signal = parentSignal
          ? AbortSignal.any([parentSignal, requestSignal])
          : requestSignal,
        init: RequestInit = {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          signal,
        };
      response =
        this.endpoint === endpoints[0]
          ? await readOnlyRpcFetch("testnet", init, this.transport, this.now, {
              ...(historical
                ? {
                    perProviderTimeoutMs:
                      HISTORICAL_RPC_PER_PROVIDER_TIMEOUT_MS,
                    overallTimeoutMs: HISTORICAL_RPC_OVERALL_TIMEOUT_MS,
                    preferArchival: true,
                    priority,
                    retryResponse: async (candidate: Response) => {
                      try {
                        const parsed = parseRpcResponse(
                          await candidate.text(),
                          id,
                        );
                        return (
                          "error" in parsed && unknownBlockFailure(parsed.error)
                        );
                      } catch {
                        return false;
                      }
                    },
                  }
                : {}),
            })
          : await this.transport(this.endpoint, init);
    } catch (error) {
      throw transportError(error);
    }
    if (!response.ok) throw rpcError("RPC_HTTP_STATUS");
    if (!response.body) throw rpcError("RPC_EMPTY_RESPONSE");
    const reader = response.body.getReader();
    let bytes = 0;
    const parts: Uint8Array[] = [];
    try {
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        bytes += r.value.length;
        if (bytes > READ_ONLY_RPC_RESPONSE_LIMIT)
          throw rpcError("RPC_RESPONSE_LIMIT");
        parts.push(r.value);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "RPC_RESPONSE_LIMIT")
        throw error;
      throw transportError(error);
    } finally {
      try {
        await reader.cancel();
      } catch {
        // A failed cleanup cannot turn an accepted response into trusted data.
      }
    }
    const body = parseRpcResponse(Buffer.concat(parts).toString("utf8"), id);
    if ("error" in body) {
      if (historical && unknownBlockFailure(body.error))
        throw new UnknownBlock("UNKNOWN_BLOCK");
      throw rpcError("RPC_PROVIDER_ERROR");
    }
    return body.result;
  }
  async block(
    id?: string | number,
    signal?: AbortSignal,
    priority: RpcReadPriority = "background",
  ) {
    if (typeof id === "string" && !chainHash.safeParse(id).success)
      throw rpcError("RPC_BLOCK_INVALID");
    const block = blockSchema.safeParse(
      await this.rpc(
        "block",
        id === undefined ? { finality: "final" } : { block_id: id },
        signal,
        priority,
      ),
    );
    if (!block.success) throw rpcError("RPC_BLOCK_INVALID");
    if (typeof id === "string" && block.data.header.hash !== id)
      throw rpcError("RPC_BLOCK_MISMATCH");
    if (id === undefined) {
      this.currentPinnedHashes.push(block.data.header.hash);
      if (this.currentPinnedHashes.length > 16)
        this.currentPinnedHashes.shift();
    }
    return block.data;
  }
  async query(
    type: string,
    account: string,
    block: string,
    extra: Record<string, unknown> = {},
    signal?: AbortSignal,
    priority: RpcReadPriority = "background",
  ) {
    if (!chainHash.safeParse(block).success)
      throw rpcError("RPC_BLOCK_INVALID");
    const result = await this.rpc(
      "query",
      {
        ...extra,
        request_type: type,
        account_id: account,
        block_id: block,
      },
      signal,
      priority,
    );
    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      typeof (result as Record<string, unknown>).block_hash === "string" &&
      (result as Record<string, unknown>).block_hash !== block
    )
      throw rpcError("RPC_BLOCK_MISMATCH");
    return result;
  }
  async view(
    account: string,
    method: string,
    args: Record<string, unknown>,
    block: string,
    signal?: AbortSignal,
    priority: RpcReadPriority = "background",
  ): Promise<unknown> {
    if (
      ![
        "get_mandate",
        "get_proposal",
        "get_execution",
        "get_withdrawal",
        "get_storage_credit",
        "get_accounting",
      ].includes(method)
    )
      throw new Error("VIEW_NOT_ALLOWED");
    const r = z
      .object({
        block_hash: chainHash,
        result: z.array(z.number().int().min(0).max(255)).max(100000),
      })
      .parse(
        await this.query(
          "call_function",
          account,
          block,
          {
            method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
          },
          signal,
          priority,
        ),
      );
    if (r.block_hash !== block) throw new Error("RPC_BLOCK_MISMATCH");
    return JSON.parse(Buffer.from(r.result).toString("utf8"));
  }
  async deployment(
    manifest: Manifest,
    at?: string,
    parentSignal?: AbortSignal,
    priority: RpcReadPriority = "background",
  ) {
    const deadline = AbortSignal.timeout(
        at === undefined
          ? DEPLOYMENT_VERIFICATION_TIMEOUT_MS
          : HISTORICAL_DEPLOYMENT_VERIFICATION_TIMEOUT_MS,
      ),
      signal = parentSignal
        ? AbortSignal.any([parentSignal, deadline])
        : deadline;
    const status = z
      .object({ chain_id: z.literal("testnet") })
      .parse(await this.rpc("status", [], signal, priority));
    if (status.chain_id !== manifest.network)
      throw new Error("NETWORK_MISMATCH");
    const b = await this.block(at, signal, priority);
    if (at === undefined)
      this.assertFreshFinalizedBlock(b.header.timestamp_nanosec);
    const [code, account, keys, domain] = await Promise.all([
      this.query(
        "view_code",
        manifest.account,
        b.header.hash,
        {},
        signal,
        priority,
      ),
      this.query(
        "view_account",
        manifest.account,
        b.header.hash,
        {},
        signal,
        priority,
      ),
      this.query(
        "view_access_key_list",
        manifest.account,
        b.header.hash,
        {},
        signal,
        priority,
      ),
      this.view(
        manifest.account,
        "get_accounting",
        {},
        b.header.hash,
        signal,
        priority,
      ),
    ]);
    const c = z
      .object({
        block_hash: chainHash,
        code_base64: z.string(),
        hash: chainHash,
      })
      .parse(code);
    const a = z
      .object({
        block_hash: chainHash,
        code_hash: chainHash,
        amount: z.string().regex(/^\d+$/),
        storage_usage: z.number().int().nonnegative(),
      })
      .parse(account);
    const k = z
      .object({
        block_hash: chainHash,
        keys: z.array(
          z.object({
            public_key: z.string(),
            access_key: z.object({ permission: z.unknown() }),
          }),
        ),
      })
      .parse(keys);
    if (
      [c.block_hash, a.block_hash, k.block_hash].some(
        (h) => h !== b.header.hash,
      )
    )
      throw new Error("RPC_BLOCK_MISMATCH");
    const hash = createHash("sha256")
      .update(Buffer.from(c.code_base64, "base64"))
      .digest();
    if (
      hash.toString("hex") !== manifest.wasmSha256 ||
      bs58.encode(hash) !== a.code_hash ||
      c.hash !== a.code_hash
    )
      throw new Error("DEPLOYMENT_CODE_MISMATCH");
    // Pin every access key, including restricted keys; unexpected access is a governance change.
    const actual = k.keys
      .map((v) =>
        fingerprint(
          `${v.public_key}:${JSON.stringify(v.access_key.permission)}`,
        ),
      )
      .sort();
    if (
      JSON.stringify(actual) !==
      JSON.stringify([...manifest.keyFingerprints].sort())
    )
      throw new Error("DEPLOYMENT_KEY_MISMATCH");
    const d = z
      .object({ network: z.literal("testnet"), vault: nearAccount })
      .passthrough()
      .parse(domain);
    if (d.vault !== manifest.account)
      throw new Error("DEPLOYMENT_DOMAIN_MISMATCH");
    if (at === undefined)
      this.assertFreshFinalizedBlock(b.header.timestamp_nanosec);
    return { block: b.header, account: a, accounting: d };
  }
  private assertFreshFinalizedBlock(timestamp: string) {
    let observed: bigint;
    try {
      observed = BigInt(timestamp);
    } catch {
      throw rpcError("RPC_TIMESTAMP_INVALID");
    }
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0)
      throw rpcError("RPC_TIMESTAMP_INVALID");
    const current = BigInt(now) * 1_000_000n;
    if (
      observed >
      current + BigInt(FINALIZED_BLOCK_MAX_FUTURE_SKEW_MS) * 1_000_000n
    )
      throw rpcError("RPC_CLOCK_SKEW");
    if (observed < current - BigInt(FINALIZED_BLOCK_MAX_AGE_MS) * 1_000_000n)
      throw rpcError("STALE_RPC");
  }
}
const timestampNanoseconds = z.string().superRefine((value, context) => {
  if (
    value.length > TIMESTAMP_NANOSECONDS_MAX_DIGITS ||
    !/^(?:0|[1-9]\d*)$/u.test(value)
  ) {
    context.addIssue({ code: "custom", message: "invalid timestamp" });
    return;
  }
  if (BigInt(value) > U64_MAX)
    context.addIssue({ code: "custom", message: "timestamp exceeds u64" });
});
export const blockSchema = z.object({
  header: z.object({
    hash: chainHash,
    prev_hash: chainHash,
    height: z.number().int().nonnegative().safe(),
    timestamp_nanosec: timestampNanoseconds,
  }),
  chunks: z.array(z.object({ chunk_hash: chainHash })),
});
