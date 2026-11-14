import { z } from "zod";
import type {
  ChainOperation,
  IntentState,
} from "../../packages/domain/src/settlement.js";
import { chainHash } from "./rpc.js";

const action = z.object({
  FunctionCall: z.object({
    method_name: z.string(),
    args: z.string(),
    gas: z.union([z.string(), z.number().int().safe()]),
    deposit: z.string(),
  }),
});
const outcome = z.object({
  id: chainHash,
  block_hash: chainHash,
  outcome: z.object({
    executor_id: z.string(),
    receipt_ids: z.array(chainHash),
    status: z.record(z.string(), z.unknown()),
  }),
});
export const transactionResult = z.object({
  final_execution_status: z.enum([
    "NONE",
    "INCLUDED",
    "EXECUTED_OPTIMISTIC",
    "INCLUDED_FINAL",
    "EXECUTED",
    "FINAL",
  ]),
  transaction: z.object({
    hash: chainHash,
    signer_id: z.string(),
    receiver_id: z.string(),
    actions: z.array(z.unknown()),
  }),
  transaction_outcome: outcome,
  receipts_outcome: z.array(outcome),
  receipts: z.array(z.unknown()).optional(),
});
export type TransactionResult = z.infer<typeof transactionResult>;
export const receiptSchema = z.object({
  receipt_id: chainHash,
  predecessor_id: z.string(),
  receiver_id: z.string(),
  receipt: z.object({
    Action: z.object({
      actions: z.array(z.unknown()),
      input_data_ids: z.array(chainHash),
      output_data_receivers: z.array(
        z.object({ data_id: chainHash, receiver_id: z.string() }),
      ),
    }),
  }),
});
export type Receipt = z.infer<typeof receiptSchema>;
export function matchesOperation(tx: unknown, o: ChainOperation) {
  const t = z
    .object({
      signer_id: z.string(),
      receiver_id: z.string(),
      actions: z.array(z.unknown()),
    })
    .safeParse(tx);
  if (
    !t.success ||
    t.data.signer_id !== o.signerId ||
    t.data.receiver_id !== o.receiverId ||
    t.data.actions.length !== 1
  )
    return false;
  const a = action.safeParse(t.data.actions[0]);
  if (!a.success) return false;
  const f = a.data.FunctionCall;
  return (
    f.method_name === o.methodName &&
    String(f.gas) === o.gas &&
    f.deposit === o.deposit &&
    f.args === Buffer.from(JSON.stringify(o.args)).toString("base64")
  );
}
const success = (status: Record<string, unknown>) =>
  Object.hasOwn(status, "SuccessValue");
const failed = (status: Record<string, unknown>) =>
  Object.hasOwn(status, "Failure");
