import type {
  ChainOperation,
  WalletReport,
} from "../../../../packages/domain/src/settlement";
import { loadConnector } from "./wallet-sdk";

const chainHash = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function transactionHash(result: unknown): string | undefined {
  if (!Array.isArray(result) || result.length !== 1) return undefined;
  const value = result[0];
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const transaction =
    item.transaction && typeof item.transaction === "object"
      ? (item.transaction as Record<string, unknown>)
      : undefined;
  const transactionOutcome =
    item.transaction_outcome && typeof item.transaction_outcome === "object"
      ? (item.transaction_outcome as Record<string, unknown>)
      : undefined;
  // Meteor 3.24.1 documents FinalExecutionOutcome[]. Its exported legacy
  // ITransactionHashOutput is also accepted because deployed wallet versions may
  // return that hash-only result after broadcasting.
  const candidates = [
    transaction?.hash,
    transactionOutcome?.id,
    item.hash,
  ].filter((candidate) => candidate !== undefined);
  const first = candidates[0];
  return candidates.length > 0 &&
    typeof first === "string" &&
    chainHash.test(first) &&
    candidates.every(
      (candidate) =>
        typeof candidate === "string" &&
        chainHash.test(candidate) &&
        candidate === first,
    )
    ? first
    : undefined;
}

function walletFailure(error: unknown): WalletReport["outcome"] {
  if (error instanceof Error && error.message === "Action was cancelled")
    return "CANCELED";
  if (error instanceof Error && error.name === "MeteorActionError") {
    const tags = (error as Error & { _reason?: { endTags?: unknown } })._reason
      ?.endTags;
    if (Array.isArray(tags) && tags.every((tag) => typeof tag === "string")) {
      if (tags.includes("USER_CANCELLED") || tags.includes("WINDOW_CLOSED"))
        return "CANCELED";
      return "SUBMISSION_FAILED";
    }
  }
  return "UNKNOWN";
}

/** All signed transactions remain in the wallet. Never request/add a function-call key. */
export async function submitOperation(
  operation: ChainOperation,
  begin: () => Promise<void>,
): Promise<WalletReport> {
  const memory = new Map<string, string>();
  const connector = await loadConnector();
  try {
    connector.setLoggingLevel("none");
    await connector.initialize({
      storage: {
        getItem: async (k) => memory.get(k) ?? null,
        setItem: async (k, v) => {
          memory.set(k, v);
        },
        removeItem: async (k) => {
          memory.delete(k);
        },
      },
      mobileBridge: { enabled: false },
      nearKeyStoreProvider: {
        getKeyStore: () => ({
          setKey: async () => {
            throw new Error("Key custody prohibited");
          },
          getKey: async () => {
            throw new Error("Key custody prohibited");
          },
          removeKey: async () => {},
          clear: async () => {},
          getNetworks: async () => [],
          getAccounts: async () => [],
        }),
      },
    });
    if (operation.network !== "testnet") throw new Error("Testnet required");
    const signIn = await connector.createAction({
      id: "near::sign_in",
      input: { target: { blockchain: "near", network: "testnet" } },
    });
    const account = await signIn.promptForExecution();
    if (
      account.identifier.accountId !== operation.signerId ||
      account.identifier.network !== "testnet"
    )
      throw new Error("Connect the exact signing account shown in the review.");
    const { convertSelectorActionToNearAction } = await import(
      "@meteorwallet/sdk"
    );
    const action = await connector.createAction({
      id: "near::sign_transactions",
      input: {
        target: {
          blockchain: "near",
          network: "testnet",
          accountId: operation.signerId,
        },
        useFunctionCallKey: false,
        transactions: [
          {
            receiverId: operation.receiverId,
            actions: [
              convertSelectorActionToNearAction({
                type: "FunctionCall",
                params: {
                  methodName: operation.methodName,
                  args: operation.args,
                  gas: operation.gas,
                  deposit: operation.deposit,
                },
              }),
            ],
          },
        ],
      },
    });
    // Persist uncertainty before opening any transaction prompt. Never blindly repeat this call.
    await begin();
    try {
      const result: unknown = await action.promptForExecution();
      const hash = transactionHash(result);
      return hash
        ? { outcome: "BROADCAST", hash }
        : { outcome: "UNKNOWN", hash: null };
    } catch (error) {
      return { outcome: walletFailure(error), hash: null } as WalletReport;
    }
  } finally {
    memory.clear();
  }
}
