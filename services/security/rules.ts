import { z } from "zod";
export const WINDOW_MS = 300000;
export const incidentStates = [
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "RESOLVED",
  "DISMISSED",
] as const;
export const resolutionReasons = [
  "CONTROL_APPLIED",
  "EXPECTED_ACTIVITY",
  "DUPLICATE_INCIDENT",
  "INVESTIGATION_COMPLETE",
] as const;
export function transitionAllowed(from: string, to: string) {
  return (
    (
      {
        OPEN: ["ACKNOWLEDGED"],
        ACKNOWLEDGED: ["INVESTIGATING"],
        INVESTIGATING: ["RESOLVED", "DISMISSED"],
      } as Record<string, string[]>
    )[from]?.includes(to) ?? false
  );
}
const reasons = new Set([
  "INVALID_PROOF",
  "INVALID_REQUEST",
  "ORIGIN_DENIED",
  "CSRF_DENIED",
  "SESSION_REQUIRED",
  "ACCESS_DENIED",
  "OWNER_REQUIRED",
  "REQUEST_LIMIT",
  "AGENT_DISABLED",
  "AGENT_CREDENTIAL_INVALID",
  "CREDENTIAL_REUSE",
  "PER_PAYMENT_LIMIT",
  "RECIPIENT_DENIED",
  "SCOPE_MISMATCH",
  "POLICY_INTEGRITY_FAILED",
  "PROPOSAL_INTEGRITY_FAILED",
  "EVIDENCE_MISMATCH",
  "SOURCE_REFERENCE_MISMATCH",
  "REVIEW_ALREADY_FINAL",
  "VERIFIER_REQUIRED",
  "UNTRUSTED_CLAIM",
  "DISPUTED",
  "REJECTED",
  "VERIFIED",
  "UNVERIFIABLE",
  "DEPLOYMENT_CODE_MISMATCH",
  "DEPLOYMENT_KEY_MISMATCH",
  "DEPLOYMENT_DOMAIN_MISMATCH",
  "NETWORK_MISMATCH",
  "RPC_BLOCK_MISMATCH",
  "STALE_RPC",
  "CONFLICTING_RPC",
  "CONFLICTING_INTENT_ANCHOR",
  "CONFLICTING_RECEIPT_BLOCK",
  "CONFLICTING_SCAN",
  "CONFLICTING_TRANSACTION_BLOCK",
  "ONCHAIN_POLICY_MISMATCH",
  "ONCHAIN_PROPOSAL_MISMATCH",
  "TRANSACTION_MISMATCH",
  "TRANSACTION_PREDATES_INTENT",
  "RECEIPT_ID_MISMATCH",
  "CALLBACK_BINDING",
  "CALLBACK_MISSING",
  "CALLBACK_UNRESOLVED",
  "CALLBACK_RETURN_MISMATCH",
  "CONTRACT_OUTCOME_MISSING",
  "WITHDRAWAL_BINDING",
  "TRANSFER_RECEIPT_MISSING",
  "OUTCOME_QUARANTINED",
  "MISSING_RECEIPT",
  "DUPLICATE_RECEIPT",
  "UNRELATED_RECEIPT",
  "RPC_OR_EVIDENCE_UNAVAILABLE",
  "RPC_UNAVAILABLE",
  "RPC_TIMEOUT",
  "RPC_HTTP_STATUS",
  "RPC_EMPTY_RESPONSE",
  "RPC_RESPONSE_LIMIT",
  "RPC_MALFORMED_RESPONSE",
  "RPC_DUPLICATE_KEY",
  "RPC_PROTOCOL_VERSION",
  "RPC_ID_MISMATCH",
  "RPC_AMBIGUOUS_ENVELOPE",
  "RPC_INVALID_ENVELOPE",
  "RPC_PROVIDER_ERROR",
  "RPC_TIMESTAMP_INVALID",
  "RPC_CLOCK_SKEW",
  "RPC_BLOCK_INVALID",
  "CONTRACT_UNAVAILABLE",
  "LONG_RUNNING",
  "WORKER_STALLED",
  "LOW_RESERVE",
  "GAS_PRICE_ELEVATED",
  "OPERATION_NOT_ALLOWED",
  "INTENT_CONFIGURATION_CHANGED",
  "AUTHENTIC_REVIEW_REQUIRED",
  "HASH_ALREADY_REPORTED",
  "VERIFIED_REVIEW_REQUIRED",
  "SERVICE_UNAVAILABLE",
  "WALLET_VERIFIED",
  "SESSION_REVOKED",
  "APP_RECORD_DISABLED",
  "RECORD_ONLY_NO_AUTHORITY",
  "APP_ORGANIZATION_CREATED",
  "CHALLENGE_ISSUED",
  "OFFCHAIN_PROPOSALS_ONLY",
  "ROTATED",
  "OFFCHAIN_ONLY",
  "PREFLIGHT_ACCEPTED",
  "CONSENT_UNAVAILABLE",
  "MANDATE_EXPIRED",
  "WALLET_PROMPT_OPENING",
  "WALLET_CANCELED",
  "WALLET_SUBMISSION_FAILED",
  "WALLET_OUTCOME_UNKNOWN",
  "UNVERIFIED_WALLET_HASH",
  "WAITING_FINALITY",
  "CALL_FINALIZED",
  "TRANSFER_AND_CALLBACK_FINALIZED",
  "TRANSFER_DEFINITIVELY_FAILED",
  "CONTRACT_REJECTED",
  "TRANSACTION_REJECTED",
  "HASH_NOT_RECOVERED",
  "AMBIGUOUS_TRANSACTIONS",
  "UNSIGNED",
]);
export const safeReason = (r: string) => (reasons.has(r) ? r : "OTHER");
export const safeFailure = (e: unknown) =>
  e instanceof Error && reasons.has(e.message)
    ? e.message
    : "RPC_OR_EVIDENCE_UNAVAILABLE";
