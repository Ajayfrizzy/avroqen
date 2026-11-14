// Offline compatibility probe ONLY. Never initialize a wallet or invoke an action.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import bs58 from "bs58";
import {
  ACCOUNT,
  candidate,
  INIT,
  PUBLIC_KEY,
  validateCandidate,
} from "../../packages/domain/src/deployment-preview.js";

const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
const sdkRoot = dirname(webRequire.resolve("@meteorwallet/sdk/package.json"));
const sdkRequire = createRequire(join(sdkRoot, "package.json"));
export async function inspectSdk() {
  const metadata = JSON.parse(
    await readFile(join(sdkRoot, "package.json"), "utf8"),
  );
  if (metadata.version !== "3.24.1") throw new Error("SDK_VERSION_CHANGED");
  const sdk = webRequire("@meteorwallet/sdk");
  const { PublicKey } = sdkRequire("@near-js/crypto");
  const { Transaction } = sdkRequire("@near-js/transactions");
  const wasm = await readFile(
    new URL("../../docs/evidence/mandate-vault-approved.wasm", import.meta.url),
  );
  const tx = validateCandidate(candidate(wasm));
  const selectorActions = [
    { type: "DeployContract", params: { code: tx.actions[0].params.code } },
    {
      type: "FunctionCall",
      params: {
        methodName: "new",
        args: Buffer.from(INIT),
        gas: "100000000000000",
        deposit: "0",
      },
    },
  ];
  // Exercise the actual pinned transform method without constructing MeteorWallet.
  // Placeholder nonce/block are deterministic test data, not a signable public-chain envelope.
  const transactions =
    await sdk.MeteorWallet.prototype.transformTransactions.call(
      {
        _provider: {
          viewBlock: async () => ({
            header: { hash: "11111111111111111111111111111111" },
          }),
        },
        _fakePublicKey: PublicKey.from(PUBLIC_KEY),
      },
      {
        transactions: [{ receiverId: ACCOUNT, actions: selectorActions }],
        meteorConnectAccount: {
          identifier: { accountId: ACCOUNT, network: "testnet" },
        },
      },
    );
  if (transactions.length !== 1) throw new Error("BATCH_CHANGED");
  const encoded: Uint8Array = transactions[0].encode();
  const payload = Buffer.from(encoded).toString("base64");
  const decoded = Transaction.decode(Buffer.from(payload, "base64"));
  const deploy = decoded.actions[0]?.deployContract;
  const init = decoded.actions[1]?.functionCall;
  if (
    `ed25519:${bs58.encode(decoded.publicKey.ed25519Key?.data ?? new Uint8Array())}` !==
      PUBLIC_KEY ||
    !Buffer.from(decoded.encode()).equals(Buffer.from(encoded)) ||
    decoded.signerId !== ACCOUNT ||
    decoded.receiverId !== ACCOUNT ||
    decoded.actions.length !== 2 ||
    !deploy ||
    !init ||
    !Buffer.from(deploy.code).equals(wasm) ||
    init.methodName !== "new" ||
    !Buffer.from(init.args).equals(Buffer.from(INIT)) ||
    init.gas !== 100000000000000n ||
    init.deposit !== 0n
  )
    throw new Error("SDK_ROUNDTRIP_MISMATCH");
  return {
    evidence: {
      sdkVersion: metadata.version,
      scope: "OFFLINE_SDK_SERIALIZATION_ONLY",
      unsignedBytes: encoded.length,
      base64Characters: payload.length,
      transport: "v1_web postMessage inputs.transactions",
      transactionCount: 1,
      actionOrder: ["DeployContract", "FunctionCall"],
      artifactSha256: createHash("sha256")
        .update(Buffer.from(deploy.code))
        .digest("hex"),
      artifactBytes: deploy.code.length,
      signer: decoded.signerId,
      publicKey: `ed25519:${bs58.encode(decoded.publicKey.ed25519Key?.data ?? new Uint8Array())}`,
      receiver: decoded.receiverId,
      method: init.methodName,
      argsUtf8: Buffer.from(init.args).toString("utf8"),
      gas: init.gas.toString(),
      deposit: init.deposit.toString(),
      actualWalletTransport: "NOT_TESTED",
      transparentWalletReview: "NOT_TESTED",
      publicNonceAndBlock: "NOT_PREPARED",
    },
    // In-memory test data only. Never persist the serialized envelope.
    payload,
  };
}
