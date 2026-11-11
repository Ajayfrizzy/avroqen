import { createHash, createPublicKey, verify } from "node:crypto";
import bs58 from "bs58";
import { readOnlyRpcFetch } from "../../../../services/chain/rpc-rate-limit.js";

export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const csrfFor = (token: string) => hash(`avroqen-csrf-v1:${token}`);
export interface Message {
  message: string;
  nonce: Buffer;
  recipient: string;
  callback_url: string;
}
function string(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}
export function messageDigest(value: Message): Buffer {
  if (value.nonce.length !== 32) throw new Error("Invalid nonce");
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(2147484061);
  return createHash("sha256")
    .update(
      Buffer.concat([
        tag,
        string(value.message),
        value.nonce,
        string(value.recipient),
        value.callback_url
          ? Buffer.concat([Buffer.from([1]), string(value.callback_url)])
          : Buffer.from([0]),
      ]),
    )
    .digest();
}
export function verifyMessage(
  value: Message,
  publicKey: string,
  signature: string,
): boolean {
  try {
    if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(publicKey)) return false;
    if (!/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false;
    const key = Buffer.from(bs58.decode(publicKey.slice(8)));
    const sig = Buffer.from(signature, "base64");
    if (
      key.length !== 32 ||
      sig.length !== 64 ||
      sig.toString("base64") !== signature
    )
      return false;
    return verify(
      null,
      messageDigest(value),
      createPublicKey({
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"),
          key,
        ]),
        format: "der",
        type: "spki",
      }),
      sig,
    );
  } catch {
    return false;
  }
}
export type Network = "testnet" | "mainnet";
export function fullAccessVerifier(
  network: Network,
  fetcher: typeof fetch = fetch,
) {
  return async (accountId: string, publicKey: string): Promise<boolean> => {
    const request: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "m1-key",
        method: "query",
        params: {
          request_type: "view_access_key",
          finality: "final",
          account_id: accountId,
          public_key: publicKey,
        },
      }),
    };
    const response =
      fetcher === fetch
        ? await readOnlyRpcFetch(network, request)
        : await fetcher(
            network === "testnet"
              ? "https://rpc.testnet.near.org"
              : "https://rpc.mainnet.near.org",
            request,
          );
    if (!response.ok) throw new Error("Identity provider unavailable");
    const data = (await response.json()) as {
      id?: unknown;
      result?: { permission?: unknown };
      error?: { cause?: { name?: string } };
    };
    if (data.id !== "m1-key") throw new Error("Invalid identity response");
    if (data.error) {
      if (
        ["UNKNOWN_ACCESS_KEY", "UNKNOWN_ACCOUNT"].includes(
          data.error.cause?.name ?? "",
        )
      )
        return false;
      throw new Error("Identity provider unavailable");
    }
    if (!data.result) throw new Error("Invalid identity response");
    return data.result.permission === "FullAccess";
  };
}
