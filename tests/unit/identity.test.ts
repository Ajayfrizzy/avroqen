import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { serialize } from "borsh";
import { expect, it } from "vitest";
import { identityConfig } from "../../apps/api/src/identity/config.js";
import {
  fullAccessVerifier,
  messageDigest,
  verifyMessage,
} from "../../apps/api/src/identity/crypto.js";

it("matches independently serialized NEP-413 Borsh with and without callback", () => {
  for (const callback of ["", "https://example.test/callback"]) {
    const value = {
      message: "Sign in only",
      nonce: Buffer.alloc(32, 17),
      recipient: "https://example.test",
      callback_url: callback,
    };
    const bytes = serialize(
      {
        struct: {
          tag: "u32",
          message: "string",
          nonce: { array: { type: "u8", len: 32 } },
          recipient: "string",
          callback: { option: "string" },
        },
      },
      {
        tag: 2147484061,
        message: value.message,
        nonce: [...value.nonce],
        recipient: value.recipient,
        callback: callback || null,
      },
    );
    expect(messageDigest(value)).toEqual(
      createHash("sha256").update(bytes).digest(),
    );
  }
});
it("rejects malformed keys and signatures", () => {
  const value = {
    message: "x",
    nonce: Buffer.alloc(32),
    recipient: "origin",
    callback_url: "",
  };
  const pair = generateKeyPairSync("ed25519");
  expect(
    verifyMessage(
      value,
      "ed25519:invalid",
      sign(null, messageDigest(value), pair.privateKey).toString("base64"),
    ),
  ).toBe(false);
  expect(verifyMessage(value, `ed25519:${"1".repeat(32)}`, "invalid")).toBe(
    false,
  );
});
it("uses fixed network RPC and finalized full-access permission only", async () => {
  for (const permission of [
    "FullAccess",
    { FunctionCall: { receiver_id: "agent.testnet" } },
    null,
  ]) {
    const verifier = fullAccessVerifier("testnet", async (url, options) => {
      expect(url).toBe("https://rpc.testnet.near.org");
      expect(JSON.parse(String(options?.body)).params).toEqual({
        request_type: "view_access_key",
        finality: "final",
        account_id: "alice.testnet",
        public_key: "key",
      });
      return new Response(
        JSON.stringify({ id: "m1-key", result: { permission } }),
      );
    });
    expect(await verifier("alice.testnet", "key")).toBe(
      permission === "FullAccess",
    );
  }
});
it("fails closed on unavailable RPC", async () => {
  await expect(
    fullAccessVerifier(
      "mainnet",
      async () => new Response("unavailable", { status: 503 }),
    )("alice.near", "key"),
  ).rejects.toThrow();
});
it("requires HTTPS except explicit loopback development", () => {
  expect(() => identityConfig({})).toThrow();
  expect(identityConfig({ AUTH_ALLOW_INSECURE_LOCALHOST: "true" }).secure).toBe(
    false,
  );
  expect(() =>
    identityConfig({
      PUBLIC_ORIGIN: "http://example.test",
      AUTH_ALLOW_INSECURE_LOCALHOST: "true",
    }),
  ).toThrow();
  expect(identityConfig({ PUBLIC_ORIGIN: "https://example.test" }).secure).toBe(
    true,
  );
  expect(
    identityConfig({ PUBLIC_ORIGIN: "https://example.test" })
      .testnetSimulationEnabled,
  ).toBe(false);
  expect(
    identityConfig({
      PUBLIC_ORIGIN: "https://example.test",
      NEAR_NETWORK: "testnet",
      M8_TESTNET_SIMULATION_ENABLED: "true",
    }).testnetSimulationEnabled,
  ).toBe(true);
  expect(() =>
    identityConfig({
      PUBLIC_ORIGIN: "https://example.test",
      NEAR_NETWORK: "mainnet",
      M8_TESTNET_SIMULATION_ENABLED: "true",
    }),
  ).toThrow("Testnet simulation requires NEAR Testnet");
  expect(() =>
    identityConfig({
      PUBLIC_ORIGIN: "https://example.test",
      M8_TESTNET_SIMULATION_ENABLED: "yes",
    }),
  ).toThrow("Invalid Testnet simulation configuration");
});

it("rejects missing access keys and malformed or mismatched RPC envelopes", async () => {
  for (const name of ["UNKNOWN_ACCESS_KEY", "UNKNOWN_ACCOUNT"]) {
    const verifier = fullAccessVerifier(
      "testnet",
      async () =>
        new Response(
          JSON.stringify({ id: "m1-key", error: { cause: { name } } }),
        ),
    );
    expect(await verifier("alice.testnet", "key")).toBe(false);
  }
  for (const result of [
    { id: "wrong", result: { permission: "FullAccess" } },
    { id: "m1-key" },
    { id: "m1-key", error: { cause: { name: "INTERNAL_ERROR" } } },
  ]) {
    await expect(
      fullAccessVerifier(
        "testnet",
        async () => new Response(JSON.stringify(result)),
      )("alice.testnet", "key"),
    ).rejects.toThrow();
  }
  await expect(
    fullAccessVerifier("testnet", async () => {
      throw new DOMException("timeout", "TimeoutError");
    })("alice.testnet", "key"),
  ).rejects.toThrow();
});
