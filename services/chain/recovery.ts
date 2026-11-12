import { createHash } from "node:crypto";
import { z } from "zod";
import {
  RECOVERY_VALIDITY_BLOCKS,
  type ReplacementEvidence,
  type ReplacementInspection,
  replacementEvidence,
  replacementInspection,
} from "../../packages/domain/src/settlement.js";
import type { Intent } from "./reconcile.js";
import { chainHash, type NearReader } from "./rpc.js";

const permission = z.union([
  z.literal("FullAccess"),
  z.object({
    FunctionCall: z.object({
      allowance: z.string().nullable(),
      receiver_id: z.string(),
      method_names: z.array(z.string()),
    }),
  }),
]);
const keyList = z.object({
  block_hash: chainHash,
  keys: z.array(
    z.object({
      public_key: z.string(),
      access_key: z.object({
        nonce: z.union([z.string(), z.number().int().safe()]),
        permission,
      }),
    }),
  ),
});

function canonicalKeys(value: unknown, blockHash: string) {
  const parsed = keyList.parse(value);
  if (parsed.block_hash !== blockHash) throw new Error("RPC_BLOCK_MISMATCH");
  const keys = parsed.keys
    .map((key) => ({
      publicKey: key.public_key,
      nonce: String(key.access_key.nonce),
      permission: key.access_key.permission,
    }))
    .sort((a, b) => a.publicKey.localeCompare(b.publicKey));
  if (
    keys.length === 0 ||
    new Set(keys.map((key) => key.publicKey)).size !== keys.length
  )
    throw new Error("RECOVERY_SIGNER_KEYS_INVALID");
  return JSON.stringify(keys);
}

export async function inspectReplacementEligibility(
  reader: NearReader,
  intent: Intent,
): Promise<ReplacementInspection> {
  if (intent.reported_hash || intent.verified_hash)
    throw new Error("RECOVERY_HASH_PRESENT");
  const operation = z
    .object({
      kind: z.literal("STORAGE_DEPOSIT"),
      signerId: z.string(),
      receiverId: z.string(),
    })
    .passthrough()
    .parse(JSON.parse(intent.canonical_operation));
  const anchor = await reader.deployment(intent.manifest, intent.anchor_hash);
  if (
    anchor.block.hash !== intent.anchor_hash ||
    anchor.block.height !== Number(intent.anchor_height)
  )
    throw new Error("CONFLICTING_INTENT_ANCHOR");
  const current = await reader.deployment(intent.manifest);
  if (current.block.height < anchor.block.height)
    throw new Error("CONFLICTING_RPC");
  const elapsed = current.block.height - anchor.block.height;
  const base = {
    intentId: intent.id,
    thresholdBlocks: RECOVERY_VALIDITY_BLOCKS,
    anchorHeight: String(anchor.block.height),
    anchorHash: anchor.block.hash,
    currentHeight: String(current.block.height),
    currentHash: current.block.hash,
    elapsedBlocks: String(elapsed),
    remainingBlocks: String(Math.max(0, RECOVERY_VALIDITY_BLOCKS - elapsed)),
  };
  if (elapsed < RECOVERY_VALIDITY_BLOCKS)
    return replacementInspection.parse({
      ...base,
      status: "WAITING_VALIDITY",
      evidence: null,
    });
  const [anchorKeysRaw, currentKeysRaw, anchorCredit, currentCredit] =
    await Promise.all([
      reader.query(
        "view_access_key_list",
        operation.signerId,
        anchor.block.hash,
      ),
      reader.query(
        "view_access_key_list",
        operation.signerId,
        current.block.hash,
      ),
      reader.view(
        operation.receiverId,
        "get_storage_credit",
        { account_id: operation.signerId },
        anchor.block.hash,
      ),
      reader.view(
        operation.receiverId,
        "get_storage_credit",
        { account_id: operation.signerId },
        current.block.hash,
      ),
    ]);
  const anchorKeys = canonicalKeys(anchorKeysRaw, anchor.block.hash);
  const currentKeys = canonicalKeys(currentKeysRaw, current.block.hash);
  if (anchorKeys !== currentKeys)
    return replacementInspection.parse({
      ...base,
      status: "SIGNER_STATE_CHANGED",
      evidence: null,
    });
  if (anchorCredit !== null || currentCredit !== null)
    return replacementInspection.parse({
      ...base,
      status: "STORAGE_CREDIT_CHANGED",
      evidence: null,
    });
  const evidence = replacementEvidence.parse({
    anchorHeight: String(anchor.block.height),
    anchorHash: anchor.block.hash,
    evidenceHeight: String(current.block.height),
    evidenceHash: current.block.hash,
    signerKeysDigest: createHash("sha256").update(anchorKeys).digest("hex"),
    storageCreditAtAnchor: null,
    storageCreditAtEvidence: null,
    validityBlocks: RECOVERY_VALIDITY_BLOCKS,
  });
  return replacementInspection.parse({
    ...base,
    status: "ELIGIBLE",
    evidence,
  });
}

export async function replacementEvidenceFor(
  reader: NearReader,
  intent: Intent,
): Promise<ReplacementEvidence> {
  const inspection = await inspectReplacementEligibility(reader, intent);
  if (inspection.status === "ELIGIBLE" && inspection.evidence)
    return inspection.evidence;
  throw new Error(
    {
      WAITING_VALIDITY: "RECOVERY_VALIDITY_WINDOW_OPEN",
      SIGNER_STATE_CHANGED: "RECOVERY_SIGNER_NONCE_CHANGED",
      STORAGE_CREDIT_CHANGED: "RECOVERY_STORAGE_CREDIT_CHANGED",
      ELIGIBLE: "RECOVERY_EVIDENCE_UNAVAILABLE",
    }[inspection.status],
  );
}
