import { describe, expect, it } from "vitest";
import {
  atomicToNear,
  canonicalPolicy,
  mandateDraftInput,
  mandatePolicy,
  nearToAtomic,
} from "../../packages/domain/src/index.js";

const terms = {
  vaultAccount: "vault.testnet",
  agentId: "00000000-0000-4000-8000-000000000001",
  recipient: "vendor.testnet",
  asset: "NativeNear",
  taskReference: "Hosting November",
  maxPerPaymentAtomic: "1000000000000000000000000",
  totalBudgetAtomic: "3000000000000000000000000",
  expiresAtNs: "1800000000000000000",
  maxExecutions: 3,
  verifierPolicy: {
    version: 1,
    accounts: ["verifier.testnet"],
    threshold: 1,
    requiredClaims: ["SERVICE_CONFIRMED"],
    requireOwnerApproval: true,
  },
};
const policy = {
  ...terms,
  schemaVersion: 1,
  policyVersion: 1,
  mandateId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000003",
  ownerAccount: "alice.testnet",
  network: "testnet",
  agentAccount: "agent.testnet",
};
describe("M2 exact typed policies", () => {
  it("canonicalizes property/set order and binds every field", () => {
    const p = mandatePolicy.parse(policy);
    expect(canonicalPolicy(p)).toBe(
      canonicalPolicy(Object.fromEntries(Object.entries(p).reverse())),
    );
    for (const [field, value] of Object.entries({
      recipient: "other.testnet",
      ownerAccount: "bob.testnet",
      network: "mainnet",
      vaultAccount: "other.testnet",
      totalBudgetAtomic: "4000000000000000000000000",
      taskReference: "Another task",
      expiresAtNs: "1810000000000000000",
      maxExecutions: 4,
    })) {
      expect(canonicalPolicy({ ...p, [field]: value })).not.toBe(
        canonicalPolicy(p),
      );
    }
    const v = {
      ...p,
      verifierPolicy: {
        ...p.verifierPolicy,
        accounts: ["z.testnet", "a.testnet"],
        threshold: 2,
      },
    };
    expect(canonicalPolicy(v)).toBe(
      canonicalPolicy({
        ...v,
        verifierPolicy: {
          ...v.verifierPolicy,
          accounts: ["a.testnet", "z.testnet"],
        },
      }),
    );
  });
  it.each([
    "0",
    "-1",
    "+1",
    "01",
    "1.2",
    "1e24",
    " 1",
    "1 ",
    (1n << 128n).toString(),
  ])("rejects invalid atomic amount %s", (value) => {
    expect(
      mandateDraftInput.safeParse({ ...terms, maxPerPaymentAtomic: value })
        .success,
    ).toBe(false);
  });
  it("rejects overflow, inconsistent budgets, empty policy and privilege injection", () => {
    for (const change of [
      { ownerAccount: "bob.testnet" },
      { maxPerPaymentAtomic: "4000000000000000000000000" },
      { expiresAtNs: (1n << 64n).toString() },
      { maxExecutions: 4294967296 },
      { maxExecutions: 1.5 },
      { verifierPolicy: { ...terms.verifierPolicy, accounts: [] } },
      { verifierPolicy: { ...terms.verifierPolicy, threshold: 2 } },
      {
        verifierPolicy: {
          ...terms.verifierPolicy,
          accounts: ["a.testnet", "a.testnet"],
        },
      },
      {
        verifierPolicy: {
          ...terms.verifierPolicy,
          requiredClaims: ["OWNER_APPROVED"],
        },
      },
    ]) {
      expect(mandateDraftInput.safeParse({ ...terms, ...change }).success).toBe(
        false,
      );
    }
  });
  it("converts exact decimal NEAR without floating point", () => {
    expect(nearToAtomic("1.000000000000000000000001")).toBe(
      "1000000000000000000000001",
    );
    expect(atomicToNear("1000000000000000000000001")).toBe(
      "1.000000000000000000000001",
    );
    expect(nearToAtomic("0.000000000000000000000001")).toBe("1");
    for (const bad of ["1e3", "-1", "01", " 1", "0.0000000000000000000000001"])
      expect(() => nearToAtomic(bad)).toThrow();
  });
});
