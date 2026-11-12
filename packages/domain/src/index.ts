import { z } from "zod";

const U128_MAX = (1n << 128n) - 1n;
export const atomicAmount = z
  .string()
  .max(39)
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine(
    (value) =>
      /^(0|[1-9][0-9]*)$/.test(value) &&
      value.length <= 39 &&
      BigInt(value) <= U128_MAX,
    "Invalid atomic amount",
  );
const port = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65535));
const apiConfig = z.object({
  host: z.enum(["127.0.0.1", "0.0.0.0"]),
  port,
  database: z.object({
    host: z.string().min(1),
    port,
    user: z.string().min(1),
    password: z
      .string()
      .min(1)
      .refine((value) => value !== "REPLACE_WITH_LOCAL_ONLY_PASSWORD"),
    database: z.string().min(1),
  }),
});
export function readApiConfig(env: Record<string, string | undefined>) {
  const result = apiConfig.safeParse({
    host: env.HOST ?? "127.0.0.1",
    port: env.PORT ?? "3001",
    database: {
      host: env.PGHOST,
      port: env.PGPORT ?? "5432",
      user: env.PGUSER,
      password: env.PGPASSWORD,
      database: env.PGDATABASE,
    },
  });
  if (!result.success) throw new Error("Invalid API configuration");
  return result.data;
}

export const nearAccount = z
  .string()
  .min(2)
  .max(64)
  .regex(/^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$/);
