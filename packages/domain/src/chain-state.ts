import { z } from "zod";
import { atomicAmount, canonicalPolicy, mandatePolicy } from "./index";
export const vaultMandateState = z
  .object({
    policy: mandatePolicy,
    policy_digest: z.string().regex(/^[0-9a-f]{64}$/),
    guardian: z.string().nullable(),
    status: z.enum(["Active", "Paused", "Revoked"]),
    available: atomicAmount,
    reserved: atomicAmount,
    spent: atomicAmount,
    withdrawal_pending: atomicAmount,
    withdrawn: atomicAmount,
    deposited: atomicAmount,
    pending_count: z.number().int().nonnegative(),
    successful_count: z.number().int().nonnegative(),
    proposal_count: z.number().int().nonnegative(),
    storage_limit: atomicAmount,
    storage_used: atomicAmount,
  })
  .refine(
    (m) =>
      BigInt(m.deposited) ===
        BigInt(m.available) +
          BigInt(m.reserved) +
          BigInt(m.spent) +
          BigInt(m.withdrawal_pending) +
          BigInt(m.withdrawn) &&
      BigInt(m.spent) + BigInt(m.reserved) <=
        BigInt(m.policy.totalBudgetAtomic) &&
      m.pending_count + m.successful_count <= m.policy.maxExecutions &&
      BigInt(m.storage_used) <= BigInt(m.storage_limit),
  );
export function boundMandate(raw: unknown, canonical: string, digest: string) {
  const m = vaultMandateState.parse(raw);
  if (canonicalPolicy(m.policy) !== canonical || m.policy_digest !== digest)
    throw new Error("ONCHAIN_POLICY_MISMATCH");
  return m;
}
export const vaultProposalState = z.object({
  id: z.string(),
  mandate_id: z.string(),
  recipient: z.string(),
  amount: atomicAmount,
  evidence_digest: z.string(),
  outcome: z.enum([
    "Proposed",
    "Disputed",
    "Pending",
    "Succeeded",
    "ConfirmedFailed",
  ]),
  attestations: z.array(
    z.object({
      signer: z.string(),
      claim: z.string(),
      expires_at_ns: z.string().regex(/^\d+$/),
    }),
  ),
});
