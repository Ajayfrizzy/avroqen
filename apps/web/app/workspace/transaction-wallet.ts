import type { ChainOperation } from "../../../../packages/domain/src/settlement";
import { loadConnector } from "./wallet-sdk";
/** All signed transactions remain in the wallet. Never request/add a function-call key. */
export async function submitOperation(
  operation: ChainOperation,
  begin: () => Promise<void>,
): Promise<string> {
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
    const result = await action.promptForExecution();
    const hash = result.length === 1 ? result[0]?.transaction?.hash : undefined;
    if (typeof hash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hash))
      throw new Error("Transaction outcome unknown.");
    return hash;
  } finally {
    memory.clear();
  }
}
