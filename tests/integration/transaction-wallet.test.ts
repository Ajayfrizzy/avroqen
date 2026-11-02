import { beforeEach, expect, it, vi } from "vitest";
import { submitOperation } from "../../apps/web/app/workspace/transaction-wallet.js";
import type { ChainOperation } from "../../packages/domain/src/settlement.js";

const f = vi.hoisted(() => ({
  createAction: vi.fn(),
  initialize: vi.fn(),
  setLoggingLevel: vi.fn(),
  signIn: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("../../apps/web/app/workspace/wallet-sdk", () => ({
  loadConnector: async () => ({
    initialize: f.initialize,
    setLoggingLevel: f.setLoggingLevel,
    createAction: f.createAction,
  }),
}));
// This test checks the sender boundary, not the SDK's implementation of NEAR serialization.
vi.mock("@meteorwallet/sdk", () => ({
  convertSelectorActionToNearAction: (v: unknown) => v,
}));
const operation: ChainOperation = {
  network: "testnet",
  signerId: "owner.testnet",
  receiverId: "vault.testnet",
  methodName: "fund_mandate",
  args: { mandate_id: "m" },
  gas: "100000000000000",
  deposit: "1",
  mandateId: "m",
  policyDigest: "a".repeat(64),
  kind: "FUND",
};
beforeEach(() => {
  vi.clearAllMocks();
  f.signIn.mockResolvedValue({
    identifier: { accountId: "owner.testnet", network: "testnet" },
  });
  f.sign.mockResolvedValue([{ transaction: { hash: "1".repeat(32) } }]);
  f.createAction.mockImplementation(async (v) => ({
    promptForExecution: v.id === "near::sign_in" ? f.signIn : f.sign,
  }));
});
it("requires a wallet prompt and durable begin before every financial signature; never installs keys", async () => {
  const begin = vi.fn(async () => {
    expect(f.sign).not.toHaveBeenCalled();
  });
  expect(await submitOperation(operation, begin)).toBe("1".repeat(32));
  expect(begin).toHaveBeenCalledOnce();
  expect(f.sign).toHaveBeenCalledOnce();
  expect(f.createAction.mock.calls[0]?.[0].input).toEqual({
    target: { blockchain: "near", network: "testnet" },
  });
  expect(f.createAction.mock.calls[1]?.[0].input.useFunctionCallKey).toBe(
    false,
  );
  expect(
    f.createAction.mock.calls[1]?.[0].input.transactions[0].actions,
  ).toHaveLength(1);
  const store =
    f.initialize.mock.calls[0]?.[0].nearKeyStoreProvider.getKeyStore();
  await expect(store.setKey()).rejects.toThrow();
  await expect(store.getKey()).rejects.toThrow();
});
it("does not begin or sign for a substituted wallet", async () => {
  f.signIn.mockResolvedValue({
    identifier: { accountId: "other.testnet", network: "testnet" },
  });
  const begin = vi.fn();
  await expect(submitOperation(operation, begin)).rejects.toThrow();
  expect(begin).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});
it("does not sign after database begin fails", async () => {
  await expect(
    submitOperation(operation, async () => {
      throw new Error("database outage");
    }),
  ).rejects.toThrow();
  expect(f.sign).not.toHaveBeenCalled();
});
it("never retries wallet cancellation or missing transaction hash", async () => {
  f.sign.mockRejectedValue(new Error("Action was cancelled"));
  const begin = vi.fn(async () => {});
  await expect(submitOperation(operation, begin)).rejects.toThrow();
  expect(f.sign).toHaveBeenCalledOnce();
  expect(begin).toHaveBeenCalledOnce();
});
it("does not treat malformed wallet result as success", async () => {
  f.sign.mockResolvedValue([]);
  await expect(submitOperation(operation, async () => {})).rejects.toThrow(
    "unknown",
  );
});
it("a canceled emergency pause remains an attempted unknown outcome and is never retried", async () => {
  f.sign.mockRejectedValue(new Error("Action was cancelled"));
  const begin = vi.fn(async () => {});
  await expect(
    submitOperation(
      {
        ...operation,
        kind: "PAUSE",
        methodName: "pause_mandate",
        args: { mandate_id: "m" },
        deposit: "1",
      },
      begin,
    ),
  ).rejects.toThrow();
  expect(begin).toHaveBeenCalledOnce();
  expect(f.sign).toHaveBeenCalledOnce();
});
