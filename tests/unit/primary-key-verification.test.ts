import { expect, it } from "vitest";
import {
  createEngine,
  LIFETIME,
  RECIPIENT,
} from "../../scripts/primary-key-verification/core.js";
import {
  createPrimaryVerifier,
  PRIMARY_POLICY,
} from "../../scripts/primary-key-verification/verify.js";
import { harness, proof } from "../fixtures/primary-key.js";

it("issues immutable, unique five-minute CSPRNG challenges with exact purpose and no callback", () => {
  const h = harness();
  const a = h.engine.issue(),
    b = h.engine.issue();
  expect(Object.isFrozen(a)).toBe(true);
  expect(a.nonce).not.toBe(b.nonce);
  expect(a.challengeId).not.toBe(b.challengeId);
  expect(Buffer.from(a.nonce, "base64")).toHaveLength(32);
  expect(Date.parse(a.expiresAt) - Date.parse(a.issuedAt)).toBe(LIFETIME);
  expect(a.recipient).toBe(RECIPIENT);
  expect(a.callback_url).toBe("");
  expect(a.message).toContain(`Nonce (base64, 32 random bytes): ${a.nonce}`);
  expect(a.message).toContain("OFF-CHAIN TEST ONLY.");
  expect(a.message.endsWith("as a transaction.")).toBe(true);
});
it("verifies independent fixture signature once and returns only public evidence", async () => {
  const h = harness(),
    c = h.engine.issue(),
    p = proof(c, h.policy, h.primary);
  const result = await h.engine.verify(p);
  expect(result.status).toBe("PRIMARY_KEY_CONTROL_VERIFIED_AT_FINALIZED_BLOCK");
  expect(result.publicKey).toBe(h.primary.key);
  expect(JSON.stringify(result)).not.toContain(p.signature);
  expect(result).not.toHaveProperty("token");
  expect(result).not.toHaveProperty("session");
  await expect(h.engine.verify(p)).rejects.toThrow("CHALLENGE_UNAVAILABLE");
});
it("fixed production policy cannot be overridden with a fixture FullAccess signer", async () => {
  const h = harness(),
    engine = createPrimaryVerifier(h.fetcher, h.now),
    c = engine.issue();
  expect(c.message).toContain(PRIMARY_POLICY.primary);
  await expect(
    engine.verify(proof(c, PRIMARY_POLICY, h.primary)),
  ).rejects.toThrow("PRIMARY_VERIFICATION_FAILED");
  expect(h.fetcher).not.toHaveBeenCalled();
});
it.each([
  { message: "Sign in instead" },
  { nonce: Array(32).fill(42) },
  { recipient: "https://evil.test" },
  { callback: RECIPIENT },
])("rejects signed challenge substitution %j", async (change) => {
  const h = harness(),
    c = h.engine.issue();
  await expect(
    h.engine.verify(proof(c, h.policy, h.primary, change)),
  ).rejects.toThrow();
  expect(h.fetcher).not.toHaveBeenCalled();
});
it.each([
  "testing",
  "forged-claim",
  "wrong-account",
  "network",
  "malformed",
  "extra",
  "unknown",
  "bad-key",
])("rejects %s and closes known challenge", async (kind) => {
  const h = harness(),
    c = h.engine.issue();
  const valid = proof(c, h.policy, h.primary);
  const p: Record<string, unknown> =
    kind === "testing" || kind === "forged-claim"
      ? proof(c, h.policy, h.testing)
      : { ...valid };
  if (kind === "forged-claim") p.publicKey = h.primary.key;
  if (kind === "wrong-account") p.accountId = "other.testnet";
  if (kind === "network") p.network = "mainnet";
  if (kind === "malformed") p.signature = "bad";
  if (kind === "extra") p.nonce = c.nonce;
  if (kind === "unknown") p.challengeId = "unknown";
  if (kind === "bad-key") p.publicKey = "ed25519:invalid";
  await expect(h.engine.verify(p)).rejects.toThrow();
  expect(h.fetcher).not.toHaveBeenCalled();
  if (kind !== "unknown")
    await expect(h.engine.verify(valid)).rejects.toThrow(
      "CHALLENGE_UNAVAILABLE",
    );
});
it.each([LIFETIME, LIFETIME + 1, -1])(
  "rejects expiry or clock rollback %s",
  async (ms) => {
    const h = harness(),
      c = h.engine.issue();
    h.advance(ms);
    await expect(
      h.engine.verify(proof(c, h.policy, h.primary)),
    ).rejects.toThrow();
    expect(h.fetcher).not.toHaveBeenCalled();
  },
);
it("accepts just before expiry and closes cancelled/state-lost challenges", async () => {
  const h = harness(),
    c = h.engine.issue();
  h.advance(LIFETIME - 1);
  await expect(
    h.engine.verify(proof(c, h.policy, h.primary)),
  ).resolves.toBeDefined();
  const d = h.engine.issue();
  h.engine.cancel(d.challengeId);
  await expect(
    h.engine.verify(proof(d, h.policy, h.primary)),
  ).rejects.toThrow();
  const other = createEngine(h.policy, h.fetcher, h.now);
  await expect(other.verify(proof(c, h.policy, h.primary))).rejects.toThrow();
});
it("claims before await so concurrent replay has exactly one winner", async () => {
  const h = harness(),
    c = h.engine.issue(),
    p = proof(c, h.policy, h.primary);
  const results = await Promise.allSettled([
    h.engine.verify(p),
    h.engine.verify(p),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("bounds local state without evicting replay tombstones", () => {
  const h = harness();
  for (let i = 0; i < 128; i++) h.engine.issue();
  expect(() => h.engine.issue()).toThrow("STATE_FULL");
});

it("binds purpose, network, expected key, timestamps and challenge ID inside the signature", async () => {
  for (const [from, to] of [
    ["Purpose: Verify", "Purpose: Authorize"],
    ["Network: testnet", "Network: mainnet"],
    ["Challenge ID: ", "Other challenge: "],
    ["Expires at: ", "Different expiry: "],
    ["Expected signing key:", "Alternative signing key:"],
  ]) {
    const h = harness(),
      c = h.engine.issue();
    await expect(
      h.engine.verify(
        proof(c, h.policy, h.primary, {
          message: c.message.replace(from as string, to as string),
        }),
      ),
    ).rejects.toThrow();
    expect(h.fetcher).not.toHaveBeenCalled();
  }
});
it("rejects cross-challenge signature reuse and malformed proof containers", async () => {
  const h = harness(),
    a = h.engine.issue(),
    b = h.engine.issue();
  const p = proof(a, h.policy, h.primary);
  await expect(
    h.engine.verify({ ...p, challengeId: b.challengeId }),
  ).rejects.toThrow();
  for (const invalid of [null, undefined, [], "proof", {}])
    await expect(h.engine.verify(invalid)).rejects.toThrow();
  await expect(h.engine.verify(p)).resolves.toBeDefined();
});

it("matches the exact fully rendered challenge specimen reviewed in the runbook", async () => {
  const { readFile } = await import("node:fs/promises");
  const { render } = await import(
    "../../scripts/primary-key-verification/core.js"
  );
  const doc = await readFile(
    "docs/runbooks/security/WALLET_ACCEPTANCE.md",
    "utf8",
  );
  const section = doc.split(
    "### Fully rendered review specimen — not an issued challenge",
  )[1];
  const specimen = section?.split("```text\n")[1]?.split("\n```")[0];
  expect(specimen).toBe(
    render(
      PRIMARY_POLICY,
      "00000000-0000-4000-8000-000000000001",
      Buffer.alloc(32, 17).toString("base64"),
      "2026-11-07T00:00:00.000Z",
      "2026-11-07T00:05:00.000Z",
    ),
  );
});
