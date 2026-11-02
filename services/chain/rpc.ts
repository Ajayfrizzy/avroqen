import { createHash } from "node:crypto";
import bs58 from "bs58";
import { z } from "zod";
import { nearAccount } from "../../packages/domain/src/index.js";
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
export function deploymentConfig(env: NodeJS.ProcessEnv): Manifest | null {
  if (env.M6_TRANSACTIONS_ENABLED !== "true") return null;
  return manifestSchema.parse({
    account: env.M6_VAULT_ACCOUNT,
    network: env.NEAR_NETWORK,
    wasmSha256: env.M6_WASM_SHA256,
    keyFingerprints: env.M6_KEY_FINGERPRINTS?.split(","),
    authorization: env.M6_AUTHORIZATION_REFERENCE,
  });
}
export const fingerprint = (v: string) =>
  createHash("sha256").update(v).digest("hex");
const endpoints = [
  "https://rpc.testnet.near.org",
  "https://archival-rpc.testnet.near.org",
] as const;
export class UnknownBlock extends Error {}
export class NearReader {
  constructor(
    private endpoint: string = endpoints[0],
    private transport: typeof fetch = fetch,
  ) {
    if (!(endpoints as readonly string[]).includes(endpoint))
      throw new Error("RPC_ENDPOINT_NOT_ALLOWED");
  }
  async rpc(method: string, params: unknown): Promise<unknown> {
    if (
      ![
        "status",
        "gas_price",
        "query",
        "block",
        "chunk",
        "EXPERIMENTAL_tx_status",
        "EXPERIMENTAL_receipt",
      ].includes(method)
    )
      throw new Error("READ_ONLY_RPC");
    const response = await this.transport(this.endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "m6", method, params }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok || !response.body) throw new Error("RPC_UNAVAILABLE");
    const reader = response.body.getReader();
    let bytes = 0;
    const parts: Uint8Array[] = [];
    try {
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        bytes += r.value.length;
        if (bytes > 4 * 1024 * 1024) throw new Error("RPC_RESPONSE_LIMIT");
        parts.push(r.value);
      }
    } finally {
      await reader.cancel();
    }
    const body = z
      .object({ result: z.unknown().optional(), error: z.unknown().optional() })
      .parse(JSON.parse(Buffer.concat(parts).toString("utf8")));
    if (body.error || body.result === undefined) {
      const missing = z
        .object({ cause: z.object({ name: z.literal("UNKNOWN_BLOCK") }) })
        .safeParse(body.error);
      if (method === "block" && missing.success)
        throw new UnknownBlock("UNKNOWN_BLOCK");
      throw new Error("RPC_UNAVAILABLE");
    }
    return body.result;
  }
  async block(id?: string | number) {
    return blockSchema.parse(
      await this.rpc(
        "block",
        id === undefined ? { finality: "final" } : { block_id: id },
      ),
    );
  }
  async query(
    type: string,
    account: string,
    block: string,
    extra: Record<string, unknown> = {},
  ) {
    return this.rpc("query", {
      request_type: type,
      account_id: account,
      block_id: block,
      ...extra,
    });
  }
  async view(
    account: string,
    method: string,
    args: Record<string, unknown>,
    block: string,
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
        await this.query("call_function", account, block, {
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
        }),
      );
    if (r.block_hash !== block) throw new Error("RPC_BLOCK_MISMATCH");
    return JSON.parse(Buffer.from(r.result).toString("utf8"));
  }
  async deployment(manifest: Manifest, at?: string) {
    const status = z
      .object({ chain_id: z.literal("testnet") })
      .parse(await this.rpc("status", []));
    if (status.chain_id !== manifest.network)
      throw new Error("NETWORK_MISMATCH");
    const b = await this.block(at);
    const [code, account, keys, domain] = await Promise.all([
      this.query("view_code", manifest.account, b.header.hash),
      this.query("view_account", manifest.account, b.header.hash),
      this.query("view_access_key_list", manifest.account, b.header.hash),
      this.view(manifest.account, "get_accounting", {}, b.header.hash),
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
    return { block: b.header, account: a, accounting: d };
  }
}
export const blockSchema = z.object({
  header: z.object({
    hash: chainHash,
    prev_hash: chainHash,
    height: z.number().int().nonnegative().safe(),
    timestamp_nanosec: z.string().regex(/^\d+$/),
  }),
  chunks: z.array(z.object({ chunk_hash: chainHash })),
});
