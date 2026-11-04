import type { MandatePolicy, MandateView } from "@avroqen/domain";
import type { VaultMandate } from "../../../../../packages/domain/src/vault";
export type DashboardObservation = {
  policy: MandatePolicy;
  onchain: VaultMandate | null;
  block: { height: number } | null;
  intents: {
    id: string;
    state: string;
    operation: { kind?: string; methodName: string };
    explorerUrl: string | null;
  }[];
  proposals: { proposalId: string; amountAtomic?: string }[];
  onchainProposals?: Record<
    string,
    {
      outcome: string;
      amount?: string;
      attestations: { signer: string; claim: string; expires_at_ns: string }[];
    }
  >;
};
export const unresolvedStates = [
  "UNKNOWN",
  "AWAITING_WALLET",
  "BROADCAST_REPORTED",
  "SUBMITTED",
  "FINALIZING",
];
export function nextAction(
  d?: DashboardObservation,
  consent?: MandateView,
  now = BigInt(Date.now()) * 1000000n,
) {
  if (!d)
    return {
      label: "State unavailable",
      action: "Refresh verified state",
      route: "settlement",
      description:
        "No completion is inferred. Review current state before any wallet action.",
    };
  if (d.intents.some((i) => unresolvedStates.includes(i.state)))
    return {
      label: "Pending onchain",
      action: "Inspect pending operations",
      route: "settlement",
      description:
        "Reconciliation must establish this operation’s outcome before another attempt.",
    };
  if (
    consent?.consentStatus === "CONSENT_REVOKED_OFFCHAIN" ||
    ["Paused", "Revoked"].includes(d.onchain?.status ?? "")
  )
    return {
      label: "Paused / revoked",
      action: "Review mandate status",
      route: "settlement",
      description:
        "No new payment should be attempted. Offchain revocation is not an onchain revoke.",
    };
  if (consent?.consentStatus === "DRAFT")
    return {
      label: "Awaiting consent",
      action: "Review mandate terms",
      route: "mandates",
      description:
        "Original owner must review immutable terms and sign offchain consent.",
    };
  if (consent?.agentDisabled || BigInt(d.policy.expiresAtNs) <= now)
    return {
      label: "Access unavailable",
      action: "Review mandate",
      route: "mandates",
      description:
        "The agent is disabled or the policy expired. Existing financial obligations remain protected.",
    };
  if (!d.block)
    return {
      label: "Chain state unavailable",
      action: "Check deployment status",
      route: "settlement",
      description:
        "Registration and funding cannot be confirmed from the current observation.",
    };
  if (!d.onchain)
    return {
      label: "Awaiting registration",
      action: "Review registration",
      route: "settlement",
      description:
        "No mandate found at the observed finalized block. Registration needs the original owner's wallet.",
    };
  if (BigInt(d.onchain.available) === 0n)
    return {
      label: "Awaiting funding",
      action: "Review funding",
      route: "settlement",
      description:
        "The observed available allocation is zero. Budget terms alone do not fund a mandate.",
    };
  const proposals = Object.values(d.onchainProposals ?? {}).filter(
    (p) => p.outcome === "Proposed",
  );
  if (!proposals.length)
    return {
      label: "Awaiting agent",
      action: "Review agent proposals",
      route: "proposals",
      description:
        "An eligible proposal must be submitted by the assigned agent before verification.",
    };
  const hasClaims = proposals.filter((p) =>
    d.policy.verifierPolicy.requiredClaims.every(
      (claim) =>
        new Set(
          p.attestations
            .filter(
              (a) =>
                a.claim === claim &&
                d.policy.verifierPolicy.accounts.includes(a.signer) &&
                BigInt(a.expires_at_ns) > now,
            )
            .map((a) => a.signer),
        ).size >= d.policy.verifierPolicy.threshold,
    ),
  );
  if (!hasClaims.length)
    return {
      label: "Awaiting verification",
      action: "Verify evidence",
      route: "evidence",
      description:
        "Designated verifiers must independently check each required claim and sign a separate onchain attestation.",
    };
  if (
    d.policy.verifierPolicy.requireOwnerApproval &&
    !hasClaims.some((p) =>
      p.attestations.some(
        (a) =>
          a.claim === "OWNER_APPROVED" &&
          a.signer === d.policy.ownerAccount &&
          BigInt(a.expires_at_ns) > now,
      ),
    )
  )
    return {
      label: "Awaiting owner approval",
      action: "Review payment approval",
      route: "settlement",
      description:
        "A distinct original-owner per-payment attestation is still required. Mandate consent cannot substitute.",
    };
  return {
    label: "Ready for execution review",
    action: "Review transaction",
    route: "settlement",
    description:
      "Observed claims are present. The owner, API and contract must still check exact amounts, available funds, execution limits and current permissions. This is not authorization.",
  };
}
