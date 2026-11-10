import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  canonicalPolicy,
  mandatePolicy,
} from "../../packages/domain/src/index.js";
import {
  buildOperation,
  operationInput,
} from "../../packages/domain/src/settlement.js";

const policy = mandatePolicy.parse(
  JSON.parse(readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8")),
);
const policyDigest = createHash("sha256")
  .update(canonicalPolicy(policy))
  .digest("hex");
const context = { policy, policyDigest, actor: policy.ownerAccount, now: 1n };
it("builds only the exact owner register method and binds canonical policy", () => {
  const t = buildOperation({ kind: "REGISTER", storageLimit: "100" }, context);
  expect(t.signerId).toBe(policy.ownerAccount);
  expect(t.receiverId).toBe(policy.vaultAccount);
  expect(t.deposit).toBe("1");
  expect(t.args).toEqual({
    canonical_policy: canonicalPolicy(policy),
    expected_digest: policyDigest,
    guardian: null,
    storage_limit: "100",
  });
});
it.each(["TRANSFER", "new", "on_settlement_result", "delete_key"])(
  "rejects arbitrary operation %s",
  (kind) => {
    expect(operationInput.safeParse({ kind }).success).toBe(false);
  },
);
it.each(["0", "01", "1.1", "1e24", "-1", (1n << 128n).toString()])(
  "rejects unsafe amount %s",
  (amount) => {
    expect(operationInput.safeParse({ kind: "FUND", amount }).success).toBe(
      false,
    );
  },
);
it.each(["FUND", "WITHDRAW", "STORAGE_DEPOSIT", "WITHDRAW_STORAGE"])(
  "requires original owner for %s",
  (kind) => {
    expect(() =>
      buildOperation(
        { kind, amount: "1" },
        { ...context, actor: "attacker.testnet" },
      ),
    ).toThrow();
  },
);
it("rejects account/network substitution and expired financial permissions", () => {
  expect(() =>
    buildOperation(
      { kind: "REGISTER", storageLimit: "1" },
      { ...context, policy: { ...policy, network: "mainnet" } as never },
    ),
  ).toThrow();
  expect(() =>
    buildOperation(
      { kind: "FUND", amount: "1" },
      { ...context, now: BigInt(policy.expiresAtNs) },
    ),
  ).toThrow();
  expect(
    buildOperation(
      { kind: "WITHDRAW", amount: "1" },
      { ...context, now: BigInt(policy.expiresAtNs) },
    ).methodName,
  ).toBe("withdraw_available");
});
it("does not accept caller supplied transaction parameters", () => {
  expect(
    operationInput.safeParse({
      kind: "FUND",
      amount: "1",
      receiverId: "attacker.testnet",
    }).success,
  ).toBe(false);
});
it.each([
  ["owner", policy.ownerAccount],
  ["agent", policy.agentAccount],
  ["recipient", policy.recipient],
  ["vault", policy.vaultAccount],
] as const)(
  "blocks new authorization operations for %s verifier overlap",
  (_role, account) => {
    const unsafe = {
      ...policy,
      verifierPolicy: { ...policy.verifierPolicy, accounts: [account] },
    };
    expect(() =>
      buildOperation(
        { kind: "REGISTER", storageLimit: "100" },
        { ...context, policy: unsafe },
      ),
    ).toThrow("UNSAFE_VERIFIER_POLICY");
    expect(() =>
      buildOperation(
        { kind: "WITHDRAW", amount: "1" },
        { ...context, policy: unsafe },
      ),
    ).toThrow("UNSAFE_VERIFIER_POLICY");
  },
);
it("binds agent proposal and owner execution to exact immutable M4 terms", () => {
  const proposal = {
    schemaVersion: 1 as const,
    proposalId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
    organizationId: policy.organizationId,
    agentId: policy.agentId,
    agentAccount: policy.agentAccount,
    mandateId: policy.mandateId,
    policyVersion: 1 as const,
    policyDigest,
    network: "testnet" as const,
    vaultAccount: policy.vaultAccount,
    recipient: policy.recipient,
    asset: "NativeNear" as const,
    amountAtomic: "100",
    evidenceDigest: "b".repeat(64),
  };
  const input = { kind: "PROPOSE", proposalId: proposal.proposalId };
  expect(
    buildOperation(input, { ...context, actor: policy.agentAccount, proposal })
      .deposit,
  ).toBe("0");
  expect(() => buildOperation(input, { ...context, proposal })).toThrow(
    "AGENT_REQUIRED",
  );
  for (const changed of [
    { recipient: "attacker.testnet" },
    { network: "mainnet" as never },
    { policyDigest: "c".repeat(64) },
    { amountAtomic: "401" },
    { policyVersion: 2 as never },
  ])
    expect(() =>
      buildOperation(input, {
        ...context,
        actor: policy.agentAccount,
        proposal: { ...proposal, ...changed },
      }),
    ).toThrow();
  expect(
    buildOperation(
      { kind: "EXECUTE", proposalId: proposal.proposalId },
      { ...context, proposal },
    ).expectedTransfer,
  ).toEqual({
    recipient: policy.recipient,
    amount: "100",
    evidenceDigest: proposal.evidenceDigest,
  });
  expect(() =>
    buildOperation(
      { kind: "EXECUTE", proposalId: proposal.proposalId },
      { ...context, actor: policy.agentAccount, proposal },
    ),
  ).toThrow("OWNER_REQUIRED");
});
