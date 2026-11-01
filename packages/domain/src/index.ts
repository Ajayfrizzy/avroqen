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
