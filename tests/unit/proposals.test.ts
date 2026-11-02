import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { runtimeTool } from "../../packages/agent/src/runtime.js";
import {
  proposalInput,
  toVaultProposal,
} from "../../packages/domain/src/proposals.js";

const proposal = {
  schemaVersion: 1,
  proposalId: randomUUID(),
  idempotencyKey: randomUUID(),
  organizationId: randomUUID(),
  agentId: randomUUID(),
  agentAccount: "agent.testnet",
  mandateId: randomUUID(),
  policyVersion: 1,
  policyDigest: "a".repeat(64),
  network: "testnet",
  vaultAccount: "vault.testnet",
  recipient: "vendor.testnet",
  asset: "NativeNear",
  amountAtomic: "1",
  evidenceDigest: "b".repeat(64),
};
it.each(["1.1", "1e2", "NaN", "-1", "0", "01", (1n << 128n).toString()])(
  "safely rejects amount %s",
  (amountAtomic) => {
    expect(proposalInput.safeParse({ ...proposal, amountAtomic }).success).toBe(
      false,
    );
  },
);
it("keeps exact u128 upper bound and builds only actual M3 arguments", () => {
  const p = proposalInput.parse({
    ...proposal,
    amountAtomic: ((1n << 128n) - 1n).toString(),
  });
  expect(toVaultProposal(p)).toEqual({
    mandate_id: p.mandateId,
    proposal_id: p.proposalId,
    recipient: p.recipient,
    amount: p.amountAtomic,
    evidence_digest: p.evidenceDigest,
  });
});
it.each([
  "transfer",
  "withdraw",
  "attest",
  "execute",
  "sign",
  "shell",
  "fetch",
  "__proto__",
])("rejects runtime tool %s", (tool) => {
  expect(runtimeTool.safeParse({ tool }).success).toBe(false);
});
it("rejects caller-supplied authority, credentials and unbounded task text", () => {
  expect(
    runtimeTool.safeParse({
      tool: "prepare",
      task: {
        description: "x".repeat(1001),
        amountAtomic: "1",
        evidenceDigest: "a".repeat(64),
        proposalId: randomUUID(),
        idempotencyKey: randomUUID(),
      },
    }).success,
  ).toBe(false);
  expect(
    runtimeTool.safeParse({ tool: "mandate_summary", token: "secret" }).success,
  ).toBe(false);
  expect(proposalInput.safeParse({ ...proposal, verified: true }).success).toBe(
    false,
  );
});
