import { expect, it, vi } from "vitest";
import { signChallenge } from "../../apps/web/app/workspace/wallet.js";

const fixtures = vi.hoisted(() => ({
  createAction: vi.fn(),
  initialize: vi.fn(),
  setLoggingLevel: vi.fn(),
  prompt: vi.fn(),
}));
vi.mock("../../apps/web/app/workspace/wallet-sdk", () => ({
  loadConnector: async () =>
    new (class {
      initialize = fixtures.initialize;
      setLoggingLevel = fixtures.setLoggingLevel;
      createAction = fixtures.createAction;
    })(),
}));
it("wallet connector requests only NEP-413 signing and refuses key custody", async () => {
  fixtures.prompt.mockResolvedValue({
    signedMessage: {
      accountId: "alice.testnet",
      publicKey: "public-fixture",
      signature: "signature-fixture",
    },
  });
  fixtures.createAction.mockResolvedValue({
    promptForExecution: fixtures.prompt,
  });
  const challenge = {
    challengeId: "challenge-fixture",
    nonce: Buffer.alloc(32, 7).toString("base64"),
    message: "Exact server challenge",
    recipient: "https://app.example.test",
  };
  expect(await signChallenge(challenge, "testnet")).toEqual({
    accountId: "alice.testnet",
    publicKey: "public-fixture",
    signature: "signature-fixture",
  });
  expect(fixtures.setLoggingLevel).toHaveBeenCalledWith("none");
  expect(fixtures.createAction).toHaveBeenCalledWith({
    id: "near::sign_in_and_sign_message",
    input: {
      target: { blockchain: "near", network: "testnet" },
      messageParams: {
        message: challenge.message,
        nonce: new Uint8Array(32).fill(7),
        recipient: challenge.recipient,
        state: challenge.challengeId,
      },
    },
  });
  const config = fixtures.initialize.mock.calls[0]?.[0];
  expect(config.mobileBridge).toEqual({ enabled: false });
  await expect(
    config.nearKeyStoreProvider.getKeyStore().setKey(),
  ).rejects.toThrow("custody prohibited");
  await expect(
    config.nearKeyStoreProvider.getKeyStore().getKey(),
  ).rejects.toThrow("custody prohibited");
  await config.storage.setItem("fixture", "value");
  expect(await config.storage.getItem("fixture")).toBe("value");
  await config.storage.removeItem("fixture");
  expect(await config.storage.getItem("fixture")).toBeNull();
});
it("propagates wallet cancellation without reporting successful authentication", async () => {
  fixtures.prompt.mockRejectedValue(new Error("Wallet cancelled"));
  await expect(
    signChallenge(
      {
        challengeId: "fixture",
        nonce: Buffer.alloc(32).toString("base64"),
        message: "message",
        recipient: "origin",
      },
      "testnet",
    ),
  ).rejects.toThrow("Wallet cancelled");
});
