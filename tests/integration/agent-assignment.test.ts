import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { assignedMandateView } from "../../apps/api/src/agents/routes.js";
import {
  canonicalPolicy,
  mandatePolicy,
} from "../../packages/domain/src/index.js";

const policy = mandatePolicy.parse({
  schemaVersion: 1,
  policyVersion: 1,
  mandateId: randomUUID(),
  organizationId: randomUUID(),
  ownerAccount: "demo-testing.testnet",
  network: "testnet",
  agentId: randomUUID(),
  agentAccount: "lapobaby.testnet",
  vaultAccount: "avroqen-vault.testnet",
  recipient: "equipment.testnet",
  asset: "NativeNear",
  taskReference: "Testnet Equipment Purchase — Acceptance Test 2",
  maxPerPaymentAtomic: "100000000000000000000000",
  totalBudgetAtomic: "100000000000000000000000",
  expiresAtNs: "1893456000000000000",
  maxExecutions: 1,
  verifierPolicy: {
    version: 1,
    accounts: ["verifier.testnet"],
    threshold: 1,
    requiredClaims: ["SERVICE_CONFIRMED"],
    requireOwnerApproval: true,
  },
});
const canonical = canonicalPolicy(policy);
const row = {
  id: policy.mandateId,
  canonical_policy: canonical,
  policy_digest: createHash("sha256").update(canonical).digest("hex"),
  org_id: policy.organizationId,
  owner_account: policy.ownerAccount,
  agent_id: policy.agentId,
  agent_account: policy.agentAccount,
  network: policy.network,
  status: "CONSENT_APPROVED_OFFCHAIN",
  organization_name: "Demo-vault",
  expired: false,
  disabled_at: null,
  registered_agent_account: policy.agentAccount,
};

it("projects only the assigned mandate terms and safe status needed by the agent", () => {
  const view = assignedMandateView(row);
  expect(view).toEqual({
    policy,
    policyDigest: row.policy_digest,
    consentStatus: "CONSENT_APPROVED_OFFCHAIN",
    onchainStatus: "NOT_SUBMITTED",
    expired: false,
    agentDisabled: false,
    verifierPolicyStatus: { eligible: true, conflict: null },
    organizationName: "Demo-vault",
  });
  expect(view).not.toHaveProperty("memberships");
  expect(view).not.toHaveProperty("credentials");
});

it.each([
  ["agent_account", "attacker.testnet"],
  ["org_id", randomUUID()],
  ["owner_account", "attacker.testnet"],
  ["policy_digest", "0".repeat(64)],
])("rejects assignment row tampering in %s", (field, value) => {
  expect(() => assignedMandateView({ ...row, [field]: value })).toThrow(
    "POLICY_INTEGRITY_FAILED",
  );
});
