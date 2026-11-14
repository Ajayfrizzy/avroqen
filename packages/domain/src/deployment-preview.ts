import { createHash } from "node:crypto";
import { z } from "zod";

export const ACCOUNT = "avroqen-vault.testnet";
export const SHA256 =
  "b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48";
export const PRIMARY_KEY =
  "ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz";
export const PUBLIC_KEY =
  "ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G";
export const INIT = '{"network":"testnet"}';
export const BYTES = 366735;
export const fingerprint = (key: string, permission: unknown) =>
  createHash("sha256")
    .update(`${key}:${JSON.stringify(permission)}`)
    .digest("hex");
const amount = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,38})$/)
  .refine((v) => BigInt(v) <= (1n << 128n) - 1n);
const candidateSchema = z.strictObject({
  phase: z.literal("DEPLOYMENT"),
  publicKey: z.literal(PUBLIC_KEY),
  network: z.literal("testnet"),
  signerId: z.literal(ACCOUNT),
  receiverId: z.literal(ACCOUNT),
  actions: z.tuple([
    z.strictObject({
      type: z.literal("DeployContract"),
      params: z.strictObject({ code: z.instanceof(Uint8Array) }),
    }),
    z.strictObject({
      type: z.literal("FunctionCall"),
      params: z.strictObject({
        methodName: z.literal("new"),
        args: z.literal(INIT),
        gas: z.literal("100000000000000"),
        deposit: z.literal("0"),
      }),
    }),
  ]),
});
export function candidate(wasm: Uint8Array) {
  return {
    phase: "DEPLOYMENT",
    publicKey: PUBLIC_KEY,
    network: "testnet",
    signerId: ACCOUNT,
    receiverId: ACCOUNT,
    actions: [
      { type: "DeployContract", params: { code: Uint8Array.from(wasm) } },
      {
        type: "FunctionCall",
        params: {
          methodName: "new",
          args: INIT,
          gas: "100000000000000",
          deposit: "0",
        },
      },
    ],
  };
}
export function validateCandidate(input: unknown) {
  const value = candidateSchema.parse(input);
  const code = value.actions[0].params.code;
  if (
    code.length !== BYTES ||
    createHash("sha256").update(code).digest("hex") !== SHA256
  )
    throw new Error("ARTIFACT_MISMATCH");
  return value;
}
const observationSchema = z.object({
  observedAtUtc: z.iso.datetime(),
  network: z.literal("testnet"),
  accountId: z.literal(ACCOUNT),
  finality: z.literal("final"),
  block: z.object({
    hash: z.string().min(32).max(44),
    height: z.number().int().positive(),
    timestampNanosec: z.string().regex(/^[0-9]+$/),
  }),
  account: z.object({
    amount,
    locked: z.literal("0"),
    storage_usage: z.number().int().nonnegative().max(1000000),
    block_hash: z.string(),
    block_height: z.number().int(),
    code_hash: z.string().min(32).max(44),
  }),
  keys: z
    .array(
      z.object({
        publicKey: z.string(),
        permission: z.literal("FullAccess"),
      }),
    )
    .min(1)
    .max(2),
  // Changed parameters need a new cost review, not automatic extrapolation.
  protocolVersion: z.literal(88),
  storageAmountPerByte: z.literal("10000000000000000000"),
  gasPrice: z.literal("100000000"),
});
export type KeyPhase = "DEPLOYMENT" | "POST_REVOCATION";
// Post-revocation validates account/key state only, never deployment receipts or solvency.
export function validateKeyPhase(
  rawObservation: unknown,
  phase: KeyPhase,
  nowMs = Date.now(),
) {
  const o = observationSchema.parse(rawObservation);
  if (phase !== "DEPLOYMENT" && phase !== "POST_REVOCATION")
    throw new Error("INVALID_KEY_PHASE");
  const expected =
    phase === "DEPLOYMENT" ? [PRIMARY_KEY, PUBLIC_KEY] : [PRIMARY_KEY];
  const actual = o.keys.map((k) => k.publicKey);
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== expected.length ||
    expected.some((k) => !actual.includes(k))
  )
    throw new Error("KEY_PHASE_MISMATCH");
  if (
    o.account.block_hash !== o.block.hash ||
    o.account.block_height !== o.block.height
  )
    throw new Error("BLOCK_MISMATCH");
  if (!Number.isSafeInteger(nowMs)) throw new Error("INVALID_CLOCK");
  const blockAge = BigInt(nowMs) - BigInt(o.block.timestampNanosec) / 1000000n;
  const observedAge = nowMs - Date.parse(o.observedAtUtc);
  if (
    blockAge < -5000n ||
    blockAge > 120000n ||
    observedAge < -5000 ||
    observedAge > 120000
  )
    throw new Error("STALE_OBSERVATION");
  return o;
}
export function inspect(
  input: unknown,
  rawObservation: unknown,
  mode: "LIVE" | "HISTORICAL" = "LIVE",
) {
  const tx = validateCandidate(input);
  if (mode !== "LIVE" && mode !== "HISTORICAL")
    throw new Error("INVALID_INSPECTION_MODE");
  const parsed = observationSchema.parse(rawObservation);
  const o = validateKeyPhase(
    parsed,
    "DEPLOYMENT",
    mode === "LIVE" ? Date.now() : Date.parse(parsed.observedAtUtc),
  );
  if (o.account.code_hash !== "11111111111111111111111111111111")
    throw new Error("ALREADY_DEPLOYED");
  const backing =
    BigInt(o.account.storage_usage + BYTES + 351) *
    BigInt(o.storageAmountPerByte);
  const reserve = 100000000000000000000000n;
  const gasCeiling = 30000000000000000000000n;
  const margin = 200000000000000000000000n;
  const minimum = backing + reserve + gasCeiling + margin;
  if (BigInt(o.account.amount) < minimum)
    throw new Error("INSUFFICIENT_BACKING");
  return {
    authorization: "NONE_PREVIEW_ONLY",
    phase: tx.phase,
    observationMode: mode,
    financialOperationsEnabled: false,
    compatibility: "BLOCKED_WALLET_REVIEW_UNVERIFIED",
    network: tx.network,
    signerId: tx.signerId,
    receiverId: tx.receiverId,
    actions: [
      { type: "DeployContract", bytes: BYTES, sha256: SHA256 },
      {
        type: "FunctionCall",
        methodName: "new",
        argsUtf8: INIT,
        argsBytes: Buffer.byteLength(INIT),
        argsBase64: Buffer.from(INIT).toString("base64"),
        gas: "100000000000000",
        deposit: "0",
      },
    ],
    publicKey: PUBLIC_KEY,
    keyPermission: "FullAccess",
    permissionFingerprint: fingerprint(PUBLIC_KEY, "FullAccess"),
    observation: o,
    storageBackingAtomic: backing.toString(),
    protocolReserveAtomic: reserve.toString(),
    gasCeilingAtomic: gasCeiling.toString(),
    safetyMarginAtomic: margin.toString(),
    minimumBackingAtomic: minimum.toString(),
    headroomAfterMarginAtomic: (BigInt(o.account.amount) - minimum).toString(),
    nonce: "NOT_PREPARED",
    blockHashForSigning: "NOT_PREPARED",
    walletInvocation: "NOT_AVAILABLE",
  };
}
