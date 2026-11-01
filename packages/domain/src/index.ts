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