export interface Rule {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  classification: string;
  threshold: number;
  explanation: string;
}
const rule = (
  id: string,
  explanation: string,
  threshold = 1,
  classification = "OPERATIONAL_WARNING",
  severity: Rule["severity"] = "MEDIUM",
): Rule => ({ id, explanation, threshold, classification, severity });
export function rulesFor(type: string, reason: string): Rule[] {
  const rules: Rule[] = [];
  if (type === "login_denied")
    rules.push(
      rule(
        "AUTH_ATTEMPTS",
        "Five or more rejected authentication requests in a five-minute window. This is an indicator, not proof of an attack.",
        5,
      ),
    );
  if (type === "PREFLIGHT_REJECTED")
    rules.push(
      rule(
        "PROPOSAL_DENIALS",
        "Three or more agent proposal denials in a five-minute window.",
        3,
        "POLICY_REJECTION",
      ),
    );
  if (reason === "PER_PAYMENT_LIMIT")
    rules.push(
      rule(
        "SPENDING_LIMIT",
        "The application rejected an amount above the mandate payment limit. No payment is implied.",
        1,
        "POLICY_REJECTION",
        "HIGH",
      ),
    );
  if (
    [
      "RECIPIENT_DENIED",
      "SCOPE_MISMATCH",
      "POLICY_INTEGRITY_FAILED",
      "PROPOSAL_INTEGRITY_FAILED",
    ].includes(reason)
  )
    rules.push(
      rule(
        "POLICY_SUBSTITUTION",
        "Recipient or immutable policy bindings did not match.",
        1,
        "POLICY_REJECTION",
        "HIGH",
      ),
    );
  if (["CREDENTIAL_REUSE", "AGENT_DISABLED"].includes(reason))
    rules.push(
      rule(
        "REVOKED_ACCESS",
        "An application credential or disabled agent was used after access was removed.",
        1,
        "POLICY_REJECTION",
        "HIGH",
      ),
    );
  if (
    [
      "EVIDENCE_MISMATCH",
      "SOURCE_REFERENCE_MISMATCH",
      "REVIEW_ALREADY_FINAL",
      "VERIFIER_REQUIRED",
      "UNTRUSTED_CLAIM",
    ].includes(reason) ||
    type === "VERIFIER_DENIED"
  )
    rules.push(
      rule(
        "VERIFIER_BINDING",
        "A verifier request was rejected. Check identity, single-use challenge and exact evidence bindings; this does not prove deception.",
        1,
        "POLICY_REJECTION",
      ),
    );
  if (reason === "DISPUTED")
    rules.push(
      rule(
        "EVIDENCE_DISPUTE",
        "A designated reviewer recorded an offchain dispute. Existing dispatched transfers may still settle.",
        1,
        "UNVERIFIED_OBSERVATION",
        "HIGH",
      ),
    );
  if (
    [
      "DEPLOYMENT_CODE_MISMATCH",
      "DEPLOYMENT_KEY_MISMATCH",
      "DEPLOYMENT_DOMAIN_MISMATCH",
      "NETWORK_MISMATCH",
      "INTENT_CONFIGURATION_CHANGED",
    ].includes(reason)
  )
    rules.push(
      rule(
        "DEPLOYMENT_CHANGED",
        "Observed deployment identity, code or key permissions differ from the approved configuration. Submissions must remain unavailable.",
        1,
        "CONFIGURATION_MISMATCH",
        "HIGH",
      ),
    );
  if (
    [
      "TRANSACTION_MISMATCH",
      "TRANSACTION_PREDATES_INTENT",
      "RECEIPT_ID_MISMATCH",
      "CALLBACK_BINDING",
      "CALLBACK_MISSING",
      "CALLBACK_UNRESOLVED",
      "CALLBACK_RETURN_MISMATCH",
      "CONTRACT_OUTCOME_MISSING",
      "WITHDRAWAL_BINDING",
      "TRANSFER_RECEIPT_MISSING",
      "OUTCOME_QUARANTINED",
      "MISSING_RECEIPT",
      "DUPLICATE_RECEIPT",
      "UNRELATED_RECEIPT",
      "ONCHAIN_POLICY_MISMATCH",
      "ONCHAIN_PROPOSAL_MISMATCH",
      "RPC_BLOCK_MISMATCH",
      "STALE_RPC",
      "CONFLICTING_RPC",
      "CONFLICTING_INTENT_ANCHOR",
      "CONFLICTING_RECEIPT_BLOCK",
      "CONFLICTING_SCAN",
      "CONFLICTING_TRANSACTION_BLOCK",
    ].includes(reason)
  )
    rules.push(
      rule(
        "CHAIN_INCONSISTENCY",
        "Receipt or contract evidence is missing, stale or inconsistent. Keep obligations quarantined; do not retry a payment.",
        1,
        "UNVERIFIED_OBSERVATION",
        "HIGH",
      ),
    );
  if (
    [
      "RPC_OR_EVIDENCE_UNAVAILABLE",
      "RPC_UNAVAILABLE",
      "CONTRACT_UNAVAILABLE",
    ].includes(reason)
  )
    rules.push(
      rule(
        "CHAIN_UNAVAILABLE",
        "Contract or RPC verification is unavailable. No failure or financial success can be inferred.",
      ),
    );
  if (reason === "LONG_RUNNING")
    rules.push(
      rule(
        "SETTLEMENT_DELAY",
        "An attempted operation has remained unresolved for more than ten minutes. Time does not release funds.",
      ),
    );
  if (reason === "WORKER_STALLED")
    rules.push(
      rule(
        "WORKER_HEALTH",
        "A worker heartbeat is absent or older than one minute. Check service health and retained obligations.",
      ),
    );
  if (["LOW_RESERVE", "GAS_PRICE_ELEVATED"].includes(reason))
    rules.push(
      rule(
        "RESOURCE_WARNING",
        "Observed backing is below required available balances, storage credit, storage and protocol reserve, or gas price exceeds the documented baseline. Recheck costs; no top-up is automatic.",
      ),
    );
  if (type === "CONFIRMED_FAILED")
    rules.push(
      rule(
        "TRANSACTION_FAILED",
        "Verified reconciliation recorded a definitive transaction failure. Inspect evidence before preparing a fresh action.",
      ),
    );
  if (type === "TRANSACTION_DENIED")
    rules.push(
      rule(
        "TRANSACTION_DENIAL",
        "A transaction preparation or wallet-begin request was rejected by application controls.",
        3,
        "POLICY_REJECTION",
      ),
    );
  return rules;
}
const atomic = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(78)
  .transform(BigInt);
export function reserveWarning(raw: unknown) {
  const a = z
    .object({
      account_balance: atomic,
      available: atomic,
      storage_credit: atomic,
      storage_usage_bytes: atomic,
      storage_byte_cost: atomic,
      protocol_reserve_minimum: atomic,
    })
    .parse(raw);
  return (
    a.account_balance <
    a.available +
      a.storage_credit +
      a.storage_usage_bytes * a.storage_byte_cost +
      a.protocol_reserve_minimum
  );
}
