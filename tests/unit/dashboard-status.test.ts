import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type DashboardObservation,
  nextAction,
} from "../../apps/web/app/workspace/journey/status";

const policy = JSON.parse(
  readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8"),
);
const now = 1n;
function observation(): DashboardObservation {
  return {
    policy,
    block: { height: 1 },
    onchain: {
      available: "10",
      status: "Active",
    } as DashboardObservation["onchain"],
    intents: [],
    proposals: [{ proposalId: "fixture" }],
    onchainProposals: {
      fixture: { outcome: "Proposed", amount: "1", attestations: [] },
    },
  };
}
describe("advisory dashboard progress", () => {
  it("never presents offchain records or missing chain observations as settled", () => {
    const d = observation();
    d.onchain = null;
    d.block = null;
    expect(nextAction(d, undefined, now).label).toBe("Chain state unavailable");
    expect(nextAction(undefined).label).toBe("State unavailable");
    expect(
      nextAction({ ...d, block: { height: 2 } }, undefined, now).label,
    ).toBe("Awaiting registration");
  });
  it("prioritizes unknown outcomes over approvals and never recommends a retry", () => {
    const d = observation();
    d.intents = [
      {
        id: "fixture",
        state: "UNKNOWN",
        operation: { methodName: "authorize_and_execute" },
        explorerUrl: null,
      },
    ];
    expect(nextAction(d, undefined, now).label).toBe("Pending onchain");
  });
  it("requires each claim quorum and distinct original-owner approval", () => {
    const d = observation();
    d.policy = {
      ...policy,
      verifierPolicy: {
        ...policy.verifierPolicy,
        accounts: ["verifier.testnet"],
        threshold: 1,
        requiredClaims: ["SERVICE_CONFIRMED"],
        requireOwnerApproval: true,
      },
    };
    const p = d.onchainProposals?.fixture;
    if (!p) throw new Error("fixture");
    expect(nextAction(d, undefined, now).label).toBe("Awaiting verification");
    p.attestations = [
      {
        signer: "attacker.testnet",
        claim: "SERVICE_CONFIRMED",
        expires_at_ns: "100",
      },
    ];
    expect(nextAction(d, undefined, now).label).toBe("Awaiting verification");
    p.attestations = [
      {
        signer: "verifier.testnet",
        claim: "SERVICE_CONFIRMED",
        expires_at_ns: "100",
      },
    ];
    expect(nextAction(d, undefined, now).label).toBe("Awaiting owner approval");
    p.attestations.push({
      signer: policy.ownerAccount,
      claim: "OWNER_APPROVED",
      expires_at_ns: "100",
    });
    expect(nextAction(d, undefined, now).label).toBe(
      "Ready for execution review",
    );
    expect(nextAction(d, undefined, 101n).label).toBe("Awaiting verification");
  });
  it("does not count duplicated verifier identities toward quorum", () => {
    const d = observation();
    d.policy = {
      ...policy,
      verifierPolicy: {
        ...policy.verifierPolicy,
        accounts: ["a.testnet", "b.testnet"],
        threshold: 2,
        requiredClaims: ["SERVICE_CONFIRMED"],
        requireOwnerApproval: false,
      },
    };
    if (!d.onchainProposals?.fixture) throw new Error("fixture");
    d.onchainProposals.fixture.attestations = Array(2).fill({
      signer: "a.testnet",
      claim: "SERVICE_CONFIRMED",
      expires_at_ns: "100",
    });
    expect(nextAction(d, undefined, now).label).toBe("Awaiting verification");
  });
});
