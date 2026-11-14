import bs58 from "bs58";
import { expect, it } from "vitest";
import { type Intent, observe } from "../../services/chain/reconcile.js";
import { NearReader, UnknownBlock } from "../../services/chain/rpc.js";

const h = (n: number) => bs58.encode(Buffer.alloc(32, n));
const op = {
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
const intent: Intent = {
  id: "fixture",
  canonical_operation: JSON.stringify(op),
  manifest: {
    account: "vault.testnet",
    network: "testnet",
    wasmSha256: "a".repeat(64),
    keyFingerprints: ["b".repeat(64)],
    authorization: "fixture-authorization",
  },
  reported_hash: null,
  verified_hash: null,
  scan_height: "1",
  scan_hash: h(1),
  anchor_height: "1",
  anchor_hash: h(1),
  last_height: null,
  last_block_hash: null,
  state: "UNKNOWN",
  reason: "WALLET_OUTCOME_UNKNOWN",
};
class ScanReader extends NearReader {
  multiple = false;
  outage = false;
  conflict = false;
  found = false;
  chunkOutageAt: number | undefined;
  chunkCalls: number[] = [];
  candidates: string[] = [];
  override async transactionCandidates() {
    return this.candidates;
  }
  override async deployment() {
    return {
      block: { height: 3, hash: h(3), prev_hash: h(2), timestamp_nanosec: "3" },
      account: {
        block_hash: h(3),
        code_hash: h(9),
        amount: "1",
        storage_usage: 1,
      },
      accounting: { network: "testnet" as const, vault: "vault.testnet" },
    };
  }
  override async block(id?: string | number) {
    const height =
      typeof id === "string" ? (bs58.decode(id)[0] ?? 0) : Number(id ?? 3);
    if (this.outage) throw new Error("outage");
    return {
      header: {
        height,
        hash: h(height),
        prev_hash: h(this.conflict ? 9 : height - 1),
        timestamp_nanosec: String(height),
      },
      chunks: [{ chunk_hash: h(height) }],
    };
  }
  override async historicalChunk(chunkHash: string) {
    const height = bs58.decode(chunkHash)[0] ?? 0;
    this.chunkCalls.push(height);
    if (height === this.chunkOutageAt) throw new Error("chunk outage");
    return {
      header: { chunk_hash: chunkHash, height_included: height },
      transactions:
        this.found && height === 2
          ? [
              {
                hash: h(7),
                signer_id: op.signerId,
                receiver_id: op.receiverId,
                actions: [
                  {
                    FunctionCall: {
                      method_name: op.methodName,
                      args: Buffer.from(JSON.stringify(op.args)).toString(
                        "base64",
                      ),
                      gas: op.gas,
                      deposit: op.deposit,
                    },
                  },
                ],
              },
              ...(this.multiple
                ? [
                    {
                      hash: h(8),
                      signer_id: op.signerId,
                      receiver_id: op.receiverId,
                      actions: [
                        {
                          FunctionCall: {
                            method_name: op.methodName,
                            args: Buffer.from(JSON.stringify(op.args)).toString(
                              "base64",
                            ),
                            gas: op.gas,
                            deposit: op.deposit,
                          },
                        },
                      ],
                    },
                  ]
                : []),
            ]
          : [],
    };
  }
  override async rpc(_method?: string, _params?: unknown): Promise<unknown> {
    return {
      final_execution_status: "INCLUDED",
      transaction: {
        hash: h(7),
        signer_id: op.signerId,
        receiver_id: op.receiverId,
        actions: [
          {
            FunctionCall: {
              method_name: op.methodName,
              args: Buffer.from(JSON.stringify(op.args)).toString("base64"),
              gas: op.gas,
              deposit: op.deposit,
            },
          },
        ],
      },
      transaction_outcome: {
        id: h(7),
        block_hash: h(2),
        outcome: {
          executor_id: op.signerId,
          receipt_ids: [],
          status: { Unknown: null },
        },
      },
      receipts_outcome: [],
    };
  }
}
it("advances a contiguous finalized scan without declaring failure when no hash exists", async () => {
  expect(await observe(new ScanReader(), intent)).toMatchObject({
    state: "UNKNOWN",
    reason: "HASH_NOT_RECOVERED",
    scanHeight: 3,
    scanHash: h(3),
  });
});
it("advances past block-header chunks with the canonical empty transaction root", async () => {
  class EmptyTransactionChunks extends ScanReader {
    override async block(id?: string | number) {
      const block = await super.block(id);
      return {
        ...block,
        chunks: block.chunks.map((chunk) => ({
          ...chunk,
          height_included: block.header.height,
          tx_root: "11111111111111111111111111111111",
        })),
      };
    }
  }
  const reader = new EmptyTransactionChunks();
  expect(await observe(reader, intent)).toMatchObject({
    state: "UNKNOWN",
    reason: "HASH_NOT_RECOVERED",
    scanHeight: 3,
    scanHash: h(3),
  });
  expect(reader.chunkCalls).toEqual([]);
});
it("recovers an exact operation hash but waits for final receipts", async () => {
  const r = new ScanReader();
  r.found = true;
  expect(await observe(r, intent)).toMatchObject({
    state: "FINALIZING",
    reason: "WAITING_FINALITY",
    verifiedHash: h(7),
  });
});
it("queries an exact known hash and signer before deployment verification", async () => {
  const steps: string[] = [];
  class KnownHashReader extends ScanReader {
    override async rpc(method?: string, params?: unknown) {
      steps.push(method ?? "missing");
      expect(params).toEqual({
        tx_hash: h(7),
        sender_account_id: op.signerId,
        wait_until: "NONE",
      });
      return super.rpc();
    }
    override async deployment() {
      steps.push("deployment");
      return super.deployment();
    }
  }
  await expect(
    observe(new KnownHashReader(), { ...intent, reported_hash: h(7) }),
  ).resolves.toMatchObject({
    state: "FINALIZING",
    verifiedHash: h(7),
  });
  expect(steps.slice(0, 2)).toEqual(["EXPERIMENTAL_tx_status", "deployment"]);
});
it("confirms an indexed candidate only after exact finalized receipt evidence", async () => {
  const operation = {
      ...op,
      kind: "REGISTER",
      methodName: "register_mandate",
    },
    actions = [
      {
        FunctionCall: {
          method_name: operation.methodName,
          args: Buffer.from(JSON.stringify(operation.args)).toString("base64"),
          gas: operation.gas,
          deposit: operation.deposit,
        },
      },
    ],
    receipt = h(6);
  class FinalizedReader extends ScanReader {
    override async rpc(method?: string, params?: unknown) {
      expect(method).toBe("EXPERIMENTAL_tx_status");
      expect(params).toEqual({
        tx_hash: h(7),
        sender_account_id: operation.signerId,
        wait_until: "NONE",
      });
      return {
        final_execution_status: "FINAL",
        transaction: {
          hash: h(7),
          signer_id: operation.signerId,
          receiver_id: operation.receiverId,
          actions,
        },
        transaction_outcome: {
          id: h(7),
          block_hash: h(2),
          outcome: {
            executor_id: operation.signerId,
            receipt_ids: [receipt],
            status: { SuccessReceiptId: receipt },
          },
        },
        receipts_outcome: [
          {
            id: receipt,
            block_hash: h(2),
            outcome: {
              executor_id: operation.receiverId,
              receipt_ids: [],
              status: { SuccessValue: "" },
            },
          },
        ],
        receipts: [
          {
            receipt_id: receipt,
            predecessor_id: operation.signerId,
            receiver_id: operation.receiverId,
            receipt: {
              Action: {
                actions,
                input_data_ids: [],
                output_data_receivers: [],
              },
            },
          },
        ],
      };
    }
    override async deployment(_manifest?: unknown, at?: string) {
      const height = at ? 2 : 3;
      return {
        block: {
          height,
          hash: h(height),
          prev_hash: h(height - 1),
          timestamp_nanosec: String(height),
        },
        account: {
          block_hash: h(height),
          code_hash: h(9),
          amount: "1",
          storage_usage: 1,
        },
        accounting: { network: "testnet" as const, vault: "vault.testnet" },
      };
    }
  }
  const reader = new FinalizedReader();
  reader.candidates = [h(7)];
  await expect(
    observe(reader, {
      ...intent,
      canonical_operation: JSON.stringify(operation),
    }),
  ).resolves.toMatchObject({
    state: "CONFIRMED_SUCCESS",
    reason: "CALL_FINALIZED",
    verifiedHash: h(7),
    receiptIds: [receipt],
    blockHash: h(3),
  });
});
it("rejects a known-hash transaction mismatch before expensive verification", async () => {
  let deploymentCalls = 0;
  class MismatchReader extends ScanReader {
    override async rpc() {
      const raw = (await super.rpc()) as {
        transaction: { receiver_id: string };
      };
      raw.transaction.receiver_id = "attacker.testnet";
      return raw;
    }
    override async deployment() {
      deploymentCalls++;
      return super.deployment();
    }
  }
  await expect(
    observe(new MismatchReader(), { ...intent, reported_hash: h(7) }),
  ).resolves.toEqual({
    state: "UNKNOWN",
    reason: "TRANSACTION_MISMATCH",
  });
  expect(deploymentCalls).toBe(0);
});
it("quarantines ambiguous multiple matching transactions", async () => {
  const r = new ScanReader();
  r.found = true;
  r.multiple = true;
  expect(await observe(r, intent)).toMatchObject({
    state: "UNKNOWN",
    reason: "AMBIGUOUS_TRANSACTIONS",
  });
});
it("does not advance the scan through missing or conflicting history", async () => {
  const r = new ScanReader();
  r.conflict = true;
  await expect(observe(r, intent)).rejects.toThrow("MISSING_BLOCK_HISTORY");
  r.outage = true;
  await expect(observe(r, intent)).rejects.toThrow("outage");
});
it("retries the same batch after a chunk failure without returning a checkpoint", async () => {
  const r = new ScanReader();
  r.chunkOutageAt = 3;
  await expect(observe(r, intent)).rejects.toThrow("chunk outage");
  await expect(observe(r, intent)).rejects.toThrow("chunk outage");
  expect(r.chunkCalls).toEqual([2, 3, 2, 3]);
});
it("advances a hashless scan after a transient historical chunk failure", async () => {
  class RecoveringReader extends ScanReader {
    attempts = 0;
    override async historicalChunk(chunkHash: string) {
      if (++this.attempts === 1) throw new Error("RPC_RATE_LIMITED");
      return super.historicalChunk(chunkHash);
    }
  }
  const reader = new RecoveringReader();
  await expect(observe(reader, intent)).rejects.toThrow("RPC_RATE_LIMITED");
  await expect(observe(reader, intent)).resolves.toMatchObject({
    state: "UNKNOWN",
    reason: "HASH_NOT_RECOVERED",
    scanHeight: 3,
    scanHash: h(3),
  });
  expect(reader.attempts).toBe(3);
});
it("uses an untrusted index only to discover an exactly matching transaction", async () => {
  const r = new ScanReader();
  r.candidates = [h(7)];
  expect(await observe(r, intent)).toMatchObject({
    state: "FINALIZING",
    reason: "WAITING_FINALITY",
    reportedHash: h(7),
    verifiedHash: h(7),
  });
  expect(r.chunkCalls).toEqual([]);
});

it("ignores a forged index candidate and retains the complete chunk scan", async () => {
  const r = new ScanReader();
  r.candidates = [h(8)];
  expect(await observe(r, intent)).toMatchObject({
    state: "UNKNOWN",
    reason: "HASH_NOT_RECOVERED",
    scanHeight: 3,
  });
  expect(r.chunkCalls).toEqual([2, 3]);
});
it("rejects stale or same-height conflicting finalized projections", async () => {
  await expect(
    observe(new ScanReader(), {
      ...intent,
      last_height: "4",
      last_block_hash: h(4),
    }),
  ).rejects.toThrow("STALE_RPC");
  await expect(
    observe(new ScanReader(), {
      ...intent,
      last_height: "3",
      last_block_hash: h(9),
    }),
  ).rejects.toThrow("CONFLICTING_RPC");
});

it("skips an explicitly absent block height only when the next real block links to the prior block", async () => {
  class Skipped extends ScanReader {
    override async block(id?: string | number) {
      if (id === 2) throw new UnknownBlock("UNKNOWN_BLOCK");
      const b = await super.block(id);
      if (b.header.height === 3) b.header.prev_hash = h(1);
      return b;
    }
  }
  expect(await observe(new Skipped(), intent)).toMatchObject({
    state: "UNKNOWN",
    scanHeight: 3,
    scanHash: h(3),
  });
  class MissingExisting extends ScanReader {
    override async block(id?: string | number) {
      if (id === 2) throw new UnknownBlock("UNKNOWN_BLOCK");
      return super.block(id);
    }
  }
  await expect(observe(new MissingExisting(), intent)).rejects.toThrow(
    "MISSING_BLOCK_HISTORY",
  );
});

it.each(["2", "3"])(
  "rejects identical historical transactions at or before intent anchor %s",
  async (height) => {
    const result = await observe(new ScanReader(), {
      ...intent,
      reported_hash: h(7),
      anchor_height: height,
    });
    expect(result).toEqual({
      state: "UNKNOWN",
      reason: "TRANSACTION_PREDATES_INTENT",
    });
  },
);

it("rejects a changed finalized intent anchor before promoting a hash", async () => {
  await expect(
    observe(new ScanReader(), {
      ...intent,
      reported_hash: h(7),
      anchor_hash: h(9),
    }),
  ).rejects.toThrow("CONFLICTING_INTENT_ANCHOR");
});
