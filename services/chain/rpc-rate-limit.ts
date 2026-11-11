/**
 * Public NEAR RPC read-only failover. A 429 response is never evidence that a
 * wallet key exists. Respect provider cooldown without holding an HTTP login
 * request open beyond the API's short request timeout.
 */
const cooldowns = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 120_000;
const urls = {
  testnet: [
    "https://rpc.testnet.near.org",
    "https://archival-rpc.testnet.near.org",
  ],
  mainnet: [
    "https://rpc.mainnet.near.org",
    "https://archival-rpc.mainnet.near.org",
  ],
} as const;

export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (header === null) return DEFAULT_COOLDOWN_MS;
  const seconds = /^\d+$/.test(header.trim())
    ? Number(header.trim()) * 1000
    : Date.parse(header) - now;
  return Number.isFinite(seconds)
    ? Math.min(MAX_COOLDOWN_MS, Math.max(1000, seconds))
    : DEFAULT_COOLDOWN_MS;
}

export async function readOnlyRpcFetch(
  network: "testnet" | "mainnet",
  init: RequestInit,
  transport: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<Response> {
  // Never use this helper to submit signed transactions or send RPC mutations.
  if (init.method !== "POST" || typeof init.body !== "string")
    throw new Error("READ_ONLY_RPC_REQUIRED");
  let request: unknown;
  try {
    request = JSON.parse(init.body);
  } catch {
    throw new Error("READ_ONLY_RPC_REQUIRED");
  }
  const body = request as { method?: string };
  if (!["query", "block", "status", "gas_price", "chunk", "EXPERIMENTAL_tx_status", "EXPERIMENTAL_receipt"].includes(body?.method ?? ""))
    throw new Error("READ_ONLY_RPC_REQUIRED");

  let last: Response | undefined;
  for (const endpoint of urls[network]) {
    if ((cooldowns.get(endpoint) ?? 0) > now()) continue;
    const response = await transport(endpoint, init);
    if (response.status === 429) {
      cooldowns.set(endpoint, now() + retryAfterMs(response.headers.get("retry-after"), now()));
      last = response;
      continue;
    }
    // Other errors are not treated as confirmation; callers must verify RPC
    // envelope, chain ID, finality, key permissions and account/code bindings.
    return response;
  }
  if (last) return last;
  throw new Error("RPC_RATE_LIMITED");
}

/** Test-only reset for deterministic cooldown isolation. */
export function clearRpcCooldownForTests(): void {
  cooldowns.clear();
}
