import { expect, it } from "vitest";
import type { Intent, Observation } from "../../services/chain/reconcile.js";
import {
  reconciliationSchedule,
  shouldRunMonitoringProbe,
} from "../../services/chain/worker-schedule.js";

const intent: Intent = {
  id: "fixture",
  canonical_operation: "{}",
  manifest: {
    account: "vault.testnet",
    network: "testnet",
    wasmSha256: "a".repeat(64),
    keyFingerprints: ["b".repeat(64)],
    authorization: "fixture-authorization",
  },
  reported_hash: null,
  verified_hash: null,
  scan_height: "100",
  scan_hash: "scan",
  anchor_height: "100",
  anchor_hash: "anchor",
  last_height: null,
  last_block_hash: null,
  state: "UNKNOWN",
  reason: "HASH_NOT_RECOVERED",
};

const observation = (reason: string): Observation => ({
  state: "UNKNOWN",
  reason,
});

it.each([
  ["RPC_TIMEOUT", 60_000, 120_000],
  ["RPC_DEADLINE", 90_000, 150_000],
  ["RPC_PROVIDERS_EXHAUSTED", 120_000, 180_000],
  ["RPC_RATE_LIMITED", 180_000, 240_000],
] as const)("bounds first hashless %s backoff", (reason, minimum, maximum) => {
  expect(reconciliationSchedule(intent, observation(reason), () => 0)).toEqual({
    delayMs: minimum,
    reason: "HASHLESS_TRANSIENT",
  });
  expect(
    reconciliationSchedule(intent, observation(reason), () => 0.999_999)
      .delayMs,
  ).toBeLessThanOrEqual(maximum);
});

it("tiers repeated provider failures without exceeding five minutes", () => {
  const repeated = { ...intent, reason: "RPC_PROVIDERS_EXHAUSTED" };
  expect(
    reconciliationSchedule(
      repeated,
      observation("RPC_PROVIDERS_EXHAUSTED"),
      () => 0,
    ).delayMs,
  ).toBe(240_000);
  expect(
    reconciliationSchedule(
      { ...intent, reason: "RPC_RATE_LIMITED" },
      observation("RPC_RATE_LIMITED"),
      () => 1,
    ).delayMs,
  ).toBe(300_000);
});

it("restores the short cadence after verified progress or a known hash", () => {
  expect(
    reconciliationSchedule(
      { ...intent, reason: "RPC_TIMEOUT" },
      { ...observation("HASH_NOT_RECOVERED"), scanHeight: 101 },
    ),
  ).toEqual({ delayMs: 15_000, reason: "VERIFIED_PROGRESS" });
  expect(
    reconciliationSchedule(
      { ...intent, reported_hash: "reported" },
      observation("RPC_TIMEOUT"),
    ),
  ).toEqual({ delayMs: 15_000, reason: "KNOWN_HASH" });
});

it("paces a caught-up hashless scan without treating it as failure", () => {
  const scheduled = reconciliationSchedule(
    intent,
    { ...observation("HASH_NOT_RECOVERED"), scanHeight: 100 },
    () => 0.5,
  );
  expect(scheduled.reason).toBe("HASHLESS_IDLE");
  expect(scheduled.delayMs).toBeGreaterThanOrEqual(60_000);
  expect(scheduled.delayMs).toBeLessThanOrEqual(90_000);
});

it("defers a due monitoring probe only while reconciliation is active", () => {
  expect(shouldRunMonitoringProbe(100, 100, true, true)).toBe(false);
  expect(shouldRunMonitoringProbe(100, 100, false, true)).toBe(true);
  expect(shouldRunMonitoringProbe(99, 100, false, true)).toBe(false);
  expect(shouldRunMonitoringProbe(100, 100, false, false)).toBe(false);
  expect(shouldRunMonitoringProbe(300_100, 100, false, false)).toBe(true);
});
