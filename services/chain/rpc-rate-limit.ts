/**
 * Public NEAR RPC read-only failover. Transport availability is never evidence
 * that a wallet key or deployment is valid; callers retain all response checks.
 */
const rateLimitCooldowns = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 120_000;
export const READ_ONLY_RPC_PER_PROVIDER_TIMEOUT_MS = 3_500;
export const READ_ONLY_RPC_OVERALL_TIMEOUT_MS = 9_000;
export const HISTORICAL_RPC_PER_PROVIDER_TIMEOUT_MS = 6_000;
export const HISTORICAL_RPC_OVERALL_TIMEOUT_MS = 8_000;
export const READ_ONLY_RPC_RESPONSE_LIMIT = 4 * 1024 * 1024;
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
const historicalUrls = {
  testnet: [
    "https://archival-rpc.testnet.near.org",
    "https://rpc.testnet.fastnear.com",
    "https://rpc.testnet.near.org",
  ],
  mainnet: [
    "https://archival-rpc.mainnet.near.org",
    "https://rpc.mainnet.near.org",
  ],
} as const;

export type RpcFailureCategory =
  | "TIMEOUT"
  | "TRANSPORT"
  | "RESPONSE_BODY"
  | "RATE_LIMITED"
  | "TRANSIENT_HTTP"
  | "HISTORICAL_STATE_UNAVAILABLE"
  | "DEADLINE"
  | "PROVIDERS_EXHAUSTED";
export interface RpcDiagnostic {
  event: "RPC_ATTEMPT_FAILED" | "RPC_PROVIDER_SKIPPED" | "RPC_EXHAUSTED";
  network: "testnet" | "mainnet";
  method: string;
  category: RpcFailureCategory;
  provider?: string;
  attempt?: number;
  status?: number;
  attemptedProviders?: number;
  rateLimitedProviders?: number;
}
export interface RpcFailoverOptions {
  perProviderTimeoutMs?: number;
  overallTimeoutMs?: number;
  diagnostic?: (event: RpcDiagnostic) => void;
  /**
   * Retry only a strictly recognized, read-only provider response. Returning
   * false leaves the response untouched for the caller's normal validation.
   */
  retryResponse?: (response: Response) => boolean | Promise<boolean>;
  /** Use only the approved providers, with archival endpoints attempted first. */
  preferArchival?: boolean;
}

export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (header === null) return DEFAULT_COOLDOWN_MS;
  const seconds = /^\d+$/.test(header.trim())
    ? Number(header.trim()) * 1000
    : Date.parse(header) - now;
  return Number.isFinite(seconds)
    ? Math.min(MAX_COOLDOWN_MS, Math.max(1000, seconds))
    : DEFAULT_COOLDOWN_MS;
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

