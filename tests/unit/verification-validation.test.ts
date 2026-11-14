import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { parseVerification } from "../../apps/api/src/identity/validation.js";

const base = {
  accountId: "ajayfrizzy.testnet",
  network: "testnet",
  challengeId: randomUUID(),
  publicKey: `ed25519:${"1".repeat(32)}`,
  signature: Buffer.alloc(64).toString("base64"),
};
it("accepts correctly mapped string fields at schema stage, independently of crypto validity", () => {
  expect(parseVerification(base).success).toBe(true);
});
it("identifies native SDK objects only by allowlisted field and category", () => {
  const result = parseVerification({
    ...base,
    publicKey: { toString: () => base.publicKey },
    signature: new Uint8Array(64),
  });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.issues).toEqual([
      { field: "publicKey", category: "TYPE" },
      { field: "signature", category: "TYPE" },
    ]);
});
it("does not expose values, unknown property names, nested paths or Zod messages", () => {
  const result = parseVerification({
    ...base,
    challengeId: "not-a-uuid",
    network: "wrong-network",
    sensitive_unknown_name: "sensitive-value",
  });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.issues).toEqual([
      { field: "network", category: "FORMAT" },
      { field: "challengeId", category: "FORMAT" },
      { field: "request", category: "UNKNOWN_FIELDS" },
    ]);
});
