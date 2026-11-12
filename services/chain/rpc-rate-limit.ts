/**
 * Public NEAR RPC read-only failover. Transport availability is never evidence
 * that a wallet key or deployment is valid; callers retain all response checks.
 */
type Cooldown = { until: number; reason: "RATE_LIMITED" | "TRANSIENT" };
const cooldowns = new Map<string, Cooldown>();
const DEFAULT_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 120_000;
const DEFAULT_PER_PROVIDER_TIMEOUT_MS = 2_000;
const DEFAULT_OVERALL_TIMEOUT_MS = 6_000;
const urls = {
  testnet: [
    "https://rpc.testnet.fastnear.com",
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

export interface RpcFailoverTiming {
  perProviderTimeoutMs?: number;
  overallTimeoutMs?: number;
}

function timeout(value: number | undefined, fallback: number): number {
  if (
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_COOLDOWN_MS
  )
    return fallback;
  return value;
}

function timeoutError(): DOMException {
  return new DOMException("RPC request deadline exceeded", "TimeoutError");
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("RPC request aborted", "AbortError");
}

function fetchAttempt(
  transport: typeof fetch,
  endpoint: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(abortReason(signal));
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve()
      .then(() => transport(endpoint, { ...init, signal }))
      .then(
        (response) => {
          signal.removeEventListener("abort", aborted);
          resolve(response);
        },
        (error) => {
          signal.removeEventListener("abort", aborted);
          reject(error);
        },
      );
  });
}

function transientStatus(status: number): boolean {
  return (
    status === 408 ||
    (status >= 500 && status <= 599 && status !== 501 && status !== 505)
  );
}

export async function readOnlyRpcFetch(
  network: "testnet" | "mainnet",
  init: RequestInit,
  transport: typeof fetch = fetch,
  now: () => number = Date.now,
  timing: RpcFailoverTiming = {},
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
  if (
    ![
      "query",
      "block",
      "status",
      "gas_price",
      "chunk",
      "EXPERIMENTAL_tx_status",
      "EXPERIMENTAL_receipt",
    ].includes(body?.method ?? "")
  )
    throw new Error("READ_ONLY_RPC_REQUIRED");

  const perProviderTimeoutMs = timeout(
      timing.perProviderTimeoutMs,
      DEFAULT_PER_PROVIDER_TIMEOUT_MS,
    ),
    overallTimeoutMs = timeout(
      timing.overallTimeoutMs,
      DEFAULT_OVERALL_TIMEOUT_MS,
    ),
    overall = new AbortController(),
    overallTimer = setTimeout(
      () => overall.abort(timeoutError()),
      overallTimeoutMs,
    ),
    overallSignal = init.signal
      ? AbortSignal.any([init.signal, overall.signal])
      : overall.signal;
  let last: { response: Response } | { error: unknown } | undefined;
  const skipped: Cooldown[] = [];
  try {
    if (overallSignal.aborted) throw abortReason(overallSignal);
    for (const endpoint of urls[network]) {
      if (overallSignal.aborted) throw abortReason(overallSignal);
      const cooldown = cooldowns.get(endpoint);
      if (cooldown && cooldown.until > now()) {
        skipped.push(cooldown);
        continue;
      }
      const attempt = new AbortController(),
        attemptTimer = setTimeout(
          () => attempt.abort(timeoutError()),
          Math.min(perProviderTimeoutMs, overallTimeoutMs),
        ),
        signal = AbortSignal.any([overallSignal, attempt.signal]);
      let response: Response;
      try {
        response = await fetchAttempt(transport, endpoint, init, signal);
      } catch (error) {
        if (overallSignal.aborted) throw abortReason(overallSignal);
        cooldowns.set(endpoint, {
          until: now() + DEFAULT_COOLDOWN_MS,
          reason: "TRANSIENT",
        });
        last = { error };
        continue;
      } finally {
        clearTimeout(attemptTimer);
      }
      if (response.status === 429 || transientStatus(response.status)) {
        const reason = response.status === 429 ? "RATE_LIMITED" : "TRANSIENT";
        cooldowns.set(endpoint, {
          until:
            now() + retryAfterMs(response.headers.get("retry-after"), now()),
          reason,
        });
        try {
          await response.body?.cancel();
        } catch {
          // Cleanup failure cannot turn an unavailable provider into evidence.
        }
        last = { response };
        continue;
      }
      // Response validity, network identity and block consistency remain the
      // caller's responsibility. JSON-RPC errors are never retried here.
      return response;
    }
  } finally {
    clearTimeout(overallTimer);
  }
  if (last) {
    if ("response" in last) return last.response;
    throw last.error;
  }
  if (
    skipped.length &&
    skipped.every((entry) => entry.reason === "RATE_LIMITED")
  )
    throw new Error("RPC_RATE_LIMITED");
  throw new Error("RPC_PROVIDERS_UNAVAILABLE");
}

/** Test-only reset for deterministic cooldown isolation. */
export function clearRpcCooldownForTests(): void {
  cooldowns.clear();
}
