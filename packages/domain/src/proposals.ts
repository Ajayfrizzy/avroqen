import { z } from "zod";
import {
  atomicAmount,
  identityNetwork,
  independentVerifierPolicy,
  type MandatePolicy,
  nearAccount,
} from "./index";

export const proposalInput = z.strictObject({
  schemaVersion: z.literal(1),
  proposalId: z.uuid(),
  idempotencyKey: z.uuid(),
  organizationId: z.uuid(),
  agentId: z.uuid(),
  agentAccount: nearAccount,
  mandateId: z.uuid(),
  policyVersion: z.literal(1),
  policyDigest: z.string().regex(/^[0-9a-f]{64}$/),
  network: identityNetwork,
  vaultAccount: nearAccount,
  recipient: nearAccount,
  asset: z.literal("NativeNear"),
  amountAtomic: atomicAmount.refine(
    (v) => /^(0|[1-9][0-9]*)$/.test(v) && v.length <= 39 && BigInt(v) > 0n,
  ),
  evidenceDigest: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ProposalInput = z.infer<typeof proposalInput>;
export function canonicalProposal(input: ProposalInput) {
  return JSON.stringify(proposalInput.parse(input));
}
export function preflight(
  input: unknown,
  policy: MandatePolicy,
  digest: string,
  nowNs: bigint,
) {
  const parsed = proposalInput.safeParse(input);
  if (!parsed.success)
    return { accepted: false as const, code: "INVALID_PROPOSAL" };
  const p = parsed.data;
  for (const field of [
    "organizationId",
    "agentId",
    "agentAccount",
    "mandateId",
    "policyVersion",
    "network",
    "vaultAccount",
  ] as const) {
    if (p[field] !== policy[field])
      return { accepted: false as const, code: "SCOPE_MISMATCH" };
  }
  if (p.policyDigest !== digest)
    return { accepted: false as const, code: "SCOPE_MISMATCH" };
  if (p.recipient !== policy.recipient)
    return { accepted: false as const, code: "RECIPIENT_DENIED" };
  if (BigInt(policy.expiresAtNs) <= nowNs)
    return { accepted: false as const, code: "MANDATE_EXPIRED" };
  if (BigInt(p.amountAtomic) > BigInt(policy.maxPerPaymentAtomic))
    return { accepted: false as const, code: "PER_PAYMENT_LIMIT" };
  if (!independentVerifierPolicy(policy).eligible)
    return { accepted: false as const, code: "UNSAFE_VERIFIER_POLICY" };
  return {
    accepted: true as const,
    code: "PREFLIGHT_ACCEPTED",
    advisoryOnly: true as const,
  };
}
/** Arguments only. No signer, transport, method selection or claim of chain acceptance. */
export function toVaultProposal(input: ProposalInput) {
  const p = proposalInput.parse(input);
  return {
    mandate_id: p.mandateId,
    proposal_id: p.proposalId,
    recipient: p.recipient,
    amount: p.amountAtomic,
    evidence_digest: p.evidenceDigest,
  };
}

export const credentialIssueInput = z.strictObject({
  purpose: z.enum(["demo", "operator"]),
  rotateId: z.uuid().optional(),
});
export const credentialRevokeInput = z.strictObject({ credentialId: z.uuid() });
