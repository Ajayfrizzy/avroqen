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

export const RECOVERY_EVIDENCE_TIMEOUT_MS = 35_000;
export const RECOVERY_IMMUTABLE_CACHE_TTL_MS = 10 * 60_000;
const RECOVERY_IMMUTABLE_CACHE_LIMIT = 32;

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
type AnchorDeployment = { height: number; hash: string };
type AnchorState = {
  keysDigest: string;
  storageCredit: unknown;
};
type CacheEntry<T> = { expiresAt: number; value: T };
type RecoveryCache = {
  deployments: Map<string, CacheEntry<AnchorDeployment>>;
  deploymentInFlight: Map<string, Promise<AnchorDeployment>>;
  states: Map<string, CacheEntry<AnchorState>>;
  stateInFlight: Map<string, Promise<AnchorState>>;
};
const recoveryCaches = new WeakMap<NearReader, RecoveryCache>();

function cacheFor(reader: NearReader): RecoveryCache {
  let cache = recoveryCaches.get(reader);
  if (!cache) {
    cache = {
      deployments: new Map(),
      deploymentInFlight: new Map(),
      states: new Map(),
      stateInFlight: new Map(),
    };
    recoveryCaches.set(reader, cache);
  }
  return cache;
}

async function immutable<T>(
  completed: Map<string, CacheEntry<T>>,
  inFlight: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const cached = completed.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) completed.delete(key);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = load();
  inFlight.set(key, pending);
  try {
    const value = await pending;
    if (completed.size >= RECOVERY_IMMUTABLE_CACHE_LIMIT)
      completed.delete(completed.keys().next().value as string);
    completed.set(key, {
      expiresAt: Date.now() + RECOVERY_IMMUTABLE_CACHE_TTL_MS,
      value,
    });
    return value;
  } finally {
    if (inFlight.get(key) === pending) inFlight.delete(key);
  }
}

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

function anchorBinding(intent: Intent, signerId: string, receiverId: string) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        semantics: "RECOVERY_ANCHOR_V1",
        intentId: intent.id,
        anchorHeight: intent.anchor_height,
        anchorHash: intent.anchor_hash,
        canonicalOperation: intent.canonical_operation,
        manifest: {
          ...intent.manifest,
          keyFingerprints: [...intent.manifest.keyFingerprints].sort(),
        },
        signerId,
        receiverId,
      }),
    )
    .digest("hex");
}

async function immutableAnchorDeployment(
  reader: NearReader,
  intent: Intent,
  binding: string,
  signal: AbortSignal,
  persisted?: ReplacementEvidence,
): Promise<AnchorDeployment> {
  const cache = cacheFor(reader);
  return immutable(
    cache.deployments,
    cache.deploymentInFlight,
    binding,
    async () => {
      if (persisted)
        return {
          height: Number(persisted.anchorHeight),
          hash: persisted.anchorHash,
        };
      const anchor = await reader.deployment(
        intent.manifest,
        intent.anchor_hash,
        signal,
        "interactive",
      );
      if (
        anchor.block.hash !== intent.anchor_hash ||
        anchor.block.height !== Number(intent.anchor_height)
      )
        throw new Error("CONFLICTING_INTENT_ANCHOR");
      return { height: anchor.block.height, hash: anchor.block.hash };
    },
  );
}

async function immutableAnchorState(
  reader: NearReader,
  operation: { signerId: string; receiverId: string },
  binding: string,
  anchor: AnchorDeployment,
  signal: AbortSignal,
  persisted?: ReplacementEvidence,
): Promise<AnchorState> {
  const cache = cacheFor(reader);
  return immutable(cache.states, cache.stateInFlight, binding, async () => {
    if (persisted)
      return {
        keysDigest: persisted.signerKeysDigest,
        storageCredit: persisted.storageCreditAtAnchor,
      };
    const [keysRaw, storageCredit] = await Promise.all([
      reader.query(
        "view_access_key_list",
        operation.signerId,
        anchor.hash,
        {},
        signal,
        "interactive",
      ),
      reader.view(
        operation.receiverId,
        "get_storage_credit",
        { account_id: operation.signerId },
        anchor.hash,
        signal,
        "interactive",
      ),
    ]);
    const keys = canonicalKeys(keysRaw, anchor.hash);
    return {
      keysDigest: createHash("sha256").update(keys).digest("hex"),
      storageCredit,
    };
  });
}

