import { z } from "zod";
import {
  atomicAmount,
  identityNetwork,
  independentVerifierPolicy,
  type MandatePolicy,
  nanoseconds,
  nearAccount,
  verifyInput,
} from "./index";
import { type ProposalInput, preflight, proposalInput } from "./proposals";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const ref = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9 ._@()-]*$/);
const uuid = z.uuid().refine((v) => v === v.toLowerCase());
export const evidenceParams = z.strictObject({ proposalId: uuid });
export const evidenceInput = z.strictObject({
  sourceType: z.literal("HUMAN_REVIEW"),
  issuer: ref,
  reference: ref,
  evidenceDigest: digest,
  mediaType: z.enum([
    "application/pdf",
    "text/plain",
    "application/json",
    "image/png",
    "image/jpeg",
  ]),
  byteLength: z.number().int().min(1).max(5242880),
});
export const claimType = z.enum([
  "INVOICE_ISSUED",
  "SERVICE_CONFIRMED",
  "OWNER_APPROVED",
  "DELIVERY_DISPUTED",
]);
export const map1 = z
  .strictObject({
    protocol_version: z.literal(1),
    network_id: identityNetwork,
    vault_account: nearAccount,
    mandate_id: uuid,
    policy_version: z.literal(1),
    proposal_id: uuid,
    asset_id: z.literal("NativeNear"),
    recipient: nearAccount,
    amount_atomic: atomicAmount.refine(
      (v) => /^[1-9][0-9]*$/.test(v) && v.length <= 39 && BigInt(v) > 0n,
    ),
    claim_type: claimType,
    evidence_digest: digest,
    verifier_account: nearAccount,
    nonce: uuid,
    issued_at_ns: nanoseconds,
    expires_at_ns: nanoseconds,
  })
  .refine((v) => BigInt(v.expires_at_ns) > BigInt(v.issued_at_ns));
