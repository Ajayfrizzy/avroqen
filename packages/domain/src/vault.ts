import type { MandatePolicy } from "./index";

/** RPC/wallet boundary only. There is deliberately no backend signer or sender. */
export type VaultOutcome =
  | "Proposed"
  | "Disputed"
  | "Pending"
  | "Succeeded"
  | "ConfirmedFailed";
export type VaultStatus = "Active" | "Paused" | "Revoked";
export type AtomicUnits = string;
export interface RegisterMandateArgs {
  canonical_policy: string;
  expected_digest: string;
  guardian: string | null;
  storage_limit: AtomicUnits;
}
export interface VaultMandate {
  policy: MandatePolicy;
  policy_digest: string;
  guardian: string | null;
  status: VaultStatus;
  available: AtomicUnits;
  reserved: AtomicUnits;
  spent: AtomicUnits;
  withdrawal_pending: AtomicUnits;
  withdrawn: AtomicUnits;
  deposited: AtomicUnits;
  pending_count: number;
  successful_count: number;
  proposal_count: number;
  storage_limit: AtomicUnits;
  storage_used: AtomicUnits;
}
export interface VaultEvidence {
  protocol_version: 1;
  network_id: "testnet";
  vault_account: string;
  mandate_id: string;
  policy_version: 1;
  proposal_id: string;
  asset_id: "NativeNear";
  recipient: string;
  amount_atomic: AtomicUnits;
  claim_type:
    | "INVOICE_ISSUED"
    | "SERVICE_CONFIRMED"
    | "OWNER_APPROVED"
    | "DELIVERY_DISPUTED";
  evidence_digest: string;
  verifier_account: string;
  nonce: string;
  issued_at_ns: string;
  expires_at_ns: string;
}
export interface VaultReadClient {
  get_mandate(args: { mandate_id: string }): Promise<VaultMandate | null>;
  get_execution(args: { mandate_id: string; proposal_id: string }): Promise<{
    id: string;
    mandate_id: string;
    recipient: string;
    amount: AtomicUnits;
    evidence_digest: string;
    outcome: VaultOutcome;
  } | null>;
}
export const vaultAvailability = {
  status: "NOT_DEPLOYED",
  message:
    "Onchain vault unavailable — not deployed. Funding, payments and onchain controls are unavailable.",
} as const;
