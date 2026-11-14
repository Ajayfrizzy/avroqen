// M9.1 display contract only. No route entrypoint, application objects or live I/O.
type Frozen<T> = T extends object
  ? { readonly [K in keyof T]: Frozen<T[K]> }
  : T;
function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}
export const SAMPLE_NOTICE =
  "SAMPLE — Fictional data. No wallet connection or transactions.";
export const SAMPLE_ROUTES = freeze([
  {
    path: "/demo",
    title: "Start",
    purpose: "Explain the sample organization and authority boundaries.",
  },
  {
    path: "/demo/mandate",
    title: "Mandate",
    purpose: "Inspect immutable illustrative limits, not a funded balance.",
  },
  {
    path: "/demo/proposal",
    title: "Agent proposal",
    purpose: "Read a pre-authored restricted-agent proposal; submit nothing.",
  },
  {
    path: "/demo/review",
    title: "Independent review",
    purpose:
      "Explain independent source checks without claiming a real review.",
  },
  {
    path: "/demo/outcomes",
    title: "Outcomes",
    purpose:
      "Compare policy eligibility and denial; explain unresolved outcomes.",
  },
  {
    path: "/demo/evidence",
    title: "Evidence and limits",
    purpose: "Separate evidence classes and explain remaining live acceptance.",
  },
] as const);
export type SampleRoute = (typeof SAMPLE_ROUTES)[number];
// Exact presentation route lookup only. Never interprets query parameters or IDs.
export function sampleRoute(path: unknown): SampleRoute | null {
  return SAMPLE_ROUTES.find((route) => route.path === path) ?? null;
}

export const SAMPLE = freeze({
  kind: "SAMPLE",
  version: 1,
  id: "sample-display-v1",
  notice: SAMPLE_NOTICE,
  network: "NO_NETWORK_CONNECTED",
  organization: {
    label: "SAMPLE",
    id: "sample-organization",
    name: "Sample Studio",
  },
  roles: [
    {
      label: "SAMPLE",
      id: "sample-owner",
      name: "Sample owner",
      authority:
        "Defines terms; separately authorizes each payment in the real product.",
    },
    {
      label: "SAMPLE",
      id: "sample-agent",
      name: "Sample agent",
      authority:
        "Proposes only; cannot sign, spend, appoint a verifier or change limits.",
    },
    {
      label: "SAMPLE",
      id: "sample-verifier",
      name: "Sample verifier",
      authority:
        "Checks independently obtained sources; cannot transfer funds.",
    },
    {
      label: "SAMPLE",
      id: "sample-recipient",
      name: "Sample service provider",
      authority: "The sole illustrative permitted recipient.",
    },
  ],
  mandate: {
    label: "SAMPLE",
    id: "sample-mandate-01",
    task: "Review an invoice for a specified service from the sample provider.",
    recipient: "sample-recipient",
    asset: "Illustrative NEAR",
    totalAtomic: "100000000000000000000000",
    perPaymentAtomic: "50000000000000000000000",
    maxExecutions: 2,
    timeRule:
      "Fixed illustrative window: all examples are inside it; expired terms must be rejected in the real product.",
    funding: "NOT_OBSERVED",
    explanation:
      "A policy ceiling is not a deposit or an available balance. No funds are allocated here.",
  },
  proposals: [
    {
      label: "SAMPLE",
      id: "sample-proposal-permitted",
      amountAtomic: "40000000000000000000000",
      eligibility: "WITHIN_SAMPLE_POLICY",
      authorization: "NOT_GRANTED",
      evidence: "ILLUSTRATIVE_ONLY",
      settlement: "NOT_SUBMITTED",
      explanation:
        "SAMPLE proposal within policy. Illustrative review matches. Original-owner payment approval is still required. No transaction was created.",
    },
    {
      label: "SAMPLE",
      id: "sample-proposal-rejected",
      amountAtomic: "70000000000000000000000",
      eligibility: "REJECTED_PER_PAYMENT_LIMIT",
      authorization: "NOT_GRANTED",
      evidence: "ILLUSTRATIVE_ONLY",
      settlement: "NOT_SUBMITTED",
      explanation:
        "SAMPLE rejection: 0.07 NEAR exceeds the 0.05 NEAR per-payment cap even though it is below the 0.10 NEAR total ceiling. Agent intent, an administrator or an evidence hash cannot override it.",
    },
  ],
  review: {
    label: "SAMPLE",
    id: "sample-review",
    claim: "INVOICE_ISSUED",
    explanation:
      "A designated verifier independently obtains authenticated issuer records and checks the exact amount, recipient, reference and claim. A hash proves byte integrity, not truth; INVOICE_ISSUED does not prove delivery. This walkthrough performs no source verification or attestation.",
    checks: [
      "Source obtained independently of the agent",
      "Issuer and reference",
      "Exact bytes, amount and recipient",
      "Claim scope, expiry and distinct required quorum",
      "Separate original-owner payment approval",
    ],
  },
  audit: {
    label: "SAMPLE",
    id: "sample-audit-explanation",
    explanation:
      "The real product binds immutable mandate version, proposal, scoped review and separately authorized execution to verified outcomes. These sample identifiers are a narrative, not an audit record, signature or onchain history.",
    references: [
      "sample-mandate-01",
      "sample-proposal-permitted",
      "sample-review",
    ],
  },
  states: [
    {
      label: "SAMPLE",
      id: "sample-pending",
      title: "Pending — explanation only",
      explanation:
        "Submission is not payment. Final settlement needs attributable finalized transfer and private callback receipts plus matching contract state.",
    },
    {
      label: "SAMPLE",
      id: "sample-unknown",
      title: "Unknown — explanation only",
      explanation:
        "An unresolved result is neither success nor confirmed failure. Do not repeat the operation or release protected obligations on a timeout.",
    },
    {
      label: "SAMPLE",
      id: "sample-control",
      title: "Pause and revoke — explanation only",
      explanation:
        "After onchain inclusion, stop new reservations; do not reverse already dispatched transfers. Incident acknowledgement cannot change custody or resolve unknown funds.",
    },
  ],
  evidenceClasses: [
    {
      label: "SAMPLE",
      kind: "SAMPLE",
      explanation:
        "Fictional product explanation; no signatures, source records or chain observations.",
    },
    {
      label: "SAMPLE",
      kind: "AUTOMATED_FIXTURE",
      explanation:
        "Controlled regression tests are not human or public-chain acceptance.",
    },
    {
      label: "SAMPLE",
      kind: "LOCAL_SANDBOX",
      explanation: "Local Wasm and receipt behavior is not a public payment.",
    },
    {
      label: "SAMPLE",
      kind: "OWNER_VERIFIED_TESTNET",
      explanation:
        "A separate existing report records deployment and initialization only. It does not prove a SAMPLE payment or fresh chain state. No real chain record is embedded in this dataset.",
    },
  ],
  safety: {
    primaryProof: "BLOCKED",
    testingKey: "RETAINED",
    financialOperations: "DISABLED",
  },
} as const);