export type Map1 = z.infer<typeof map1>;
export const observationInput = z.strictObject({
  source: z.enum([
    "AUTHENTICATED_PROVIDER_PORTAL",
    "AUTHENTICATED_ISSUER_COMMUNICATION",
    "LOCAL_EXERCISE",
    "OWNER_DECISION",
  ]),
  issuer: ref,
  reference: ref,
  observedAtNs: nanoseconds,
  event: z.enum([
    "INVOICE_ISSUED",
    "SERVICE_ACTIVATED",
    "SERVICE_FULFILLED",
    "MISSING",
    "UNAVAILABLE",
    "DISPUTED",
    "OWNER_DECISION",
  ]),
  recipient: nearAccount,
  amountAtomic: atomicAmount,
  evidenceDigest: digest,
  independentlyObtained: z.boolean(),
});
export const reviewInput = z.strictObject({
  claim: claimType,
  decision: z.enum(["APPROVE", "REJECT", "UNVERIFIABLE", "PENDING", "DISPUTE"]),
  observation: observationInput,
});
export type ReviewInput = z.infer<typeof reviewInput>;
export const reviewProof = verifyInput;
export function canonicalReview(value: unknown) {
  return JSON.stringify(reviewInput.parse(value));
}
export function allowedReviewer(
  policy: MandatePolicy,
  account: string,
  claim: Map1["claim_type"],
) {
  if (claim === "OWNER_APPROVED")
    return (
      account === policy.ownerAccount &&
      policy.verifierPolicy.requireOwnerApproval
    );
  if (claim === "DELIVERY_DISPUTED" && account === policy.ownerAccount)
    return true;
  if (!independentVerifierPolicy(policy).eligible) return false;
  return (
    policy.verifierPolicy.accounts.includes(account) &&
    (claim === "DELIVERY_DISPUTED" ||
      policy.verifierPolicy.requiredClaims.includes(
        claim as "INVOICE_ISSUED" | "SERVICE_CONFIRMED",
      ))
  );
}
export function assessment(
  input: ReviewInput,
  p: ProposalInput,
  now: bigint,
): string {
  const o = input.observation;
  if (BigInt(o.observedAtNs) > now) return "OBSERVATION_IN_FUTURE";
  if (o.source === "LOCAL_EXERCISE") return "SYNTHETIC_ONLY";
  if (input.decision === "DISPUTE")
    return input.claim === "DELIVERY_DISPUTED" && o.event === "DISPUTED"
      ? "DISPUTED"
      : "CLAIM_MISMATCH";
  if (input.claim === "DELIVERY_DISPUTED") return "CLAIM_MISMATCH";
  if (input.decision === "PENDING") return "PENDING_REVIEW";
  if (input.decision === "UNVERIFIABLE") return "UNVERIFIABLE";
  if (input.decision === "REJECT") return "REJECTED";
  if (o.event === "MISSING" || o.event === "UNAVAILABLE")
    return "SOURCE_UNAVAILABLE";
  if (
    o.evidenceDigest !== p.evidenceDigest ||
    o.recipient !== p.recipient ||
    o.amountAtomic !== p.amountAtomic
  )
    return "EVIDENCE_MISMATCH";
  if (input.claim === "OWNER_APPROVED")
    return o.source === "OWNER_DECISION" && o.event === "OWNER_DECISION"
      ? "VERIFIED"
      : "CLAIM_MISMATCH";
  if (!o.independentlyObtained || o.source === "OWNER_DECISION")
    return "INDEPENDENCE_REQUIRED";
  if (input.claim === "INVOICE_ISSUED" && o.event !== "INVOICE_ISSUED")
    return "CLAIM_MISMATCH";
  if (
    input.claim === "SERVICE_CONFIRMED" &&
    !["SERVICE_ACTIVATED", "SERVICE_FULFILLED"].includes(o.event)
  )
    return "CLAIM_MISMATCH";
  return "VERIFIED";
}
export function map1For(
  p: ProposalInput,
  review: ReviewInput,
  account: string,
  nonce: string,
  issued: bigint,
  expiry: bigint,
): Map1 {
  return map1.parse({
    protocol_version: 1,
    network_id: p.network,
    vault_account: p.vaultAccount,
    mandate_id: p.mandateId,
    policy_version: p.policyVersion,
    proposal_id: p.proposalId,
    asset_id: p.asset,
    recipient: p.recipient,
    amount_atomic: p.amountAtomic,
    claim_type: review.claim,
    evidence_digest: p.evidenceDigest,
    verifier_account: account,
    nonce,
    issued_at_ns: issued.toString(),
    expires_at_ns: expiry.toString(),
  });
}
export function reviewMessage(v: {
  organizationId: string;
  policyDigest: string;
  evidenceId: string;
  submissionDigest: string;
  review: ReviewInput;
  payload: Map1;
  challengeId: string;
  origin: string;
  expiresAt: string;
}) {
  // Keep Meteor's NEP-413 input byte-stable while preserving every exact value.
  // JSON escapes are reversible and avoid remote-wallet Unicode ambiguity.
  const exact = JSON.stringify({
    ...v,
    review: reviewInput.parse(v.review),
    payload: map1.parse(v.payload),
  }).replace(/\P{ASCII}/gu, (character) => {
    const point = character.codePointAt(0) as number;
    if (point <= 0xffff) return `\\u${point.toString(16).padStart(4, "0")}`;
    const offset = point - 0x10000;
    return `\\u${(0xd800 + (offset >> 10)).toString(16)}\\u${(
      0xdc00 + (offset & 0x3ff)
    ).toString(16)}`;
  });
  return `Avroqen M5 human review v2 - OFFCHAIN ONLY. No transaction or payment.\nSource observations are human assertions, not automated provider verification.\n${exact}`;
}
export function validateMap1(
  e: Map1,
  p: ProposalInput,
  policy: MandatePolicy,
  now: bigint,
) {
  const q = proposalInput.parse(p),
    m = map1.parse(e);
  return (
    preflight(q, policy, q.policyDigest, now).accepted &&
    m.network_id === q.network &&
    m.vault_account === q.vaultAccount &&
    m.mandate_id === q.mandateId &&
    m.policy_version === q.policyVersion &&
    m.proposal_id === q.proposalId &&
    m.asset_id === q.asset &&
    m.recipient === q.recipient &&
    m.amount_atomic === q.amountAtomic &&
    m.evidence_digest === q.evidenceDigest &&
    allowedReviewer(policy, m.verifier_account, m.claim_type) &&
    BigInt(m.issued_at_ns) <= now &&
    BigInt(m.expires_at_ns) > now &&
    BigInt(m.expires_at_ns) <= BigInt(policy.expiresAtNs)
  );
}
export function attestationIntent(e: Map1, policy: MandatePolicy) {
  const evidence = map1.parse(e);
  if (!independentVerifierPolicy(policy).eligible)
    throw new Error("UNSAFE_VERIFIER_POLICY");
  return {
    signerId: evidence.verifier_account,
    receiverId: evidence.vault_account,
    methodName: "attest_proposal" as const,
    args: { evidence },
    deposit:
      evidence.claim_type === "OWNER_APPROVED" ||
      (evidence.claim_type === "DELIVERY_DISPUTED" &&
        evidence.verifier_account === policy.ownerAccount)
        ? "1"
        : "0",
    network: evidence.network_id,
    submissionEnabled: false as const,
    deploymentStatus: "NOT_DEPLOYED" as const,
  };
}
export interface ReviewRecord {
  payload: Map1;
  review: ReviewInput;
  status: string;
}
export function readiness(
  policy: MandatePolicy,
  records: ReviewRecord[],
  now: bigint,
) {
  const independent = independentVerifierPolicy(policy).eligible;
  const disputed = records.some((r) => r.status === "DISPUTED");
  const valid = records.filter(
    (r) =>
      independent &&
      r.status === "VERIFIED" &&
      BigInt(r.payload.expires_at_ns) > now &&
      allowedReviewer(policy, r.payload.verifier_account, r.payload.claim_type),
  );
  const claims = policy.verifierPolicy.requiredClaims.map((claim) => ({
    claim,
    required: policy.verifierPolicy.threshold,
    count: new Set(
      valid
        .filter((r) => r.payload.claim_type === claim)
        .map((r) => r.payload.verifier_account),
    ).size,
  }));
  const ownerApproved = valid.some(
    (r) =>
      r.payload.claim_type === "OWNER_APPROVED" &&
      r.payload.verifier_account === policy.ownerAccount,
  );
  return {
    independentVerifierPolicy: independent,
    disputed,
    claims,
    ownerApprovalRequired: policy.verifierPolicy.requireOwnerApproval,
    ownerApproved,
    offchainReady:
      independent &&
      !disputed &&
      claims.every((c) => c.count >= c.required) &&
      (!policy.verifierPolicy.requireOwnerApproval || ownerApproved),
    onchainStatus: "NOT_SUBMITTED" as const,
  };
}
