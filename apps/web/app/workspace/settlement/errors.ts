const messages: Record<string, string> = {
  DEPLOYMENT_NOT_AUTHORIZED: "Live transactions are not authorized.",
  DEPLOYMENT_VERIFICATION_TIMEOUT:
    "Current deployment verification timed out before the wallet prompt opened. The unsigned operation is unchanged; retry the read-only check.",
  DEPLOYMENT_VERIFICATION_UNAVAILABLE:
    "Current deployment verification is temporarily unavailable. The unsigned operation is unchanged and no wallet transaction was opened.",
  DEPLOYMENT_VERIFICATION_INCONSISTENT:
    "Current deployment verification did not match the authorized manifest. The unsigned operation remains blocked.",
  UNRESOLVED_OPERATION:
    "A conflicting operation for this mandate or account-level storage resource is unresolved. Independently authorized mandates remain available.",
  WALLET_PROMPT_ACTIVE:
    "Another transaction prompt is active for this wallet. Finish or close it before opening this reviewed operation.",
  OPERATION_NOT_ALLOWED:
    "This operation is not permitted by the mandate or signing identity.",
  CONSENT_OR_AGENT_UNAVAILABLE: "Consent or agent access is unavailable.",
  OWNER_REQUIRED: "Only the original owner may perform this action.",
  VAULT_MISMATCH: "This mandate targets a different vault.",
  INTENT_ALREADY_ATTEMPTED:
    "The wallet prompt was already attempted. Do not retry a transaction with an uncertain outcome.",
  RECOVERY_VALIDITY_WINDOW_OPEN:
    "The original transaction is still within its possible validity window. It remains quarantined and cannot be replaced yet.",
  RECOVERY_SIGNER_NONCE_CHANGED:
    "The signing account changed after the original attempt, so non-broadcast cannot be established safely.",
  RECOVERY_STORAGE_CREDIT_CHANGED:
    "Onchain storage credit changed after the original attempt. Reconcile the original operation before any replacement.",
  RECOVERY_EVIDENCE_UNAVAILABLE:
    "Independent recovery evidence is currently unavailable. The original operation remains quarantined.",
  RECOVERY_HISTORICAL_STATE_UNAVAILABLE:
    "The approved providers could not retrieve the exact historical recovery state. The original operation remains quarantined.",
  RECOVERY_EVIDENCE_INCONSISTENT:
    "Historical recovery providers returned inconsistent pinned evidence. The original operation remains quarantined; do not continue.",
  RPC_TIMEOUT:
    "The blockchain evidence check timed out. The original operation remains quarantined; retry the read-only check later.",
  RECOVERY_NOT_ELIGIBLE:
    "This operation is not eligible for controlled replacement.",
  RECOVERY_CHALLENGE_EXISTS:
    "A recovery authorization is already pending. Wait for it to expire before requesting another.",
  INVALID_PROOF:
    "The recovery authorization could not be verified. No replacement was prepared.",
};

export function settlementRequestError(status: number, value: unknown): Error {
  const response =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {},
    code = typeof response.error === "string" ? response.error : "",
    reference =
      typeof response.correlationId === "string"
        ? ` Reference: ${response.correlationId}.`
        : "";
  return new Error(
    (messages[code] ??
      (status === 401
        ? "Sign in again to continue."
        : "Request unavailable. Refresh state before retrying.")) + reference,
  );
}