export interface ReceiptEvidence {
  state: IntentState;
  reason: string;
  receiptIds: string[];
  blockHashes: string[];
  withdrawalId?: string;
}
export function verifyReceipts(
  raw: unknown,
  hash: string,
  operation: ChainOperation,
  bodies: Receipt[],
  contractOutcome?: unknown,
): ReceiptEvidence {
  const t = transactionResult.parse(raw);
  const unknown = (reason: string): ReceiptEvidence => ({
    state: "UNKNOWN",
    reason,
    receiptIds: [],
    blockHashes: [],
  });
  if (
    t.transaction.hash !== hash ||
    t.transaction_outcome.id !== hash ||
    !matchesOperation(t.transaction, operation)
  )
    return unknown("TRANSACTION_MISMATCH");
  if (t.final_execution_status !== "FINAL")
    return {
      state: "FINALIZING",
      reason: "WAITING_FINALITY",
      receiptIds: [],
      blockHashes: [],
    };
  const outcomes = new Map(t.receipts_outcome.map((o) => [o.id, o]));
  if (outcomes.size !== t.receipts_outcome.length)
    return unknown("DUPLICATE_RECEIPT");
  const visited = new Set<string>(),
    queue = [...t.transaction_outcome.outcome.receipt_ids];
  while (queue.length) {
    const id = required(queue.shift());
    if (visited.has(id)) return unknown("REPEATED_RECEIPT");
    visited.add(id);
    const o = outcomes.get(id);
    if (!o) return unknown("MISSING_RECEIPT");
    if (
      !success(o.outcome.status) &&
      !failed(o.outcome.status) &&
      !Object.hasOwn(o.outcome.status, "SuccessReceiptId")
    )
      return unknown("PENDING_RECEIPT");
    queue.push(...o.outcome.receipt_ids);
  }
  if (visited.size !== outcomes.size) return unknown("UNRELATED_RECEIPT");
  const evidence = {
    receiptIds: [...visited],
    blockHashes: [
      ...new Set([
        t.transaction_outcome.block_hash,
        ...t.receipts_outcome.map((v) => v.block_hash),
      ]),
    ],
  };
  const roots = t.transaction_outcome.outcome.receipt_ids.map((id) =>
    required(outcomes.get(id)),
  );
  if (failed(t.transaction_outcome.outcome.status))
    return {
      ...evidence,
      state: "CONFIRMED_FAILED",
      reason: "TRANSACTION_REJECTED",
    };
  const dispatch = roots.filter(
    (v) => v.outcome.executor_id === operation.receiverId,
  );
  if (dispatch.length !== 1) return unknown("DISPATCH_RECEIPT_MISSING");
  const root = required(dispatch[0]);
  if (failed(root.outcome.status))
    return {
      ...evidence,
      state: "CONFIRMED_FAILED",
      reason: "CONTRACT_REJECTED",
    };
  if (!["EXECUTE", "WITHDRAW", "WITHDRAW_STORAGE"].includes(operation.kind)) {
    if (!success(root.outcome.status)) return unknown("DISPATCH_NOT_CONFIRMED");
    return {
      ...evidence,
      state: "CONFIRMED_SUCCESS",
      reason: "CALL_FINALIZED",
    };
  }
  const callbackName =
    operation.kind === "EXECUTE"
      ? "on_settlement_result"
      : "on_withdrawal_result";
  const callbacks = bodies.filter(
    (r) =>
      visited.has(r.receipt_id) &&
      r.predecessor_id === operation.receiverId &&
      r.receiver_id === operation.receiverId &&
      r.receipt.Action.actions.length === 1 &&
      action.safeParse(r.receipt.Action.actions[0]).success &&
      action.parse(r.receipt.Action.actions[0]).FunctionCall.method_name ===
        callbackName,
  );
  if (callbacks.length !== 1) return unknown("CALLBACK_MISSING");
  const cb = required(callbacks[0]),
    co = outcomes.get(cb.receipt_id);
  if (root.outcome.status.SuccessReceiptId !== cb.receipt_id)
    return unknown("CALLBACK_RETURN_MISMATCH");
  if (!co || !success(co.outcome.status)) return unknown("CALLBACK_UNRESOLVED");
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(
      Buffer.from(
        action.parse(cb.receipt.Action.actions[0]).FunctionCall.args,
        "base64",
      ).toString("utf8"),
    );
  } catch {
    return unknown("CALLBACK_BINDING");
  }
  const state = z
    .object({
      outcome: z.enum([
        "Proposed",
        "Disputed",
        "Pending",
        "Succeeded",
        "ConfirmedFailed",
      ]),
      amount: z.string(),
      recipient: z.string().optional(),
      owner: z.string().optional(),
      mandate_id: z.string().nullable(),
      id: z.string(),
      evidence_digest: z.string().optional(),
    })
    .safeParse(contractOutcome);
  if (!state.success) return unknown("CONTRACT_OUTCOME_MISSING");
  const s = state.data;
  if (operation.kind === "EXECUTE") {
    if (
      !operation.expectedTransfer ||
      s.recipient !== operation.expectedTransfer.recipient ||
      s.amount !== operation.expectedTransfer.amount ||
      s.evidence_digest !== operation.expectedTransfer.evidenceDigest ||
      args.mandate_id !== operation.mandateId ||
      args.proposal_id !== operation.args.proposal_id ||
      s.id !== operation.args.proposal_id ||
      s.mandate_id !== operation.mandateId
    )
      return unknown("CALLBACK_BINDING");
  } else if (
    args.withdrawal_id !== s.id ||
    s.owner !== operation.signerId ||
    s.amount !== operation.args.amount ||
    s.mandate_id !==
      (operation.kind === "WITHDRAW" ? operation.mandateId : null)
  )
    return unknown("WITHDRAWAL_BINDING");
  const recipient =
    operation.kind === "EXECUTE" ? s.recipient : operation.signerId;
  const transfers = bodies.filter(
    (r) =>
      visited.has(r.receipt_id) &&
      r.predecessor_id === operation.receiverId &&
      r.receiver_id === recipient &&
      r.receipt.Action.actions.length === 1 &&
      z
        .object({ Transfer: z.object({ deposit: z.literal(s.amount) }) })
        .safeParse(r.receipt.Action.actions[0]).success &&
      r.receipt.Action.output_data_receivers.some(
        (d) =>
          d.receiver_id === operation.receiverId &&
          cb.receipt.Action.input_data_ids.includes(d.data_id),
      ),
  );
  if (transfers.length !== 1) return unknown("TRANSFER_RECEIPT_MISSING");
  const transfer = outcomes.get(required(transfers[0]).receipt_id);
  const callbackValue = co.outcome.status.SuccessValue;
  if (
    s.outcome === "Succeeded" &&
    transfer &&
    success(transfer.outcome.status) &&
    callbackValue === Buffer.from("true").toString("base64")
  )
    return {
      ...evidence,
      state: "CONFIRMED_SUCCESS",
      reason: "TRANSFER_AND_CALLBACK_FINALIZED",
      ...(operation.kind === "EXECUTE" ? {} : { withdrawalId: s.id }),
    };
  if (
    s.outcome === "ConfirmedFailed" &&
    transfer &&
    failed(transfer.outcome.status) &&
    callbackValue === Buffer.from("false").toString("base64")
  )
    return {
      ...evidence,
      state: "CONFIRMED_FAILED",
      reason: "TRANSFER_DEFINITIVELY_FAILED",
    };
  return unknown("OUTCOME_QUARANTINED");
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Required evidence missing");
  return value;
}
