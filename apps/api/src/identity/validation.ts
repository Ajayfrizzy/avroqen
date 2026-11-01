import { verifyInput } from "@avroqen/domain";

const fields = new Set([
  "accountId",
  "network",
  "challengeId",
  "publicKey",
  "signature",
]);
export function parseVerification(value: unknown) {
  const parsed = verifyInput.safeParse(value);
  if (parsed.success) return { success: true as const, data: parsed.data };
  // Never retain Zod errors/messages, input values, unknown property names or paths.
  const issues = parsed.error.issues.map((issue) => ({
    field:
      typeof issue.path[0] === "string" && fields.has(issue.path[0])
        ? issue.path[0]
        : "request",
    category:
      issue.code === "invalid_type"
        ? "TYPE"
        : issue.code === "too_big" || issue.code === "too_small"
          ? "LENGTH"
          : issue.code === "unrecognized_keys"
            ? "UNKNOWN_FIELDS"
            : "FORMAT",
  }));
  return { success: false as const, issues };
}
