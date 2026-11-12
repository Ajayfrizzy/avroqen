import { z } from "zod";
import { type Map1, validateMap1 } from "./evidence";
import {
  atomicAmount,
  canonicalPolicy,
  independentVerifierPolicy,
  type MandatePolicy,
  mandatePolicy,
  nearAccount,
  verifyInput,
} from "./index";
import { type ProposalInput, preflight, toVaultProposal } from "./proposals";

const positive = atomicAmount.refine(
  (v) => /^[1-9][0-9]*$/.test(v) && BigInt(v) > 0n,
);
export const operationInput = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("REGISTER"),
    storageLimit: positive,
    guardian: nearAccount.nullable().default(null),
  }),
  ...(["FUND", "STORAGE_DEPOSIT", "WITHDRAW", "WITHDRAW_STORAGE"] as const).map(
    (kind) => z.strictObject({ kind: z.literal(kind), amount: positive }),
  ),
  ...(["PAUSE", "RESUME", "REVOKE"] as const).map((kind) =>
    z.strictObject({ kind: z.literal(kind) }),
  ),
  ...(["PROPOSE", "EXECUTE"] as const).map((kind) =>
    z.strictObject({ kind: z.literal(kind), proposalId: z.uuid() }),
  ),
  z.strictObject({ kind: z.literal("ATTEST"), reviewId: z.uuid() }),
]);
export type OperationInput = z.infer<typeof operationInput>;
export interface ChainOperation {
  network: "testnet";
  signerId: string;
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
  mandateId: string;
  policyDigest: string;
  expectedTransfer?: {
    recipient: string;
    amount: string;
    evidenceDigest: string;
  };
  kind: OperationInput["kind"];
}
export interface OperationContext {
  policy: MandatePolicy;
  policyDigest: string;
  actor: string;
  now: bigint;
  proposal?: ProposalInput;
  evidence?: Map1;
  guardian?: string | null;
}
export function buildOperation(
  input: unknown,
  c: OperationContext,
): ChainOperation {
  const i = operationInput.parse(input),
    p = mandatePolicy.parse(c.policy);
  if (
    p.network !== "testnet" ||
    !nearAccount.safeParse(c.actor).success ||
    !/^[0-9a-f]{64}$/.test(c.policyDigest)
  )
    throw new Error("INVALID_BINDING");
  if (!independentVerifierPolicy(p).eligible)
    throw new Error("UNSAFE_VERIFIER_POLICY");
  const owner = c.actor === p.ownerAccount;
  const emergency = [
    "WITHDRAW",
    "WITHDRAW_STORAGE",
    "PAUSE",
    "REVOKE",
  ].includes(i.kind);
  if (!emergency && BigInt(p.expiresAtNs) <= c.now)
    throw new Error("MANDATE_EXPIRED");
  if (
    i.kind !== "PROPOSE" &&
    i.kind !== "ATTEST" &&
    !(i.kind === "PAUSE" && c.actor === c.guardian) &&
    !owner
  )
    throw new Error("OWNER_REQUIRED");
  const base = {
    network: "testnet" as const,
    signerId: c.actor,
    receiverId: p.vaultAccount,
    gas: "100000000000000",
    deposit: "1",
    mandateId: p.mandateId,
    policyDigest: c.policyDigest,
    kind: i.kind,
  };
  const call = (
    methodName: string,
    args: Record<string, unknown>,
    deposit = "1",
  ) => ({ ...base, methodName, args, deposit });
  const mid = { mandate_id: p.mandateId };
  switch (i.kind) {
    case "REGISTER":
      return call("register_mandate", {
        canonical_policy: canonicalPolicy(p),
        expected_digest: c.policyDigest,
        guardian: i.guardian,
        storage_limit: i.storageLimit,
      });
    case "STORAGE_DEPOSIT":
      return call("storage_deposit", {}, i.amount);
    case "FUND":
      return call("fund_mandate", mid, i.amount);
    case "WITHDRAW":
      return call("withdraw_available", { ...mid, amount: i.amount });
    case "WITHDRAW_STORAGE":
      return call("withdraw_storage_credit", { amount: i.amount });
    case "PAUSE":
      return call("pause_mandate", mid);
    case "RESUME":
      return call("resume_mandate", mid);
    case "REVOKE":
      return call("revoke_mandate", mid);
    case "PROPOSE":
    case "EXECUTE": {
      const q = c.proposal;
      if (
        !q ||
        q.proposalId !== i.proposalId ||
        !preflight(q, p, c.policyDigest, c.now).accepted
      )
        throw new Error("PROPOSAL_BINDING");
      if (i.kind === "PROPOSE") {
        if (c.actor !== p.agentAccount) throw new Error("AGENT_REQUIRED");
        return call("submit_proposal", toVaultProposal(q), "0");
      }
      return {
        ...call("authorize_and_execute", { ...mid, proposal_id: q.proposalId }),
        expectedTransfer: {
          recipient: q.recipient,
          amount: q.amountAtomic,
          evidenceDigest: q.evidenceDigest,
        },
      };
    }
    case "ATTEST": {
      const e = c.evidence,
        q = c.proposal;
      if (
        !e ||
        !q ||
        q.policyDigest !== c.policyDigest ||
        e.verifier_account !== c.actor ||
        !validateMap1(e, q, p, c.now)
      )
        throw new Error("EVIDENCE_BINDING");
      return call(
        "attest_proposal",
        { evidence: e },
        e.claim_type === "OWNER_APPROVED" ||
          (e.claim_type === "DELIVERY_DISPUTED" && owner)
          ? "1"
          : "0",
      );
    }
  }
}
export const intentStates = [
  "PREPARED",
  "AWAITING_WALLET",
  "BROADCAST_REPORTED",
  "SUBMITTED",
  "FINALIZING",
  "UNKNOWN",
  "CONFIRMED_SUCCESS",
  "CONFIRMED_FAILED",
] as const;
export type IntentState = (typeof intentStates)[number];
export const terminal = (s: IntentState) =>
  s === "CONFIRMED_SUCCESS" || s === "CONFIRMED_FAILED";
