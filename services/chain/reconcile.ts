import { createHash } from "node:crypto";
import { z } from "zod";
import {
  canonicalPolicy,
  mandatePolicy,
} from "../../packages/domain/src/index.js";
import type {
  ChainOperation,
  IntentState,
} from "../../packages/domain/src/settlement.js";
import {
  matchesOperation,
  receiptSchema,
  transactionResult,
  verifyReceipts,
} from "./receipts.js";
import {
  chainHash,
  type Manifest,
  type NearReader,
  UnknownBlock,
} from "./rpc.js";
export interface Intent {
  id: string;
  canonical_operation: string;
  manifest: Manifest;
  reported_hash: string | null;
  verified_hash: string | null;
  scan_height: string;
  scan_hash: string;
  anchor_height: string;
  anchor_hash: string;
  last_height: string | null;
  last_block_hash: string | null;
  state: IntentState;
  reason: string;
}
export interface Observation {
  state: IntentState;
  reason: string;
  verifiedHash?: string;
  reportedHash?: string;
  receiptIds?: string[];
  height?: number;
  blockHash?: string;
  scanHeight?: number;
  scanHash?: string;
}
export async function observe(
  reader: NearReader,
  intent: Intent,
): Promise<Observation> {
  const op = JSON.parse(intent.canonical_operation) as ChainOperation;
  let hash = intent.reported_hash ?? intent.verified_hash;
  let raw = hash
    ? transactionResult.parse(
        await reader.rpc("EXPERIMENTAL_tx_status", {
          tx_hash: hash,
          sender_account_id: op.signerId,
          wait_until: "NONE",
        }),
      )
    : undefined;
  if (
    raw &&
    (raw.transaction.hash !== hash || !matchesOperation(raw.transaction, op))
  )
    return { state: "UNKNOWN", reason: "TRANSACTION_MISMATCH" };
  const deployment = await reader.deployment(intent.manifest);
  const head = deployment.block;
  if (intent.last_height && head.height < Number(intent.last_height))
    throw new Error("STALE_RPC");
  if (
    intent.last_height &&
    head.height === Number(intent.last_height) &&
    head.hash !== intent.last_block_hash
  )
    throw new Error("CONFLICTING_RPC");
  if (
    intent.last_height &&
    head.height > Number(intent.last_height) &&
    (await reader.block(Number(intent.last_height))).header.hash !==
      intent.last_block_hash
  )
    throw new Error("CONFLICTING_RPC");
  if (!hash) {
    const anchor = await reader.block(intent.scan_hash);
    if (anchor.header.hash !== intent.scan_hash)
      throw new Error("CONFLICTING_SCAN");
    let previous = anchor.header.hash;
    const matches = new Set<string>();
    let scanned = Number(intent.scan_height);
    for (
      let height = scanned + 1;
      height <= Math.min(Number(intent.scan_height) + 12, head.height);
      height++
    ) {
      let b: Awaited<ReturnType<NearReader["block"]>>;
      try {
        b = await reader.block(height);
      } catch (error) {
        if (error instanceof UnknownBlock) {
          scanned = height;
          continue;
        }
        throw error;
      }
      if (b.header.prev_hash !== previous)
        throw new Error("MISSING_BLOCK_HISTORY");
      for (const chunk of b.chunks) {
        const c = await reader.historicalChunk(chunk.chunk_hash);
        if (c.header.height_included !== height) continue;
        for (const tx of c.transactions) {
          if (matchesOperation(tx, op))
            matches.add(z.object({ hash: chainHash }).parse(tx).hash);
        }
      }
      previous = b.header.hash;
      scanned = height;
    }
    if (matches.size > 1)
      return { state: "UNKNOWN", reason: "AMBIGUOUS_TRANSACTIONS" };
    if (matches.size === 0)
      return {
        state: "UNKNOWN",
        reason: "HASH_NOT_RECOVERED",
        scanHeight: scanned,
        scanHash: previous,
      };
    hash = required([...matches][0]);
  }
  raw ??= transactionResult.parse(
    await reader.rpc("EXPERIMENTAL_tx_status", {
      tx_hash: hash,
      sender_account_id: op.signerId,
      wait_until: "NONE",
    }),
  );
  if (raw.transaction.hash !== hash || !matchesOperation(raw.transaction, op))
    return { state: "UNKNOWN", reason: "TRANSACTION_MISMATCH" };
  const inclusion = await reader.block(raw.transaction_outcome.block_hash);
  if (inclusion.header.hash !== raw.transaction_outcome.block_hash)
    throw new Error("CONFLICTING_TRANSACTION_BLOCK");
  if (inclusion.header.height <= Number(intent.anchor_height))
    return { state: "UNKNOWN", reason: "TRANSACTION_PREDATES_INTENT" };
  if (
    (await reader.block(Number(intent.anchor_height))).header.hash !==
    intent.anchor_hash
  )
    throw new Error("CONFLICTING_INTENT_ANCHOR");
  if (raw.final_execution_status !== "FINAL")
    return {
      state: raw.final_execution_status === "NONE" ? "SUBMITTED" : "FINALIZING",
      reason: "WAITING_FINALITY",
      reportedHash: hash,
      verifiedHash: hash,
    };
  // Verify historical code at every receipt block as well as the current head.
  const hashes = [
    ...new Set([
      raw.transaction_outcome.block_hash,
      ...raw.receipts_outcome.map((r) => r.block_hash),
    ]),
  ];
  for (const block of hashes) {
    const d = await reader.deployment(intent.manifest, block);
    if (d.block.height > head.height) throw new Error("NOT_FINALIZED");
    if ((await reader.block(d.block.height)).header.hash !== block)
      throw new Error("CONFLICTING_RECEIPT_BLOCK");
  }
  const bodies = [];
  for (const o of raw.receipts_outcome) {
    const supplied = raw.receipts?.find(
      (r) =>
        typeof r === "object" &&
        r !== null &&
        "receipt_id" in r &&
        r.receipt_id === o.id,
    );
    const body = receiptSchema.safeParse(
      supplied ??
        (await reader.rpc("EXPERIMENTAL_receipt", { receipt_id: o.id })),
    );
    // Refund/data receipts need no Action body; financial callback bodies must be present.
    if (body.success) {
      if (body.data.receipt_id !== o.id) throw new Error("RECEIPT_ID_MISMATCH");
      bodies.push(body.data);
    }
  }
  const preliminary = verifyReceipts(raw, hash, op, bodies);
  if (preliminary.state === "CONFIRMED_FAILED")
    return {
      ...preliminary,
      verifiedHash: hash,
      reportedHash: hash,
      height: head.height,
      blockHash: head.hash,
    };
  let state: unknown;
  if (op.kind === "EXECUTE")
    state = await reader.view(
      op.receiverId,
      "get_execution",
      op.args,
      head.hash,
    );
  if (op.kind === "WITHDRAW" || op.kind === "WITHDRAW_STORAGE") {
    const callbacks = bodies
      .flatMap((b) => b.receipt.Action.actions)
      .filter((a) => typeof a === "object" && a !== null && "FunctionCall" in a)
      .map(
        (a) =>
          z
            .object({
              FunctionCall: z.object({
                method_name: z.string(),
                args: z.string(),
              }),
            })
            .parse(a).FunctionCall,
      )
      .filter((a) => a.method_name === "on_withdrawal_result");
    if (callbacks.length === 1) {
      const args = z
        .strictObject({ withdrawal_id: z.string().regex(/^\d+$/) })
        .parse(
          JSON.parse(
            Buffer.from(required(callbacks[0]).args, "base64").toString("utf8"),
          ),
        );
      state = await reader.view(
        op.receiverId,
        "get_withdrawal",
        args,
        head.hash,
      );
    }
  }
  if (
    op.kind !== "REGISTER" &&
    op.kind !== "STORAGE_DEPOSIT" &&
    op.kind !== "WITHDRAW_STORAGE"
  ) {
    const mandate = z
      .object({ policy: z.unknown(), policy_digest: z.string() })
      .parse(
        await reader.view(
          op.receiverId,
          "get_mandate",
          { mandate_id: op.mandateId },
          head.hash,
        ),
      );
    if (
      mandate.policy_digest !== op.policyDigest ||
      mandatePolicy.parse(mandate.policy).mandateId !== op.mandateId
    )
      throw new Error("ONCHAIN_POLICY_MISMATCH");
    // Canonicalization also validates every policy field rather than trusting a loose view shape.
    if (
      createHash("sha256")
        .update(canonicalPolicy(mandate.policy))
        .digest("hex") !== op.policyDigest
    )
      throw new Error("ONCHAIN_POLICY_MISMATCH");
  }
  const result = verifyReceipts(raw, hash, op, bodies, state);
  return {
    ...result,
    verifiedHash: hash,
    reportedHash: hash,
    height: head.height,
    blockHash: head.hash,
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Required evidence missing");
  return value;
}
