import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  boundMandate,
  vaultMandateState,
} from "../../packages/domain/src/chain-state.js";
import { canonicalPolicy } from "../../packages/domain/src/index.js";

const policy = JSON.parse(
  readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8"),
);
const state = {
  policy,
  policy_digest: "a".repeat(64),
  guardian: null,
  status: "Active",
  available: "600",
  reserved: "100",
  spent: "100",
  withdrawal_pending: "100",
  withdrawn: "100",
  deposited: "1000",
  pending_count: 1,
  successful_count: 1,
  proposal_count: 2,
  storage_limit: "100",
  storage_used: "50",
};
it("accepts exact conserved finalized mandate snapshots", () => {
  expect(
    boundMandate(state, canonicalPolicy(policy), "a".repeat(64)).available,
  ).toBe("600");
});
it.each([
  { available: "601" },
  { spent: "900" },
  { pending_count: 3 },
  { storage_used: "101" },
  { deposited: (1n << 128n).toString() },
])("rejects impossible accounting snapshot %j", (change) => {
  expect(vaultMandateState.safeParse({ ...state, ...change }).success).toBe(
    false,
  );
});
it("rejects a different policy even when a claimed digest matches", () => {
  expect(() =>
    boundMandate(
      { ...state, policy: { ...policy, recipient: "attacker.testnet" } },
      canonicalPolicy(policy),
      "a".repeat(64),
    ),
  ).toThrow();
});
