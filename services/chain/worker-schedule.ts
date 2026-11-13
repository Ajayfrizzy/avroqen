import type { Intent, Observation } from "./reconcile.js";

export const RECONCILIATION_NORMAL_DELAY_MS = 15_000;
export const RECONCILIATION_MIN_BACKOFF_MS = 60_000;
export const RECONCILIATION_MAX_BACKOFF_MS = 300_000;
export const HASHLESS_STARVATION_LIMIT_MS = 300_000;
export const MONITORING_MAX_DEFERRAL_MS = 300_000;

const transientBackoff = new Map<string, number>([
  ["RPC_TIMEOUT", 60_000],
  ["RPC_DEADLINE", 90_000],
  ["RPC_PROVIDERS_EXHAUSTED", 120_000],
  ["RPC_RATE_LIMITED", 180_000],
]);

export type ReconciliationScheduleReason =
  | "KNOWN_HASH"
  | "VERIFIED_PROGRESS"
  | "HASHLESS_TRANSIENT"
  | "HASHLESS_IDLE"
  | "DEFAULT";

export interface ReconciliationSchedule {
  delayMs: number;
  reason: ReconciliationScheduleReason;
}

function jitter(baseMs: number, spanMs: number, random: () => number): number {
  const sample = random();
  const bounded = Number.isFinite(sample)
    ? Math.min(0.999_999, Math.max(0, sample))
    : 0;
  return Math.min(
    RECONCILIATION_MAX_BACKOFF_MS,
    baseMs + Math.floor(bounded * (spanMs + 1)),
  );
}

export function reconciliationSchedule(
  intent: Intent,
  result: Observation,
  random: () => number = Math.random,
): ReconciliationSchedule {
  if (
    intent.reported_hash ||
    intent.verified_hash ||
    result.reportedHash ||
    result.verifiedHash
  )
    return { delayMs: RECONCILIATION_NORMAL_DELAY_MS, reason: "KNOWN_HASH" };

  if (
    result.scanHeight !== undefined &&
    result.scanHeight > Number(intent.scan_height)
  )
    return {
      delayMs: RECONCILIATION_NORMAL_DELAY_MS,
      reason: "VERIFIED_PROGRESS",
    };

  const transientBase = transientBackoff.get(result.reason);
  if (transientBase !== undefined) {
    const repeated = intent.reason === result.reason;
    const base = Math.min(
      RECONCILIATION_MAX_BACKOFF_MS,
      repeated ? transientBase * 2 : transientBase,
    );
    return {
      delayMs: jitter(
        base,
        Math.min(60_000, RECONCILIATION_MAX_BACKOFF_MS - base),
        random,
      ),
      reason: "HASHLESS_TRANSIENT",
    };
  }

  if (result.reason === "HASH_NOT_RECOVERED")
    return {
      delayMs: jitter(RECONCILIATION_MIN_BACKOFF_MS, 30_000, random),
      reason: "HASHLESS_IDLE",
    };

  return { delayMs: RECONCILIATION_NORMAL_DELAY_MS, reason: "DEFAULT" };
}

export function shouldRunMonitoringProbe(
  now: number,
  nextProbe: number,
  reconciliationActive: boolean,
  reconciliationIdle: boolean,
): boolean {
  return (
    now >= nextProbe &&
    !reconciliationActive &&
    (reconciliationIdle || now >= nextProbe + MONITORING_MAX_DEFERRAL_MS)
  );
}
