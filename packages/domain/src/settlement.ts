import { z } from "zod";
import { type Map1, validateMap1 } from "./evidence";
import {
  atomicAmount,
  canonicalPolicy,
  type MandatePolicy,
  mandatePolicy,
  nearAccount,
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
export const hashReport = z.strictObject({
  hash: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .nullable(),
});
