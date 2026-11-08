import { expect, it } from "vitest";
import {
  sampleEvidenceTitle,
  sampleNear,
  sampleStatus,
  sampleTitle,
} from "../../apps/web/app/demo/format";

it("keeps readable eligibility separate from authorization, evidence and settlement", () => {
  expect(sampleStatus(SAMPLE.proposals[0].eligibility)).toBe(
    "Within sample policy — not payment authorization",
  );
  expect(sampleStatus(SAMPLE.proposals[0].authorization)).toBe(
    "Not authorized — owner approval required",
  );
  expect(sampleStatus(SAMPLE.proposals[0].evidence)).toBe(
    "Illustrative only — not verified evidence",
  );
  expect(sampleStatus(SAMPLE.proposals[0].settlement)).toBe(
    "Not submitted — no payment made",
  );
  expect(sampleStatus("SUBMITTED")).toBe("Submitted — not confirmed as paid");
  expect(sampleStatus("UNKNOWN")).toBe("Unknown — unresolved; do not retry");
  expect(() => sampleStatus("CONFIRMED_SUCCESS")).toThrow(
    "SAMPLE_STATUS_UNKNOWN",
  );
});
it("derives distinct SAMPLE titles and clear evidence category labels", () => {
  const titles = SAMPLE_ROUTES.map((route) => sampleTitle(route.path));
  expect(new Set(titles).size).toBe(6);
  for (const title of titles) expect(title).toContain("SAMPLE demo | Avroqen");
  expect(sampleEvidenceTitle("OWNER_VERIFIED_TESTNET")).toBe(
    "Owner-verified Testnet deployment evidence",
  );
  expect(() => sampleEvidenceTitle("LIVE_PAYMENT")).toThrow();
});

import {
  SAMPLE,
  SAMPLE_NOTICE,
  SAMPLE_ROUTES,
  sampleRoute,
} from "../../apps/web/app/demo/sample-data";
import { atomicToNear, nearToAtomic } from "../../packages/domain/src/index.js";

it("formats approved atomic amounts with readable precision, never float rounding", () => {
  expect(sampleNear(SAMPLE.mandate.totalAtomic)).toBe("0.10 NEAR");
  expect(sampleNear("1")).toBe("0.000000000000000000000001 NEAR");
  expect(() => sampleNear("0.1")).toThrow();
});

it("defines exactly six closed public routes without URL-driven data selection", () => {
  expect(SAMPLE_ROUTES.map((r) => r.path)).toEqual([
    "/demo",
    "/demo/mandate",
    "/demo/proposal",
    "/demo/review",
    "/demo/outcomes",
    "/demo/evidence",
  ]);
  for (const r of SAMPLE_ROUTES) expect(sampleRoute(r.path)).toBe(r);
});
it("deep-freezes the single versioned dataset and every nested collection", () => {
  function check(value: unknown) {
    if (!value || typeof value !== "object") return;
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) check(child);
  }
  check(SAMPLE);
  check(SAMPLE_ROUTES);
  expect(SAMPLE.kind).toBe("SAMPLE");
  expect(SAMPLE.version).toBe(1);
  expect(() => Object.assign(SAMPLE.mandate, { totalAtomic: "1" })).toThrow();
});
it("keeps the exact ceiling, cap and proposal amounts as checked atomic strings", () => {
  expect(SAMPLE.mandate.totalAtomic).toBe(nearToAtomic("0.10"));
  expect(SAMPLE.mandate.perPaymentAtomic).toBe(nearToAtomic("0.05"));
  expect(SAMPLE.mandate.maxExecutions).toBe(2);
  const [permitted, rejected] = SAMPLE.proposals;
  expect(permitted.amountAtomic).toBe(nearToAtomic("0.04"));
  expect(rejected.amountAtomic).toBe(nearToAtomic("0.07"));
  expect(
    BigInt(permitted.amountAtomic) <= BigInt(SAMPLE.mandate.perPaymentAtomic),
  ).toBe(true);
  expect(
    BigInt(rejected.amountAtomic) > BigInt(SAMPLE.mandate.perPaymentAtomic),
  ).toBe(true);
  expect(
    BigInt(rejected.amountAtomic) < BigInt(SAMPLE.mandate.totalAtomic),
  ).toBe(true);
  expect(atomicToNear(permitted.amountAtomic)).toBe("0.04");
  expect(BigInt(SAMPLE.mandate.perPaymentAtomic) * 2n).toBe(
    BigInt(SAMPLE.mandate.totalAtomic),
  );
});
it("labels every display card and never equates eligibility with authority or settlement", () => {
  expect(SAMPLE_NOTICE).toBe(
    "SAMPLE — Fictional data. No wallet connection or transactions.",
  );
  const cards = [
    SAMPLE.organization,
    ...SAMPLE.roles,
    SAMPLE.mandate,
    ...SAMPLE.proposals,
    SAMPLE.review,
    SAMPLE.audit,
    ...SAMPLE.states,
    ...SAMPLE.evidenceClasses,
  ];
  for (const c of cards) expect(c.label).toBe("SAMPLE");
  for (const p of SAMPLE.proposals) {
    expect(p.authorization).toBe("NOT_GRANTED");
    expect(p.evidence).toBe("ILLUSTRATIVE_ONLY");
    expect(p.settlement).toBe("NOT_SUBMITTED");
  }
  expect(SAMPLE.proposals[0].explanation).toContain(
    "Original-owner payment approval is still required",
  );
  expect(SAMPLE.mandate.funding).toBe("NOT_OBSERVED");
});
it("separates evidence classes and teaches unresolved obligations without inventing chain records", () => {
  expect(SAMPLE.evidenceClasses.map((e) => e.kind)).toEqual([
    "SAMPLE",
    "AUTOMATED_FIXTURE",
    "LOCAL_SANDBOX",
    "OWNER_VERIFIED_TESTNET",
  ]);
  expect(
    SAMPLE.states.find((s) => s.id === "sample-unknown")?.explanation,
  ).toContain("Do not repeat");
  expect(SAMPLE.review.explanation).toContain("does not prove delivery");
  const text = JSON.stringify(SAMPLE);
  expect(text).not.toMatch(
    /ed25519:|https?:\/\/|\.testnet|\.near\b|[A-Fa-f0-9]{64}/,
  );
  expect(text).not.toMatch(
    /"(?:signature|transactionHash|blockHash|accountId|session|csrfToken)":/,
  );
});