function withAbort<T>(
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(abortReason(signal));
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve()
      .then(operation)
      .then(
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

async function bufferedResponse(
  response: Response,
  signal: AbortSignal,
): Promise<Response> {
  if (!response.ok || !response.body) return response;
  const reader = response.body.getReader();
  let bytes = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const part = await withAbort(signal, () => reader.read());
      if (part.done) break;
      bytes += part.value.length;
      parts.push(part.value);
      if (bytes > READ_ONLY_RPC_RESPONSE_LIMIT) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Cleanup failure cannot turn a response into trusted evidence.
    }
  }
  return new Response(Buffer.concat(parts), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function transientStatus(status: number): boolean {
  return (
    status === 408 ||
    (status >= 500 && status <= 599 && status !== 501 && status !== 505)
  );
}

function errorCategory(error: unknown): RpcFailureCategory {
  return error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
    ? "TIMEOUT"
    : "TRANSPORT";
}

function publicProvider(endpoint: string): string {
  return new URL(endpoint).hostname;
}

function defaultDiagnostic(event: RpcDiagnostic): void {
  console.info("NEAR_RPC_READ", JSON.stringify(event));
}

export async function readOnlyRpcFetch(
  network: "testnet" | "mainnet",
  init: RequestInit,
  transport: typeof fetch = fetch,
  now: () => number = Date.now,
  options: RpcFailoverOptions = {},
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
  const method = String(body.method);

  const perProviderTimeoutMs = timeout(
      options.perProviderTimeoutMs,
      READ_ONLY_RPC_PER_PROVIDER_TIMEOUT_MS,
    ),
    overallTimeoutMs = timeout(
      options.overallTimeoutMs,
      READ_ONLY_RPC_OVERALL_TIMEOUT_MS,
    ),
    diagnostic =
      options.diagnostic ??
      (transport === fetch ? defaultDiagnostic : () => {}),
    overall = new AbortController(),
    overallTimer = setTimeout(
      () => overall.abort(timeoutError()),
      overallTimeoutMs,
    ),
    overallSignal = init.signal
      ? AbortSignal.any([init.signal, overall.signal])
      : overall.signal;
  const failures: RpcFailureCategory[] = [];
  let attemptedProviders = 0;
  let rateLimitedProviders = 0;
  try {
    if (overallSignal.aborted) throw abortReason(overallSignal);
    const providers = options.preferArchival
      ? historicalUrls[network]
      : urls[network];
    for (const [index, endpoint] of providers.entries()) {
      if (overallSignal.aborted) throw abortReason(overallSignal);
      const provider = publicProvider(endpoint),
        attempt = index + 1,
        cooldown = rateLimitCooldowns.get(endpoint);
      if (cooldown && cooldown > now()) {
        rateLimitedProviders++;
        failures.push("RATE_LIMITED");
        diagnostic({
          event: "RPC_PROVIDER_SKIPPED",
          network,
          method,
          category: "RATE_LIMITED",
          provider,
          attempt,
        });
        continue;
      }
      attemptedProviders++;
      const attemptController = new AbortController(),
        attemptTimer = setTimeout(
          () => attemptController.abort(timeoutError()),
          Math.min(perProviderTimeoutMs, overallTimeoutMs),
        ),
        signal = AbortSignal.any([overallSignal, attemptController.signal]);
      let stage: "FETCH" | "BODY" = "FETCH";
      try {
        let response = await withAbort(signal, () =>
          transport(endpoint, { ...init, signal }),
        );
        if (response.status === 429) {
          rateLimitCooldowns.set(
            endpoint,
            now() + retryAfterMs(response.headers.get("retry-after"), now()),
          );
          rateLimitedProviders++;
          failures.push("RATE_LIMITED");
          diagnostic({
            event: "RPC_ATTEMPT_FAILED",
            network,
            method,
            category: "RATE_LIMITED",
            provider,
            attempt,
            status: response.status,
          });
          await response.body?.cancel().catch(() => {});
          continue;
        }
        if (transientStatus(response.status)) {
          failures.push("TRANSIENT_HTTP");
          diagnostic({
            event: "RPC_ATTEMPT_FAILED",
            network,
            method,
            category: "TRANSIENT_HTTP",
            provider,
            attempt,
            status: response.status,
          });
          await response.body?.cancel().catch(() => {});
          continue;
        }
        stage = "BODY";
        response = await bufferedResponse(response, signal);
        let retryResponse = false;
        if (response.ok && options.retryResponse) {
          try {
            retryResponse = await options.retryResponse(response.clone());
          } catch {
            // The caller remains responsible for parsing the original response.
            // A retry classifier failure must never enable provider shopping.
          }
        }
        if (retryResponse && index < providers.length - 1) {
          failures.push("HISTORICAL_STATE_UNAVAILABLE");
          diagnostic({
            event: "RPC_ATTEMPT_FAILED",
            network,
            method,
            category: "HISTORICAL_STATE_UNAVAILABLE",
            provider,
            attempt,
          });
          continue;
        }
        return response;
      } catch (error) {
        if (overallSignal.aborted) {
          diagnostic({
            event: "RPC_ATTEMPT_FAILED",
            network,
            method,
            category: "DEADLINE",
            provider,
            attempt,
          });
          throw abortReason(overallSignal);
        }
        const category =
          stage === "BODY" && errorCategory(error) === "TRANSPORT"
            ? "RESPONSE_BODY"
            : errorCategory(error);
        failures.push(category);
        diagnostic({
          event: "RPC_ATTEMPT_FAILED",
          network,
          method,
          category,
          provider,
          attempt,
        });
      } finally {
        clearTimeout(attemptTimer);
      }
    }
  } finally {
    clearTimeout(overallTimer);
  }
  const rateLimited =
      failures.length > 0 &&
      failures.every((category) => category === "RATE_LIMITED"),
    timedOut =
      failures.length > 0 &&
      failures.every((category) => category === "TIMEOUT");
  diagnostic({
    event: "RPC_EXHAUSTED",
    network,
    method,
    category: rateLimited ? "RATE_LIMITED" : "PROVIDERS_EXHAUSTED",
    attemptedProviders,
    rateLimitedProviders,
  });
  if (timedOut) throw timeoutError();
  throw new Error(rateLimited ? "RPC_RATE_LIMITED" : "RPC_PROVIDERS_EXHAUSTED");
}

/** Test-only reset for deterministic cooldown isolation. */
export function clearRpcCooldownForTests(): void {
  rateLimitCooldowns.clear();
}
