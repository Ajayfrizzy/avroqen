import bs58 from "bs58";

export const RPC = "https://rpc.testnet.near.org";
export interface Policy {
  readonly account: string;
  readonly primary: string;
  readonly testing: string;
}
const decimal = /^(0|[1-9][0-9]*)$/;
const hash = (value: unknown): value is string => {
  try {
    return typeof value === "string" && bs58.decode(value).length === 32;
  } catch {
    return false;
  }
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("RPC_INVALID");
  return value as Record<string, unknown>;
};
export interface Observation {
  blockHash: string;
  blockHeight: number;
  timestampNanosec: string;
  permission: "FullAccess";
}
export function freshBlock(timestamp: string, now: number) {
  if (!decimal.test(timestamp) || !Number.isSafeInteger(now) || now < 0)
    throw new Error("RPC_INVALID");
  const age = BigInt(now) * 1_000_000n - BigInt(timestamp);
  if (age < -5_000_000_000n || age > 120_000_000_000n)
    throw new Error("RPC_STALE");
}
// No default fetch: importing this module never initiates network activity.
export async function observe(
  policy: Policy,
  fetcher: typeof fetch,
  now: () => number,
): Promise<Observation> {
  let sequence = 0;
  async function rpc(method: "status" | "block" | "query", params: unknown) {
    const id = `primary-proof-${++sequence}`;
    const response = await fetcher(RPC, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) throw new Error("RPC_UNAVAILABLE");
    const data = object(await response.json());
    if (data.jsonrpc !== "2.0" || data.id !== id || "error" in data)
      throw new Error("RPC_INVALID");
    return object(data.result);
  }
  if ((await rpc("status", [])).chain_id !== "testnet")
    throw new Error("RPC_NETWORK");
  const header = object((await rpc("block", { finality: "final" })).header);
  if (
    !hash(header.hash) ||
    !Number.isSafeInteger(header.height) ||
    (header.height as number) < 0 ||
    typeof header.timestamp_nanosec !== "string"
  )
    throw new Error("RPC_INVALID");
  const blockHash = header.hash;
  const blockHeight = header.height as number;
  const timestampNanosec = header.timestamp_nanosec;
  freshBlock(timestampNanosec, now());
  const query = async (request_type: string, extra = {}) => {
    const result = await rpc("query", {
      request_type,
      block_id: blockHash,
      account_id: policy.account,
      ...extra,
    });
    if (result.block_hash !== blockHash || result.block_height !== blockHeight)
      throw new Error("RPC_UNPINNED");
    return result;
  };
  const account = await query("view_account");
  if (
    typeof account.amount !== "string" ||
    !decimal.test(account.amount) ||
    typeof account.locked !== "string" ||
    !decimal.test(account.locked) ||
    !hash(account.code_hash) ||
    !Number.isSafeInteger(account.storage_usage) ||
    (account.storage_usage as number) < 0
  )
    throw new Error("RPC_INVALID");
  const list = await query("view_access_key_list");
  if (!Array.isArray(list.keys) || list.keys.length !== 2)
    throw new Error("RPC_KEYS");
  const keys = new Set<string>();
  for (const entry of list.keys) {
    const item = object(entry);
    const access = object(item.access_key);
    if (
      typeof item.public_key !== "string" ||
      ![policy.primary, policy.testing].includes(item.public_key) ||
      keys.has(item.public_key) ||
      access.permission !== "FullAccess" ||
      !Number.isSafeInteger(access.nonce) ||
      (access.nonce as number) < 0
    )
      throw new Error("RPC_KEYS");
    keys.add(item.public_key);
  }
  const key = await query("view_access_key", { public_key: policy.primary });
  if (
    key.permission !== "FullAccess" ||
    !Number.isSafeInteger(key.nonce) ||
    (key.nonce as number) < 0
  )
    throw new Error("RPC_PERMISSION");
  const listed = list.keys
    .map(object)
    .find((k) => k.public_key === policy.primary);
  if (object(listed?.access_key).nonce !== key.nonce)
    throw new Error("RPC_UNPINNED");
  freshBlock(timestampNanosec, now());
  return { blockHash, blockHeight, timestampNanosec, permission: "FullAccess" };
}
