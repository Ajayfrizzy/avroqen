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
const hash = "1".repeat(32);
const executionOutcome = {
  final_execution_status: "FINAL",
  status: { SuccessValue: "" },
  transaction: {
    hash,
    signer_id: operation.signerId,
    receiver_id: operation.receiverId,
  },
  transaction_outcome: { id: hash },
  receipts_outcome: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  f.signIn.mockResolvedValue({
    identifier: { accountId: "owner.testnet", network: "testnet" },
    connection: { executionTarget: "v1_ext" },
  });
  f.sign.mockResolvedValue([executionOutcome]);
  f.createAction.mockImplementation(async (v) => ({
    promptForExecution: v.id === "near::sign_in" ? f.signIn : f.sign,
  }));
});
it("requires a wallet prompt and durable begin before every financial signature; never installs keys", async () => {
  const begin = vi.fn(async () => {
    expect(f.sign).not.toHaveBeenCalled();
  });
  expect(await submitOperation(operation, begin)).toEqual({
    outcome: "BROADCAST",
    hash,
  });
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
  const begin = vi.fn(async () => {
    throw new Error(
      "Current deployment verification timed out before the wallet prompt opened.",
    );
  });
  await expect(submitOperation(operation, begin)).rejects.toThrow(
    "timed out before the wallet prompt opened",
  );
  expect(begin).toHaveBeenCalledOnce();
  expect(f.sign).not.toHaveBeenCalled();
});
it("classifies wallet cancellation without retrying", async () => {
  f.sign.mockRejectedValue(new Error("Action was cancelled"));
  const begin = vi.fn(async () => {});
  await expect(submitOperation(operation, begin)).resolves.toEqual({
    outcome: "CANCELED",
    hash: null,
    failure: {
      stage: "PROMPT",
      code: "ACTION_CANCELLED",
      endTags: [],
    },
  });
  expect(f.sign).toHaveBeenCalledOnce();
  expect(begin).toHaveBeenCalledOnce();
});
it("keeps a missing transaction hash unknown", async () => {
  f.sign.mockResolvedValue([]);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "UNKNOWN",
    hash: null,
    failure: {
      stage: "RESULT",
      code: "RESULT_HASH_MISSING",
      endTags: [],
    },
  });
});
it("accepts Meteor's exported hash-only broadcast response", async () => {
  f.sign.mockResolvedValue([{ hash, nonceString: "42" }]);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "BROADCAST",
    hash,
  });
});
it("accepts a complete outcome identified by transaction_outcome", async () => {
  f.sign.mockResolvedValue([
    {
      ...executionOutcome,
      transaction: { ...executionOutcome.transaction, hash: undefined },
    },
  ]);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "BROADCAST",
    hash,
  });
});
it("quarantines conflicting hashes instead of choosing one", async () => {
  f.sign.mockResolvedValue([
    { ...executionOutcome, transaction_outcome: { id: "2".repeat(32) } },
  ]);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "UNKNOWN",
    hash: null,
    failure: {
      stage: "RESULT",
      code: "RESULT_HASH_MISSING",
      endTags: [],
    },
  });
});
it("quarantines a malformed identifier beside a valid hash", async () => {
  f.sign.mockResolvedValue([{ ...executionOutcome, hash: "not-a-chain-hash" }]);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "UNKNOWN",
    hash: null,
    failure: {
      stage: "RESULT",
      code: "RESULT_HASH_MISSING",
      endTags: [],
    },
  });
});
it("distinguishes an explicit Meteor submission failure", async () => {
  const error = new Error("Wallet failed") as Error & {
    _reason: { endTags: string[] };
  };
  error.name = "MeteorActionError";
  error._reason = { endTags: ["EXT_DIRECT_RESPONSE_FAILED"] };
  f.sign.mockRejectedValue(error);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "SUBMISSION_FAILED",
    hash: null,
    failure: {
      stage: "PROMPT",
      code: "METEOR_DIRECT_RESPONSE_FAILED",
      endTags: ["EXT_DIRECT_RESPONSE_FAILED"],
    },
  });
});
it("drops unknown Meteor tags while preserving a sanitized failure", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = new Error("sensitive wallet detail") as Error & {
    _reason: { endTags: string[]; message: string };
  };
  error.name = "MeteorActionError";
  error._reason = {
    endTags: ["EXT_DIRECT_RESPONSE_FAILED", "PRIVATE_PROVIDER_MESSAGE"],
    message: "private extension response",
  };
  error.cause = new Error("private cause");
  f.sign.mockRejectedValue(error);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "SUBMISSION_FAILED",
    hash: null,
    failure: {
      stage: "PROMPT",
      code: "METEOR_DIRECT_RESPONSE_FAILED",
      endTags: ["EXT_DIRECT_RESPONSE_FAILED"],
    },
  });
  const diagnostic = info.mock.calls.find(
    ([event]) => event === "METEOR_TRANSACTION_FAILURE",
  );
  expect(diagnostic).toBeDefined();
  expect(JSON.parse(String(diagnostic?.[1]))).toEqual({
    event: "METEOR_TRANSACTION_FAILURE",
    action: "near::sign_transactions",
    operationKind: "FUND",
    executionTarget: "v1_ext",
    errorType: "METEOR_ACTION_ERROR",
    failureCategory: "EXTENSION_TRANSPORT_FAILED",
    endTagState: "PRESENT",
    endTags: ["EXT_DIRECT_RESPONSE_FAILED"],
    hasCause: true,
  });
  expect(JSON.stringify(diagnostic)).not.toContain("sensitive wallet detail");
  expect(JSON.stringify(diagnostic)).not.toContain(
    "private extension response",
  );
  expect(JSON.stringify(diagnostic)).not.toContain("private cause");
  expect(JSON.stringify(diagnostic)).not.toContain("PRIVATE_PROVIDER_MESSAGE");
  info.mockRestore();
});
it("records an empty Meteor failure tag set without exposing raw details", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = new Error("wallet renderer internals") as Error & {
    _reason: { endTags: string[]; message: string };
  };
  error.name = "MeteorActionError";
  error._reason = { endTags: [], message: "wallet renderer internals" };
  f.sign.mockRejectedValue(error);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "SUBMISSION_FAILED",
    hash: null,
    failure: {
      stage: "PROMPT",
      code: "METEOR_ACTION_FAILED",
      endTags: [],
    },
  });
  const diagnostic = info.mock.calls.find(
    ([event]) => event === "METEOR_TRANSACTION_FAILURE",
  );
  expect(JSON.parse(String(diagnostic?.[1]))).toMatchObject({
    executionTarget: "v1_ext",
    errorType: "METEOR_ACTION_ERROR",
    failureCategory: "WALLET_REJECTED_UNSPECIFIED",
    endTagState: "EMPTY",
    endTags: [],
    hasCause: false,
  });
  expect(JSON.stringify(diagnostic)).not.toContain("wallet renderer internals");
  info.mockRestore();
});
it("classifies official Meteor account failures only in local diagnostics", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = new Error("account provider detail") as Error & {
    _reason: { endTags: string[] };
  };
  error.name = "MeteorActionError";
  error._reason = { endTags: ["NO_ACCOUNTS", "UNTRUSTED_DETAIL"] };
  f.sign.mockRejectedValue(error);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "SUBMISSION_FAILED",
    hash: null,
    failure: {
      stage: "PROMPT",
      code: "METEOR_ACTION_FAILED",
      endTags: [],
    },
  });
  const diagnostic = info.mock.calls.find(
    ([event]) => event === "METEOR_TRANSACTION_FAILURE",
  );
  expect(JSON.parse(String(diagnostic?.[1]))).toMatchObject({
    failureCategory: "WALLET_ACCOUNT_UNAVAILABLE",
    endTags: ["NO_ACCOUNTS"],
  });
  expect(JSON.stringify(diagnostic)).not.toContain("account provider detail");
  expect(JSON.stringify(diagnostic)).not.toContain("UNTRUSTED_DETAIL");
  info.mockRestore();
});
it("keeps an allowlisted Meteor cancellation distinct while dropping unknown tags", async () => {
  const error = new Error("sensitive wallet detail") as Error & {
    _reason: { endTags: string[] };
  };
  error.name = "MeteorActionError";
  error._reason = { endTags: ["USER_CANCELLED", "PRIVATE_PROVIDER_MESSAGE"] };
  f.sign.mockRejectedValue(error);
  await expect(submitOperation(operation, async () => {})).resolves.toEqual({
    outcome: "CANCELED",
    hash: null,
    failure: {
      stage: "PROMPT",
      code: "ACTION_CANCELLED",
      endTags: ["USER_CANCELLED"],
    },
  });
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
  ).resolves.toEqual({
    outcome: "CANCELED",
    hash: null,
    failure: {
      stage: "PROMPT",
      code: "ACTION_CANCELLED",
      endTags: [],
    },
  });
  expect(begin).toHaveBeenCalledOnce();
  expect(f.sign).toHaveBeenCalledOnce();
});
