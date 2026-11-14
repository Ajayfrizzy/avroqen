import { walletSignInError } from "./wallet-errors";
import { normalizeWalletProof } from "./wallet-proof";
import { loadConnector } from "./wallet-sdk";
export interface Challenge {
  challengeId: string;
  message: string;
  nonce: string;
  recipient: string;
}
export async function signChallenge(
  challenge: Challenge,
  network: "testnet" | "mainnet",
) {
  const memory = new Map<string, string>();
  try {
    const connect = await loadConnector();
    connect.setLoggingLevel("none");
    await connect.initialize({
      storage: {
        getItem: async (key) => memory.get(key) ?? null,
        setItem: async (key, value) => {
          memory.set(key, value);
        },
        removeItem: async (key) => {
          memory.delete(key);
        },
      },
      mobileBridge: { enabled: false },
      nearKeyStoreProvider: {
        getKeyStore: () => ({
          setKey: async () => {
            throw new Error("Application key custody prohibited");
          },
          getKey: async () => {
            throw new Error("Application key custody prohibited");
          },
          removeKey: async () => {},
          clear: async () => {},
          getNetworks: async () => [],
          getAccounts: async () => [],
        }),
      },
    });
    // Message-only action: never supply contract/addFunctionCallKey or transaction actions.
    const action = await connect.createAction({
      id: "near::sign_in_and_sign_message",
      input: {
        target: { blockchain: "near", network },
        messageParams: {
          message: challenge.message,
          recipient: challenge.recipient,
          nonce: Uint8Array.from(atob(challenge.nonce), (c) => c.charCodeAt(0)),
          state: challenge.challengeId,
        },
      },
    });
    return normalizeWalletProof(
      (await action.promptForExecution()).signedMessage,
    );
  } catch (reason) {
    throw walletSignInError(reason);
  } finally {
    memory.clear();
  }
}
