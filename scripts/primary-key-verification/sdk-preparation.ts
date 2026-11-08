// Offline source preparation only. No evaluator, SDK import, file write or live loader.
import { createHash } from "node:crypto";

export const SDK_CJS_SHA256 =
  "be6c782147f106a329c8e4bd74dd5786980078b559c292b1f93e47c1f02bd4c6";
function replaceOnce(source: string, before: string, after: string) {
  if (source.split(before).length !== 2) throw new Error("SDK_SOURCE_CHANGED");
  return source.replace(before, after);
}
// Produces a function body for a separately scoped fixture module. Nothing is evaluated
// here. `require`, `exports`, and `guardedMessenger` are isolated evaluator bindings.
export function prepareSdkFactory(source: string): string {
  if (createHash("sha256").update(source).digest("hex") !== SDK_CJS_SHA256)
    throw new Error("SDK_SOURCE_CHANGED");
  const start = source.indexOf(
    "//#region src/postMessage/MeteorPostMessenger.ts",
  );
  const end = source.indexOf("//#region src/utils/MeteorSdkUtils.ts", start);
  if (start < 0 || end < start) throw new Error("SDK_SOURCE_CHANGED");
  let result =
    source.slice(0, start) +
    "function getMeteorPostMessenger() { return guardedMessenger; }\n" +
    source.slice(end);
  result = replaceOnce(
    result,
    "const envConfig = { wallet_base_url: locallySetBaseUrl ?? WALLET_URL_PRODUCTION_BASE };",
    'if (locallySetBaseUrl != null) throw new Error("PRIMARY_WALLET_OVERRIDE");\nconst envConfig = Object.freeze({ wallet_base_url: WALLET_URL_PRODUCTION_BASE });',
  );
  const targetStart = result.indexOf(
    "\tasync getExecutionTargetConfigs(_request) {",
    result.indexOf("var MeteorConnectV1Client = class"),
  );
  const targetEnd = result.indexOf(
    "\tasync makeRequest(request, connectionConfig) {",
    targetStart,
  );
  if (targetStart < 0 || targetEnd < targetStart)
    throw new Error("SDK_SOURCE_CHANGED");
  result =
    result.slice(0, targetStart) +
    `\tasync getExecutionTargetConfigs(request) {
    if (request.id !== "near::sign_in_and_sign_message") throw new Error("PRIMARY_ACTION_ONLY");
    return [{ executionTarget: "v1_web" }];
  }
` +
    result.slice(targetEnd);
  if (
    result.includes("var ComWindow =") ||
    result.includes("var MeteorPostMessenger =") ||
    result.includes('window.addEventListener("message"')
  )
    throw new Error("SDK_UNGUARDED_PATH");
  return (
    result +
    `
// Deliberately return only the fixed combined message operation, not SDK exports.
return async function signIsolatedChallenge(challenge) {
  const memory = new Map();
  const connect = new MeteorConnect();
  connect.setLoggingLevel("none");
  try {
    await connect.initialize({
      storage: {
        getItem: async key => memory.get(key) ?? null,
        setItem: async (key, value) => { memory.set(key, value); },
        removeItem: async key => { memory.delete(key); }
      },
      mobileBridge: { enabled: false },
      nearKeyStoreProvider: { getKeyStore: () => ({
        setKey: async () => { throw new Error("PRIMARY_CUSTODY_PROHIBITED"); },
        getKey: async () => { throw new Error("PRIMARY_CUSTODY_PROHIBITED"); },
        removeKey: async () => { throw new Error("PRIMARY_CUSTODY_PROHIBITED"); },
        clear: async () => {}, getNetworks: async () => [], getAccounts: async () => []
      }) }
    });
    const action = await connect.createAction({
      id: "near::sign_in_and_sign_message",
      input: {
        target: { blockchain: "near", network: "testnet" },
        messageParams: { message: challenge.message, recipient: challenge.recipient,
          nonce: Uint8Array.from(Buffer.from(challenge.nonce, "base64")), state: challenge.challengeId }
      }
    });
    const targets = action.getAllExecutionTargetConfigs();
    if (targets.length !== 1 || targets[0].executionTarget !== "v1_web" ||
        action.getActionKnownContextualTarget() != null) throw new Error("PRIMARY_TRANSPORT_CHANGED");
    return (await action.execute("v1_web")).signedMessage;
  } finally { memory.clear(); }
};
`
  );
}
