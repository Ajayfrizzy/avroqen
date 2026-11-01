import { beforeEach, expect, it, vi } from "vitest";
import { signChallenge } from "../../apps/web/app/workspace/wallet.js";
import { normalizeWalletProof } from "../../apps/web/app/workspace/wallet-proof.js";

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
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.createAction.mockResolvedValue({
    promptForExecution: fixtures.prompt,
  });
});
it("wallet connector requests only NEP-413 signing and refuses key custody", async () => {
  fixtures.prompt.mockResolvedValue({
    signedMessage: {
      accountId: "alice.testnet",
      publicKey: { toString: () => `ed25519:${"1".repeat(32)}` },
      signature: new Uint8Array(64).fill(7),
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
  const result = await signChallenge(challenge, "testnet");
  expect(typeof result.publicKey).toBe("string");
  expect(typeof result.signature).toBe("string");
  expect(result.accountId).toBe("alice.testnet");
  expect(String(result.publicKey) === `ed25519:${"1".repeat(32)}`).toBe(true);
  expect(
    String(result.signature) === Buffer.alloc(64, 7).toString("base64"),
  ).toBe(true);
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
  fixtures.prompt.mockRejectedValue(new Error("Action was cancelled"));
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
  ).rejects.toThrow("Wallet sign-in canceled. No transaction was sent.");
});

it("normalizes binary signatures byte-for-byte and rejects malformed wallet shapes", () => {
  const key = { toString: () => `ed25519:${"1".repeat(32)}` };
  for (const signature of [
    new Uint8Array(64).map((_, i) => (i * 71) % 256),
    Buffer.alloc(64, 255),
  ]) {
    const result = normalizeWalletProof({
      accountId: "alice.testnet",
      publicKey: key,
      signature,
    });
    expect(
      Buffer.from(result.signature, "base64").equals(Buffer.from(signature)),
    ).toBe(true);
    expect(typeof JSON.parse(JSON.stringify(result)).signature).toBe("string");
  }
  for (const value of [
    null,
    {},
    {
      accountId: "invalid account",
      publicKey: key,
      signature: new Uint8Array(64),
    },
    {
      accountId: "alice.testnet",
      publicKey: {},
      signature: new Uint8Array(64),
    },
    {
      accountId: "alice.testnet",
      publicKey: { toString: () => "secp256k1:unsupported" },
      signature: new Uint8Array(64),
    },
    {
      accountId: "alice.testnet",
      publicKey: key,
      signature: new Uint8Array(63),
    },
    {
      accountId: "alice.testnet",
      publicKey: key,
      signature: Array(64).fill(0),
    },
    {
      accountId: "alice.testnet",
      publicKey: key,
      signature: "already-encoded-unexpected-shape",
    },
  ]) {
    expect(() => normalizeWalletProof(value)).toThrow(
      "Invalid wallet message response",
    );
  }
});

it.each([
  ["POPUP_WINDOW_OPEN_FAILED", "popup"],
  ["POPUP_WINDOW_REFUSED", "popup"],
  ["WINDOW_CLOSED", "canceled"],
  ["USER_CANCELLED", "canceled"],
  ["EXT_DIRECT_RESPONSE_FAILED", "unavailable"],
])("rejects SDK %s safely and allows a fresh retry", async (tag, kind) => {
  fixtures.prompt
    .mockRejectedValueOnce(
      Object.assign(new Error("untrusted detail"), {
        name: "MeteorActionError",
        _reason: { endTags: [tag] },
      }),
    )
    .mockResolvedValueOnce({
      signedMessage: {
        accountId: "alice.testnet",
        publicKey: { toString: () => `ed25519:${"1".repeat(32)}` },
        signature: new Uint8Array(64),
      },
    });
  const challenge = {
    challengeId: "first",
    nonce: Buffer.alloc(32).toString("base64"),
    message: "fixture",
    recipient: "https://app.example.test",
  };
  await expect(signChallenge(challenge, "testnet")).rejects.toMatchObject({
    kind,
  });
  const next = {
    ...challenge,
    challengeId: "next",
    nonce: Buffer.alloc(32, 1).toString("base64"),
  };
  const result = await signChallenge(next, "testnet");
  expect(result.accountId).toBe("alice.testnet");
  expect(
    fixtures.createAction.mock.calls[1]?.[0].input.messageParams.state,
  ).toBe("next");
  expect(fixtures.prompt).toHaveBeenCalledTimes(2);
});
