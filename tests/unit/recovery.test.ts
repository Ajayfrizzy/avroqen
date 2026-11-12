import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import type { Intent } from "../../services/chain/reconcile.js";
import { replacementEvidenceFor } from "../../services/chain/recovery.js";
import type { Manifest, NearReader } from "../../services/chain/rpc.js";

const anchorHash = bs58.encode(Buffer.alloc(32, 1));
const evidenceHash = bs58.encode(Buffer.alloc(32, 2));
const manifest: Manifest = {
  account: "vault.testnet",
  network: "testnet",
  wasmSha256: "a".repeat(64),
  keyFingerprints: ["b".repeat(64)],
  authorization: "test-authorization",
};
const operation = {
  network: "testnet",
  signerId: "alice.testnet",
  receiverId: "vault.testnet",
  methodName: "storage_deposit",
  args: {},
  gas: "100000000000000",
  deposit: "100000000000000000000000",
  mandateId: "11111111-1111-4111-8111-111111111111",
  policyDigest: "c".repeat(64),
  kind: "STORAGE_DEPOSIT",
};
const intent = (change: Partial<Intent> = {}): Intent => ({
  id: "22222222-2222-4222-8222-222222222222",
  canonical_operation: JSON.stringify(operation),
  manifest,
  reported_hash: null,
  verified_hash: null,
  scan_height: "100",
  scan_hash: anchorHash,
  anchor_height: "100",
  anchor_hash: anchorHash,
  last_height: null,
  last_block_hash: null,
  state: "UNKNOWN",
  ...change,
});

type ReaderOptions = {
  height?: number;
  anchorKeys?: unknown[];
  evidenceKeys?: unknown[];
  anchorCredit?: unknown;
  evidenceCredit?: unknown;
  queryBlockHash?: string;
  fail?: boolean;
};
const fullAccessKey = (nonce: string | number = "7") => ({
  public_key: `ed25519:${bs58.encode(Buffer.alloc(32, 3))}`,
  access_key: { nonce, permission: "FullAccess" },
});
function reader(options: ReaderOptions = {}): NearReader {
  const anchorKeys = options.anchorKeys ?? [fullAccessKey()];
  const evidenceKeys = options.evidenceKeys ?? [fullAccessKey()];
  return {
    deployment: async (_manifest: Manifest, at?: string) => {
      if (options.fail) throw new Error("RPC_TIMEOUT");
      const anchor = at !== undefined;
      return {
        block: {
          height: anchor ? 100 : (options.height ?? 90_100),
          hash: anchor ? anchorHash : evidenceHash,
        },
      };
    },
    query: async (_type: string, _account: string, block: string) => ({
      block_hash: options.queryBlockHash ?? block,
      keys: block === anchorHash ? anchorKeys : evidenceKeys,
    }),
    view: async (
      _account: string,
      _method: string,
      _args: Record<string, unknown>,
      block: string,
    ) =>
      block === anchorHash
        ? (options.anchorCredit ?? null)
        : (options.evidenceCredit ?? null),
  } as unknown as NearReader;
}

describe("controlled replacement evidence", () => {
  it("accepts an expired validity window with unchanged complete keys and null credit", async () => {
    const result = await replacementEvidenceFor(reader(), intent());
    expect(result).toMatchObject({
      anchorHeight: "100",
      anchorHash,
      evidenceHeight: "90100",
      evidenceHash,
      storageCreditAtAnchor: null,
      storageCreditAtEvidence: null,
      validityBlocks: 90_000,
    });
    expect(result.signerKeysDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the intent quarantined while the transaction validity window is open", async () => {
    await expect(
      replacementEvidenceFor(reader({ height: 90_099 }), intent()),
    ).rejects.toThrow("RECOVERY_VALIDITY_WINDOW_OPEN");
  });

  it.each([
    ["nonce changed", [fullAccessKey(8)]],
    [
      "key added",
      [
        fullAccessKey(),
        {
          public_key: `ed25519:${bs58.encode(Buffer.alloc(32, 4))}`,
          access_key: { nonce: "1", permission: "FullAccess" },
        },
      ],
    ],
    [
      "permission changed",
      [
        {
          ...fullAccessKey(),
          access_key: {
            nonce: "7",
            permission: {
              FunctionCall: {
                allowance: null,
                receiver_id: "vault.testnet",
                method_names: ["storage_deposit"],
              },
            },
          },
        },
      ],
    ],
  ])("rejects evidence when the signer %s", async (_name, evidenceKeys) => {
    await expect(
      replacementEvidenceFor(reader({ evidenceKeys }), intent()),
    ).rejects.toThrow("RECOVERY_SIGNER_NONCE_CHANGED");
  });

  it.each([
    ["anchor", { anchorCredit: "1" }],
    ["evidence head", { evidenceCredit: "1" }],
  ])("rejects non-null storage credit at the %s", async (_name, options) => {
    await expect(
      replacementEvidenceFor(reader(options), intent()),
    ).rejects.toThrow("RECOVERY_STORAGE_CREDIT_CHANGED");
  });

  it("rejects an RPC response that is not pinned to the requested block", async () => {
    await expect(
      replacementEvidenceFor(
        reader({ queryBlockHash: bs58.encode(Buffer.alloc(32, 9)) }),
        intent(),
      ),
    ).rejects.toThrow("RPC_BLOCK_MISMATCH");
  });

  it.each([
    ["an empty key set", []],
    ["duplicate keys", [fullAccessKey(), fullAccessKey()]],
  ])("rejects %s", async (_name, anchorKeys) => {
    await expect(
      replacementEvidenceFor(reader({ anchorKeys }), intent()),
    ).rejects.toThrow("RECOVERY_SIGNER_KEYS_INVALID");
  });

  it.each([
    { reported_hash: bs58.encode(Buffer.alloc(32, 5)) },
    { verified_hash: bs58.encode(Buffer.alloc(32, 6)) },
  ])("rejects an intent with a known transaction hash", async (change) => {
    await expect(
      replacementEvidenceFor(reader(), intent(change)),
    ).rejects.toThrow("RECOVERY_HASH_PRESENT");
  });

  it("rejects unsupported operations and conflicting anchors", async () => {
    await expect(
      replacementEvidenceFor(
        reader(),
        intent({
          canonical_operation: JSON.stringify({
            ...operation,
            kind: "FUND",
            methodName: "fund_mandate",
          }),
        }),
      ),
    ).rejects.toThrow();
    await expect(
      replacementEvidenceFor(reader(), intent({ anchor_height: "101" })),
    ).rejects.toThrow("CONFLICTING_INTENT_ANCHOR");
  });

  it("propagates RPC failure without turning absence into failure evidence", async () => {
    await expect(
      replacementEvidenceFor(reader({ fail: true }), intent()),
    ).rejects.toThrow("RPC_TIMEOUT");
  });
});