export const intentInput = z.strictObject({
  idempotencyKey: z.uuid(),
  operation: operationInput,
});
export const chainParams = z.strictObject({
  orgId: z.uuid(),
  mandateId: z.uuid(),
});
export const intentParams = z.strictObject({ intentId: z.uuid() });
const reportedChainHash = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export const walletReport = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("BROADCAST"), hash: reportedChainHash }),
  z.strictObject({ outcome: z.literal("CANCELED"), hash: z.null() }),
  z.strictObject({ outcome: z.literal("SUBMISSION_FAILED"), hash: z.null() }),
  z.strictObject({ outcome: z.literal("UNKNOWN"), hash: z.null() }),
]);
export type WalletReport = z.infer<typeof walletReport>;

export const RECOVERY_VALIDITY_BLOCKS = 90_000;
const recoveryChainHash = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export const replacementEvidence = z.strictObject({
  anchorHeight: z.string().regex(/^[1-9][0-9]*$/),
  anchorHash: recoveryChainHash,
  evidenceHeight: z.string().regex(/^[1-9][0-9]*$/),
  evidenceHash: recoveryChainHash,
  signerKeysDigest: z.string().regex(/^[0-9a-f]{64}$/),
  storageCreditAtAnchor: z.null(),
  storageCreditAtEvidence: z.null(),
  validityBlocks: z.literal(RECOVERY_VALIDITY_BLOCKS),
});
export type ReplacementEvidence = z.infer<typeof replacementEvidence>;
export const replacementInspection = z.strictObject({
  intentId: z.uuid(),
  status: z.enum([
    "WAITING_VALIDITY",
    "SIGNER_STATE_CHANGED",
    "STORAGE_CREDIT_CHANGED",
    "ELIGIBLE",
  ]),
  thresholdBlocks: z.literal(RECOVERY_VALIDITY_BLOCKS),
  anchorHeight: z.string().regex(/^[1-9][0-9]*$/),
  anchorHash: recoveryChainHash,
  currentHeight: z.string().regex(/^[1-9][0-9]*$/),
  currentHash: recoveryChainHash,
  elapsedBlocks: z.string().regex(/^(0|[1-9][0-9]*)$/),
  remainingBlocks: z.string().regex(/^(0|[1-9][0-9]*)$/),
  evidence: replacementEvidence.nullable(),
});
export type ReplacementInspection = z.infer<typeof replacementInspection>;
export const replacementProof = verifyInput.extend({
  action: z.literal("AUTHORIZE_CONTROLLED_REPLACEMENT"),
  replacementIntentId: z.uuid(),
});
export const replacementChallengeInput = z.strictObject({});
export function replacementMessage(input: {
  originalIntentId: string;
  replacementIntentId: string;
  operation: ChainOperation;
  operationDigest: string;
  evidence: ReplacementEvidence;
  challengeId: string;
  origin: string;
  expiresAt: string;
}): string {
  return `Avroqen controlled transaction replacement v1\nAction: AUTHORIZE_CONTROLLED_REPLACEMENT\nOriginal intent: ${input.originalIntentId}\nReplacement intent: ${input.replacementIntentId}\nOriginal outcome remains UNKNOWN. This is not proof of failure or non-broadcast.\nNo transaction is signed or sent by this message. It authorizes one unsigned replacement preparation only; the replacement still requires a separate wallet transaction approval.\nOrigin: ${input.origin}\nChallenge: ${input.challengeId}\nChallenge expires: ${input.expiresAt}\nExact operation SHA-256: ${input.operationDigest}\nExact operation: ${JSON.stringify(input.operation)}\nEvidence anchor: ${input.evidence.anchorHeight} ${input.evidence.anchorHash}\nEvidence head: ${input.evidence.evidenceHeight} ${input.evidence.evidenceHash}\nUnchanged signer-key digest: ${input.evidence.signerKeysDigest}\nStorage credit at anchor: null\nStorage credit at evidence head: null\nRequired validity distance: ${input.evidence.validityBlocks} blocks\nResidual risk: trusted RPC providers may be wrong or malicious. If the original transaction later appears, stop and reconcile both intents; never submit another replacement automatically.`;
}
