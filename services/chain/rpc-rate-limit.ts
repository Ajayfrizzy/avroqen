/**
 * Public NEAR RPC read-only failover. Transport availability is never evidence
 * that a wallet key or deployment is valid; callers retain all response checks.
 */
const rateLimitCooldowns = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 120_000;
const ARCHIVAL_INLINE_RETRY_MAX_MS = 1_000;
export const READ_ONLY_RPC_PER_PROVIDER_TIMEOUT_MS = 3_500;
export const READ_ONLY_RPC_OVERALL_TIMEOUT_MS = 9_000;
export const HISTORICAL_RPC_PER_PROVIDER_TIMEOUT_MS = 6_000;
export const HISTORICAL_RPC_OVERALL_TIMEOUT_MS = 20_000;
export const READ_ONLY_RPC_RESPONSE_LIMIT = 4 * 1024 * 1024;
export const READ_ONLY_RPC_MAX_CONCURRENCY = 4;
export const ARCHIVAL_RPC_MAX_CONCURRENCY = 1;
const urls = {
  testnet: ["https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"],
  mainnet: ["https://rpc.mainnet.near.org"],
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
export type RpcReadPriority = "interactive" | "background";
export interface RpcDiagnostic {
  event:
    | "RPC_ATTEMPT_FAILED"
    | "RPC_PROVIDER_DELAYED"
    | "RPC_PROVIDER_SKIPPED"
    | "RPC_EXHAUSTED";
  network: "testnet" | "mainnet";
  method: string;
  route: "CURRENT" | "HISTORICAL";
  category: RpcFailureCategory;
  provider?: string;
  attempt?: number;
  status?: number;
  attemptedProviders?: number;
  rateLimitedProviders?: number;
  waitMs?: number;
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
  /** Interactive evidence checks are queued before future background reads. */
  priority?: RpcReadPriority;
}

type GateWaiter = {
  priority: RpcReadPriority;
  resolve: (release: () => void) => void;
  reject: (reason: unknown) => void;
  signal: AbortSignal;
};
type Gate = {
  active: number;
  interactive: GateWaiter[];
  background: GateWaiter[];
};
const gate = (): Gate => ({ active: 0, interactive: [], background: [] });
const rpcGate = gate();
const archivalGate = gate();

function drainGate(target: Gate, limit: number): void {
  while (target.active < limit) {
    const waiter = target.interactive.shift() ?? target.background.shift();
    if (!waiter) return;
    if (waiter.signal.aborted) continue;
    target.active++;
    let released = false;
    waiter.resolve(() => {
      if (released) return;
      released = true;
      target.active--;
      drainGate(target, limit);
    });
  }
}

function acquireGate(
  target: Gate,
  limit: number,
  priority: RpcReadPriority,
  signal: AbortSignal,
): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const waiter: GateWaiter = { priority, resolve, reject, signal };
    const queue = target[priority];
    const aborted = () => {
      const index = queue.indexOf(waiter);
      if (index !== -1) queue.splice(index, 1);
      reject(abortReason(signal));
    };
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    const wrappedResolve = waiter.resolve;
    waiter.resolve = (release) => {
      signal.removeEventListener("abort", aborted);
      wrappedResolve(release);
    };
    queue.push(waiter);
    drainGate(target, limit);
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(abortReason(signal));
    }
    if (signal.aborted) {
      clearTimeout(timer);
      aborted();
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
  });
}

function archival(endpoint: string): boolean {
  return publicProvider(endpoint).startsWith("archival-rpc.");
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
  const route = options.preferArchival ? "HISTORICAL" : "CURRENT";

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
      const provider = publicProvider(endpoint),
        waitForRateLimit = options.preferArchival && archival(endpoint);
      let rateLimitRetries = 0;
      while (true) {
        if (overallSignal.aborted) throw abortReason(overallSignal);
        const cooldown = rateLimitCooldowns.get(endpoint);
        if (cooldown && cooldown > now()) {
          const waitMs = cooldown - now();
          rateLimitedProviders++;
          // A short Retry-After received by this request may be retried once.
          // Longer or inherited cooldowns must not consume the whole historical
          // deadline before an approved fallback provider gets a chance.
          if (
            !waitForRateLimit ||
            rateLimitRetries === 0 ||
            waitMs > ARCHIVAL_INLINE_RETRY_MAX_MS
          ) {
            failures.push("RATE_LIMITED");
            diagnostic({
              event: "RPC_PROVIDER_SKIPPED",
              network,
              method,
              route,
              category: "RATE_LIMITED",
              provider,
              attempt: index + 1,
            });
            break;
          }
          diagnostic({
            event: "RPC_PROVIDER_DELAYED",
            network,
            method,
            route,
            category: "RATE_LIMITED",
            provider,
            attempt: attemptedProviders + 1,
            waitMs,
          });
          await wait(waitMs, overallSignal);
        }
        const archivalRelease = waitForRateLimit
          ? await acquireGate(
              archivalGate,
              ARCHIVAL_RPC_MAX_CONCURRENCY,
              options.priority ?? "background",
              overallSignal,
            )
          : () => {};
        const release = await acquireGate(
          rpcGate,
          READ_ONLY_RPC_MAX_CONCURRENCY,
          options.priority ?? "background",
          overallSignal,
        ).catch((error) => {
          archivalRelease();
          throw error;
        });
        const queuedCooldown = rateLimitCooldowns.get(endpoint);
        if (queuedCooldown && queuedCooldown > now()) {
          release();
          archivalRelease();
          continue;
        }
        attemptedProviders++;
        const attempt = attemptedProviders,
          attemptController = new AbortController(),
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
            const waitMs = retryAfterMs(
              response.headers.get("retry-after"),
              now(),
            );
            rateLimitCooldowns.set(endpoint, now() + waitMs);
            rateLimitedProviders++;
            failures.push("RATE_LIMITED");
            diagnostic({
              event: "RPC_ATTEMPT_FAILED",
              network,
              method,
              route,
              category: "RATE_LIMITED",
              provider,
              attempt,
              status: response.status,
              waitMs,
            });
            await response.body?.cancel().catch(() => {});
            if (waitForRateLimit && rateLimitRetries++ < 1) continue;
            break;
          }
          if (transientStatus(response.status)) {
            failures.push("TRANSIENT_HTTP");
            diagnostic({
              event: "RPC_ATTEMPT_FAILED",
              network,
              method,
              route,
              category: "TRANSIENT_HTTP",
              provider,
              attempt,
              status: response.status,
            });
            await response.body?.cancel().catch(() => {});
            break;
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
              route,
              category: "HISTORICAL_STATE_UNAVAILABLE",
              provider,
              attempt,
            });
            break;
          }
          return response;
        } catch (error) {
          if (overallSignal.aborted) {
            diagnostic({
              event: "RPC_ATTEMPT_FAILED",
              network,
              method,
              route,
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
            route,
            category,
            provider,
            attempt,
          });
          break;
        } finally {
          clearTimeout(attemptTimer);
          release();
          archivalRelease();
        }
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
    route,
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
  for (const target of [rpcGate, archivalGate]) {
    target.interactive.splice(0);
    target.background.splice(0);
    target.active = 0;
  }
}
