import bs58 from "bs58";
import { expect, it } from "vitest";
import type { ChainOperation } from "../../packages/domain/src/settlement.js";
import { type Receipt, verifyReceipts } from "../../services/chain/receipts.js";

const h = (n: number) => bs58.encode(Buffer.alloc(32, n));
const operation: ChainOperation = {
  network: "testnet",
  signerId: "owner.testnet",
  receiverId: "vault.testnet",
  methodName: "authorize_and_execute",
  args: { mandate_id: "m", proposal_id: "p" },
  gas: "100000000000000",
  deposit: "1",
  mandateId: "m",
  policyDigest: "a".repeat(64),
  kind: "EXECUTE",
  expectedTransfer: {
    recipient: "vendor.testnet",
    amount: "10",
    evidenceDigest: "b".repeat(64),
  },
};
const call = (method_name: string, args: unknown) => ({
  FunctionCall: {
    method_name,
    args: Buffer.from(JSON.stringify(args)).toString("base64"),
    gas: operation.gas,
    deposit: operation.deposit,
  },
});
const outcome = (
  id: number,
  executor: string,
  ids: number[],
  status: Record<string, unknown> = { SuccessValue: "" },
) => ({
  id: h(id),
  block_hash: h(9),
  outcome: { executor_id: executor, receipt_ids: ids.map(h), status },
});
function fixture() {
  const raw = {
    final_execution_status: "FINAL",
    transaction: {
      hash: h(1),
      signer_id: operation.signerId,
      receiver_id: operation.receiverId,
      actions: [call(operation.methodName, operation.args)],
    },
    transaction_outcome: outcome(1, "owner.testnet", [2], {
      SuccessReceiptId: h(2),
    }),
    receipts_outcome: [
      outcome(2, "vault.testnet", [3, 4], { SuccessReceiptId: h(4) }),
      outcome(3, "vendor.testnet", []),
      outcome(4, "vault.testnet", [], {
        SuccessValue: Buffer.from("true").toString("base64"),
      }),
    ],
  };
  const receipt = (
    id: number,
    receiver: string,
    actions: unknown[],
    inputs: string[] = [],
    outputs: { data_id: string; receiver_id: string }[] = [],
  ): Receipt => ({
    receipt_id: h(id),
    predecessor_id: "vault.testnet",
    receiver_id: receiver,
    receipt: {
      Action: {
        actions,
        input_data_ids: inputs,
        output_data_receivers: outputs,
      },
    },
  });
  const bodies = [
    receipt(
      3,
      "vendor.testnet",
      [{ Transfer: { deposit: "10" } }],
      [],
      [{ data_id: h(8), receiver_id: "vault.testnet" }],
    ),
    receipt(
      4,
      "vault.testnet",
      [call("on_settlement_result", operation.args)],
      [h(8)],
    ),
  ];
  const state = {
    id: "p",
    mandate_id: "m",
    recipient: "vendor.testnet",
    amount: "10",
    evidence_digest: "b".repeat(64),
    outcome: "Succeeded",
  };
  return { raw, bodies, state };
}
it("requires finalized transfer plus authenticated successful callback and matching state", () => {
  const f = fixture();
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state).toBe(
    "CONFIRMED_SUCCESS",
  );
});
it.each(["recipient", "amount", "evidence_digest", "mandate_id"])(
  "rejects contract %s substitution",
  (field) => {
    const f = fixture();
    expect(
      verifyReceipts(f.raw, h(1), operation, f.bodies, {
        ...f.state,
        [field]: "changed",
      }).state,
    ).toBe("UNKNOWN");
  },
);
it("does not treat successful transaction as paid with missing callback", () => {
  const f = fixture();
  expect(
    verifyReceipts(f.raw, h(1), operation, f.bodies.slice(0, 1), f.state).state,
  ).toBe("UNKNOWN");
});
it("quarantines callback panic even when recipient received transfer", () => {
  const f = fixture();
  required(f.raw.receipts_outcome[2]).outcome.status = { Failure: {} };
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state).toBe(
    "UNKNOWN",
  );
});
it("recognizes definitive transfer failure only after successful false callback", () => {
  const f = fixture();
  required(f.raw.receipts_outcome[1]).outcome.status = { Failure: {} };
  required(f.raw.receipts_outcome[2]).outcome.status = {
    SuccessValue: Buffer.from("false").toString("base64"),
  };
  f.state.outcome = "ConfirmedFailed";
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state).toBe(
    "CONFIRMED_FAILED",
  );
});
it("rejects unrelated callback and missing descendants", () => {
  const f = fixture();
  required(f.bodies[1]).predecessor_id = "attacker.testnet";
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state).toBe(
    "UNKNOWN",
  );
  f.raw.receipts_outcome.pop();
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state).toBe(
    "UNKNOWN",
  );
});
it.each(["signer_id", "receiver_id"])(
  "rejects transaction %s mismatch",
  (field) => {
    const f = fixture();
    Object.assign(f.raw.transaction, { [field]: "attacker.testnet" });
    expect(
      verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state,
    ).toBe("UNKNOWN");
  },
);
it("rejects modified arguments and fabricated hashes", () => {
  const f = fixture();
  f.raw.transaction.actions = [
    call(operation.methodName, { mandate_id: "other", proposal_id: "p" }),
  ];
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state).toBe(
    "UNKNOWN",
  );
  expect(verifyReceipts(f.raw, h(7), operation, f.bodies, f.state).state).toBe(
    "UNKNOWN",
  );
});
it("never considers optimistic finality successful", () => {
  const f = fixture();
  f.raw.final_execution_status = "EXECUTED_OPTIMISTIC";
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state).toBe(
    "FINALIZING",
  );
});
it("repeated verification is deterministic and does not submit anything", () => {
  const f = fixture();
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state)).toEqual(
    verifyReceipts(f.raw, h(1), operation, f.bodies, f.state),
  );
});
it("rejects duplicated and unrelated outcome records", () => {
  const f = fixture();
  f.raw.receipts_outcome.push(required(f.raw.receipts_outcome[0]));
  expect(verifyReceipts(f.raw, h(1), operation, f.bodies, f.state).state).toBe(
    "UNKNOWN",
  );
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Required evidence missing");
  return value;
}
