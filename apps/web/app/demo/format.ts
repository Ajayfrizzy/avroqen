// Reviewed pure formatter only; no financial operation or policy object is imported.
import { atomicToNear } from "../../../../packages/domain/src/index";
import { type SampleRoute, sampleRoute } from "./sample-data";

export function sampleNear(amount: string): string {
  const value = atomicToNear(amount);
  const point = value.indexOf(".");
  return `${point < 0 ? `${value}.00` : value.padEnd(point + 3, "0")} NEAR`;
}

// Presentation only: never change the immutable source codes or grant authority.
export function sampleStatus(code: string): string {
  switch (code) {
    case "WITHIN_SAMPLE_POLICY":
      return "Within sample policy — not payment authorization";
    case "REJECTED_PER_PAYMENT_LIMIT":
      return "Rejected — exceeds per-payment cap";
    case "NOT_GRANTED":
      return "Not authorized — owner approval required";
    case "ILLUSTRATIVE_ONLY":
      return "Illustrative only — not verified evidence";
    case "NOT_SUBMITTED":
      return "Not submitted — no payment made";
    case "NOT_OBSERVED":
      return "Not observed — no funds confirmed";
    case "SUBMITTED":
      return "Submitted — not confirmed as paid";
    case "UNKNOWN":
      return "Unknown — unresolved; do not retry";
    case "BLOCKED":
      return "Blocked";
    case "RETAINED":
      return "Retained";
    case "DISABLED":
      return "Disabled";
    default:
      throw new Error("SAMPLE_STATUS_UNKNOWN");
  }
}
export function sampleEvidenceTitle(code: string): string {
  switch (code) {
    case "SAMPLE":
      return "Fictional SAMPLE";
    case "AUTOMATED_FIXTURE":
      return "Automated regression fixtures";
    case "LOCAL_SANDBOX":
      return "Local sandbox evidence";
    case "OWNER_VERIFIED_TESTNET":
      return "Owner-verified Testnet deployment evidence";
    default:
      throw new Error("SAMPLE_EVIDENCE_UNKNOWN");
  }
}
export function sampleTitle(path: SampleRoute["path"]): string {
  const route = sampleRoute(path);
  if (!route) throw new Error("SAMPLE_ROUTE_INVALID");
  return `${route.title} — SAMPLE demo | Avroqen`;
}
