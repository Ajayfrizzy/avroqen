import { z } from "zod";
import { evidenceInput } from "../../domain/src/evidence.js";
import { atomicAmount, type MandatePolicy } from "../../domain/src/index.js";
import {
  type ProposalInput,
  preflight,
  proposalInput,
} from "../../domain/src/proposals.js";

export const taskInput = z.strictObject({
  description: z.string().trim().min(1).max(1000),
  amountAtomic: atomicAmount,
  evidenceDigest: z.string().regex(/^[0-9a-f]{64}$/),
  proposalId: z.uuid(),
  idempotencyKey: z.uuid(),
});
export const runtimeTool = z.discriminatedUnion("tool", [
  z.strictObject({
    tool: z.literal("submit_evidence"),
    proposalId: z.uuid(),
    evidence: evidenceInput,
  }),
  z.strictObject({ tool: z.literal("mandate_summary") }),
  z.strictObject({ tool: z.literal("proposal_status"), proposalId: z.uuid() }),
  z.strictObject({ tool: z.literal("prepare"), task: taskInput }),
  z.strictObject({ tool: z.literal("submit"), proposal: proposalInput }),
  z.strictObject({ tool: z.literal("denial_reasons") }),
]);
export const denialReasons: Record<string, string> = {
  INVALID_PROPOSAL:
    "Use a positive exact atomic amount and a SHA-256 evidence digest.",
  SCOPE_MISMATCH: "The proposal does not match this credential's mandate.",
  RECIPIENT_DENIED: "The recipient differs from the immutable mandate.",
  MANDATE_EXPIRED: "The mandate has expired.",
  PER_PAYMENT_LIMIT: "The amount exceeds the per-payment limit.",
  UNSAFE_VERIFIER_POLICY:
    "This historical mandate has a conflicting verifier role and cannot authorize new proposals.",
};
/** The task description is inert data, never instructions or independent evidence. */
export function prepareProposal(
  task: unknown,
  policy: MandatePolicy,
  digest: string,
  nowNs: bigint,
) {
  const t = taskInput.parse(task);
  const proposal: ProposalInput = {
    schemaVersion: 1,
    proposalId: t.proposalId,
    idempotencyKey: t.idempotencyKey,
    organizationId: policy.organizationId,
    agentId: policy.agentId,
    agentAccount: policy.agentAccount,
    mandateId: policy.mandateId,
    policyVersion: policy.policyVersion,
    policyDigest: digest,
    network: policy.network,
    vaultAccount: policy.vaultAccount,
    recipient: policy.recipient,
    asset: policy.asset,
    amountAtomic: t.amountAtomic,
    evidenceDigest: t.evidenceDigest,
  };
  return {
    proposal,
    preflight: preflight(proposal, policy, digest, nowNs),
    evidenceVerified: false as const,
    onchainStatus: "NOT_SUBMITTED" as const,
  };
}
