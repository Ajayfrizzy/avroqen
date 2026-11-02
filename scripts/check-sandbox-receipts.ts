// Invoked only by the local Rust sandbox test. No public network or signing APIs.
import { readFileSync } from "node:fs";
import type { ChainOperation } from "../packages/domain/src/settlement.js";
import {
  receiptSchema,
  transactionResult,
  verifyReceipts,
} from "../services/chain/receipts.js";

const input = JSON.parse(readFileSync(0, "utf8")) as {
  rpc: string;
  hash: string;
  operation: ChainOperation;
  expected: string;
};
const endpoint = new URL(input.rpc);
if (
  !["127.0.0.1", "localhost"].includes(endpoint.hostname) ||
  endpoint.protocol !== "http:"
)
  throw new Error("Local sandbox only");
async function rpc(method: string, params: unknown): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "sandbox-check",
      method,
      params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (body.error) throw new Error(`Sandbox RPC unavailable: ${method}`);
  return body.result;
}
try {
  const tx = transactionResult.parse(
    await rpc("EXPERIMENTAL_tx_status", {
      tx_hash: input.hash,
      sender_account_id: input.operation.signerId,
      wait_until: "FINAL",
    }),
  );
  const receipts = [];
  for (const o of tx.receipts_outcome) {
    const supplied = tx.receipts?.find(
      (r) =>
        typeof r === "object" &&
        r !== null &&
        "receipt_id" in r &&
        r.receipt_id === o.id,
    );
    const parsed = receiptSchema.safeParse(
      supplied ?? (await rpc("EXPERIMENTAL_receipt", { receipt_id: o.id })),
    );
    if (parsed.success) receipts.push(parsed.data);
  }
  const result = (await rpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: input.operation.receiverId,
    method_name: "get_execution",
    args_base64: Buffer.from(JSON.stringify(input.operation.args)).toString(
      "base64",
    ),
  })) as { result: number[] };
  const state = JSON.parse(Buffer.from(result.result).toString("utf8"));
  const verified = verifyReceipts(
    tx,
    input.hash,
    input.operation,
    receipts,
    state,
  );
  if (verified.state !== input.expected)
    throw new Error(
      `Receipt classification: ${verified.state}/${verified.reason}`,
    );
  console.info(
    `Actual local sandbox receipts: ${verified.state}; ${verified.receiptIds.length} finalized receipts verified`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Sandbox receipt verification failed",
  );
  process.exitCode = 1;
}