export const identityNetwork = z.enum(["testnet", "mainnet"]);
export const challengeInput = z.strictObject({
  accountId: nearAccount,
  network: identityNetwork,
});
export const verifyInput = challengeInput.extend({
  challengeId: z.uuid(),
  publicKey: z.string().max(64),
  signature: z.string().max(100),
});
export const organizationInput = z.strictObject({
  name: z.string().trim().min(1).max(80),
});
export const agentInput = organizationInput.extend({ accountId: nearAccount });
export const organizationParams = z.strictObject({ orgId: z.uuid() });
export const agentParams = organizationParams.extend({ agentId: z.uuid() });
export const listInput = z.strictObject({
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

// M2 application consent only. These schemas never authorize onchain spending.
const positiveAtomic = atomicAmount.refine(
  (v) => /^[0-9]+$/.test(v) && BigInt(v) > 0n,
);
export const nanoseconds = z
  .string()
  .max(20)
  .regex(/^[1-9][0-9]*$/)
  .refine(
    (v) =>
      /^[1-9][0-9]*$/.test(v) &&
      v.length <= 20 &&
      BigInt(v) <= (1n << 64n) - 1n,
  );
export const verifierPolicyInput = z
  .strictObject({
    version: z.literal(1),
    accounts: z
      .array(nearAccount)
      .min(1)
      .max(16)
      .refine((v) => new Set(v).size === v.length)
      .transform((v) => [...v].sort()),
    threshold: z.number().int().min(1).max(16),
    requiredClaims: z
      .array(z.enum(["INVOICE_ISSUED", "SERVICE_CONFIRMED"]))
      .min(1)
      .max(2)
      .refine((v) => new Set(v).size === v.length)
      .transform((v) => [...v].sort()),
    requireOwnerApproval: z.boolean(),
  })
  .refine((v) => v.threshold <= v.accounts.length);
const mandateTerms = {
  vaultAccount: nearAccount,
  agentId: z.uuid(),
  recipient: nearAccount,
  asset: z.literal("NativeNear"),
  taskReference: z
    .string()
    .min(1)
    .max(160)
    .refine((v) =>
      [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    ),
  maxPerPaymentAtomic: positiveAtomic,
  totalBudgetAtomic: positiveAtomic,
  expiresAtNs: nanoseconds,
  maxExecutions: z.number().int().min(1).max(4294967295),
  verifierPolicy: verifierPolicyInput,
};
const withinBudget = (p: {
  maxPerPaymentAtomic: string;
  totalBudgetAtomic: string;
}) =>
  /^[0-9]+$/.test(p.maxPerPaymentAtomic) &&
  /^[0-9]+$/.test(p.totalBudgetAtomic) &&
  BigInt(p.maxPerPaymentAtomic) <= BigInt(p.totalBudgetAtomic);
export const mandateDraftInput = z
  .strictObject(mandateTerms)
  .refine(withinBudget);
export const mandatePolicy = z
  .strictObject({
    schemaVersion: z.literal(1),
    policyVersion: z.literal(1),
    mandateId: z.uuid(),
    organizationId: z.uuid(),
    ownerAccount: nearAccount,
    network: identityNetwork,
    agentAccount: nearAccount,
    ...mandateTerms,
  })
  .refine(withinBudget);
export type MandatePolicy = z.infer<typeof mandatePolicy>;
export const verifierConflictRoles = [
  "OWNER",
  "AGENT",
  "RECIPIENT",
  "VAULT",
] as const;
export type VerifierConflictRole = (typeof verifierConflictRoles)[number];
export type IndependentVerifierPolicy =
  | { eligible: true; conflict: null }
  | { eligible: false; conflict: VerifierConflictRole };
export function independentVerifierPolicy(
  policy: Pick<
    MandatePolicy,
    | "ownerAccount"
    | "agentAccount"
    | "recipient"
    | "vaultAccount"
    | "verifierPolicy"
  >,
): IndependentVerifierPolicy {
  const roles: readonly [VerifierConflictRole, string][] = [
    ["OWNER", policy.ownerAccount],
    ["AGENT", policy.agentAccount],
    ["RECIPIENT", policy.recipient],
    ["VAULT", policy.vaultAccount],
  ];
  for (const [conflict, account] of roles)
    if (policy.verifierPolicy.accounts.includes(account))
      return { eligible: false, conflict };
  return { eligible: true, conflict: null };
}
export function requireIndependentVerifierPolicy(
  policy: Parameters<typeof independentVerifierPolicy>[0],
) {
  const status = independentVerifierPolicy(policy);
  if (!status.eligible)
    throw new Error(`VERIFIER_ROLE_CONFLICT_${status.conflict}`);
  return policy;
}
export const mandateParams = organizationParams.extend({ mandateId: z.uuid() });
export const consentAction = z.enum(["APPROVE_CONSENT", "REVOKE_CONSENT"]);
export const consentChallengeInput = z.strictObject({ action: consentAction });
export const consentProofInput = verifyInput.extend({ action: consentAction });
export type ConsentAction = z.infer<typeof consentAction>;
export function canonicalPolicy(value: unknown): string {
  // Zod materializes a new object in schema order, with sorted, unique policy sets.
  return JSON.stringify(mandatePolicy.parse(value));
}
export function nearToAtomic(value: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,24})?$/.test(value) || value.length > 65)
    throw new Error("Invalid NEAR amount");
  const [whole, fraction = ""] = value.split(".");
  return atomicAmount.parse(
    (
      BigInt(whole as string) * 10n ** 24n +
      BigInt(fraction.padEnd(24, "0"))
    ).toString(),
  );
}
export function atomicToNear(value: string): string {
  const v = BigInt(atomicAmount.parse(value));
  const fraction = (v % 10n ** 24n)
    .toString()
    .padStart(24, "0")
    .replace(/0+$/, "");
  return `${v / 10n ** 24n}${fraction ? `.${fraction}` : ""}`;
}
export function consentMessage(input: {
  action: ConsentAction;
  policy: MandatePolicy;
  policyDigest: string;
  challengeId: string;
  origin: string;
  expiresAt: string;
}): string {
  // Some remote wallet versions serialize non-ASCII NEP-413 strings
  // inconsistently. JSON Unicode escapes preserve the exact policy text while
  // making the bytes signed by every wallet implementation unambiguous.
  const policy = canonicalPolicy(input.policy).replace(
    /\P{ASCII}/gu,
    (character) => {
      const point = character.codePointAt(0) as number;
      if (point <= 0xffff) return `\\u${point.toString(16).padStart(4, "0")}`;
      const offset = point - 0x10000;
      return `\\u${(0xd800 + (offset >> 10)).toString(16)}\\u${(
        0xdc00 + (offset & 0x3ff)
      ).toString(16)}`;
    },
  );
  return `Avroqen M2 offchain consent v2\nAction: ${input.action}\nNo transaction. No funds moved. Not onchain MandateVault authorization.\nOrigin: ${input.origin}\nChallenge: ${input.challengeId}\nChallenge expires: ${input.expiresAt}\nPolicy SHA-256: ${input.policyDigest}\nExact immutable policy (JSON Unicode escapes preserve original text):\n${policy}\nQuorum applies to EACH required third-party claim. Owner approval, if required, is a separate per-payment attestation. This consent is not delivery evidence.`;
}
export type MandateView = {
  policy: MandatePolicy;
  policyDigest: string;
  consentStatus:
    | "DRAFT"
    | "CONSENT_APPROVED_OFFCHAIN"
    | "CONSENT_REVOKED_OFFCHAIN";
  onchainStatus: "NOT_SUBMITTED";
  expired: boolean;
  agentDisabled: boolean;
  verifierPolicyStatus: IndependentVerifierPolicy;
};

export * from "./vault";