function persistedAnchor(
  intent: Intent,
  value: unknown,
): ReplacementEvidence | undefined {
  if (value === undefined) return undefined;
  let evidence: ReplacementEvidence;
  try {
    evidence = replacementEvidence.parse(value);
  } catch {
    throw new Error("RECOVERY_PERSISTED_EVIDENCE_INVALID");
  }
  let distance: bigint;
  try {
    distance = BigInt(evidence.evidenceHeight) - BigInt(evidence.anchorHeight);
  } catch {
    throw new Error("RECOVERY_PERSISTED_EVIDENCE_INVALID");
  }
  if (
    evidence.anchorHeight !== String(intent.anchor_height) ||
    evidence.anchorHash !== intent.anchor_hash ||
    distance < BigInt(RECOVERY_VALIDITY_BLOCKS)
  )
    throw new Error("RECOVERY_PERSISTED_EVIDENCE_INVALID");
  return evidence;
}

async function inspectReplacementEligibilityWithSignal(
  reader: NearReader,
  intent: Intent,
  signal: AbortSignal,
  persistedEvidence?: unknown,
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
  const binding = anchorBinding(
      intent,
      operation.signerId,
      operation.receiverId,
    ),
    persisted = persistedAnchor(intent, persistedEvidence),
    anchor = await immutableAnchorDeployment(
      reader,
      intent,
      binding,
      signal,
      persisted,
    ),
    current = await reader.deployment(
      intent.manifest,
      undefined,
      signal,
      "interactive",
    );
  if (current.block.height < anchor.height) throw new Error("CONFLICTING_RPC");
  const elapsed = current.block.height - anchor.height;
  const base = {
    intentId: intent.id,
    thresholdBlocks: RECOVERY_VALIDITY_BLOCKS,
    anchorHeight: String(anchor.height),
    anchorHash: anchor.hash,
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
  const [anchorState, currentKeysRaw, currentCredit] = await Promise.all([
    immutableAnchorState(reader, operation, binding, anchor, signal, persisted),
    reader.query(
      "view_access_key_list",
      operation.signerId,
      current.block.hash,
      {},
      signal,
      "interactive",
    ),
    reader.view(
      operation.receiverId,
      "get_storage_credit",
      { account_id: operation.signerId },
      current.block.hash,
      signal,
      "interactive",
    ),
  ]);
  const currentKeys = canonicalKeys(currentKeysRaw, current.block.hash);
  const currentKeysDigest = createHash("sha256")
    .update(currentKeys)
    .digest("hex");
  if (anchorState.keysDigest !== currentKeysDigest)
    return replacementInspection.parse({
      ...base,
      status: "SIGNER_STATE_CHANGED",
      evidence: null,
    });
  if (anchorState.storageCredit !== null || currentCredit !== null)
    return replacementInspection.parse({
      ...base,
      status: "STORAGE_CREDIT_CHANGED",
      evidence: null,
    });
  const evidence = replacementEvidence.parse({
    anchorHeight: String(anchor.height),
    anchorHash: anchor.hash,
    evidenceHeight: String(current.block.height),
    evidenceHash: current.block.hash,
    signerKeysDigest: anchorState.keysDigest,
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

export async function inspectReplacementEligibility(
  reader: NearReader,
  intent: Intent,
  persistedEvidence?: unknown,
): Promise<ReplacementInspection> {
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        new DOMException("Recovery evidence deadline exceeded", "TimeoutError"),
      ),
    RECOVERY_EVIDENCE_TIMEOUT_MS,
  );
  timer.unref();
  try {
    return await inspectReplacementEligibilityWithSignal(
      reader,
      intent,
      deadline.signal,
      persistedEvidence,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function replacementEvidenceFor(
  reader: NearReader,
  intent: Intent,
  persistedEvidence?: unknown,
): Promise<ReplacementEvidence> {
  const inspection = await inspectReplacementEligibility(
    reader,
    intent,
    persistedEvidence,
  );
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
