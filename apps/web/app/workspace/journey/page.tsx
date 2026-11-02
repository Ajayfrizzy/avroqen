"use client";
import { atomicToNear, type MandatePolicy } from "@avroqen/domain";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { VaultMandate } from "../../../../../packages/domain/src/vault";

type Observation = {
  policy: MandatePolicy;
  onchain: VaultMandate | null;
  block: { height: number } | null;
  intents: {
    id: string;
    state: string;
    operation: { methodName: string };
    explorerUrl: string | null;
  }[];
  proposals: { proposalId: string }[];
};
export default function Journey() {
  const [account, setAccount] = useState("");
  const [mandates, setMandates] = useState<MandatePolicy[]>([]);
  const [selected, setSelected] = useState("");
  const [observation, setObservation] = useState<Observation>();
  const [message, setMessage] = useState("Loading your assignments…");
  const [revision, setRevision] = useState(0);
  const policy = mandates.find((p) => p.mandateId === selected);
  useEffect(() => {
    let active = true;
    async function load() {
      const r = await fetch("/api/auth/session", { cache: "no-store" });
      if (!r.ok) throw new Error("Sign in to view your assigned journey.");
      const s = await r.json();
      const a = await fetch("/api/chain/assignments", { cache: "no-store" });
      if (!a.ok) throw new Error("Assignments unavailable. Reload to retry.");
      const result = await a.json();
      if (active) {
        setAccount(s.accountId);
        setMandates(result.mandates);
        setMessage("");
      }
    }
    void load().catch((e) => {
      if (active)
        setMessage(e instanceof Error ? e.message : "Workspace unavailable.");
    });
    return () => {
      active = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit refresh revision triggers a new observation.
  useEffect(() => {
    let active = true;
    setObservation(undefined);
    if (!policy) return;
    setMessage("Checking the selected mandate…");
    void fetch(
      `/api/organizations/${policy.organizationId}/mandates/${policy.mandateId}/chain`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "State unavailable. No completion is inferred; refresh to retry.",
          );
        const d: Observation = await r.json();
        if (
          d.policy.mandateId !== policy.mandateId ||
          d.policy.organizationId !== policy.organizationId
        )
          throw new Error(
            "Mandate binding mismatch. No completion is inferred.",
          );
        if (active) {
          setObservation(d);
          setMessage("");
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            "State unavailable or binding mismatch. No completion is inferred; refresh to retry.",
          );
      });
    return () => {
      active = false;
    };
  }, [policy, revision]);
  const chain = observation?.onchain;
  const settlement = `/workspace/settlement${selected ? `?mandate=${selected}` : ""}`;
  return (
    <main className="workspace">
      <h1>Your Testnet journey</h1>
      <p>
        Follow each role’s actions below. Application consent, evidence review
        and transaction preparation are not payment success. Live operations
        require separate deployment and spending authorization.
      </p>
      {message && <p role="status">{message}</p>}
      <ol>
        <li>
          <Link href="/workspace">
            Connect wallet, select organization and register an agent
          </Link>
          {account
            ? ` — signed in as ${account}; organization and agent access are checked for each action.`
            : " — sign-in required."}
        </li>
        <li>
          <Link href="/workspace/mandates">
            Owner: create exact terms and sign offchain consent
          </Link>{" "}
          — consent does not authorize an onchain payment.
        </li>
      </ol>
      {account && (
        <label>
          Journey mandate
          <select
            value={selected}
            onChange={(e) => {
              setObservation(undefined);
              setSelected(e.target.value);
            }}
          >
            <option value="">Select your assigned mandate</option>
            {mandates.map((p) => (
              <option key={p.mandateId} value={p.mandateId}>
                {p.taskReference} · {p.ownerAccount}
              </option>
            ))}
          </select>
        </label>
      )}
      {account && !mandates.length && (
        <p>
          No assigned mandates. Owners can create one; verifiers need an
          explicit policy assignment. Organization administration does not grant
          wallet authority.
        </p>
      )}
      {policy && (
        <section aria-label="Selected journey">
          <h2>{policy.taskReference}</h2>
          <p>
            Owner {policy.ownerAccount} · Agent {policy.agentAccount} ·
            Recipient {policy.recipient} · {policy.network}
          </p>
          <p>
            Per payment {atomicToNear(policy.maxPerPaymentAtomic)} NEAR; total
            policy ceiling {atomicToNear(policy.totalBudgetAtomic)} NEAR. This
            ceiling is not an available balance.
          </p>
          <button
            type="button"
            onClick={() => {
              setObservation(undefined);
              setRevision((r) => r + 1);
            }}
          >
            Refresh journey state
          </button>
          <ol start={3}>
            <li>
              <Link href={settlement}>
                Owner: deposit storage credit, register and fund the mandate
              </Link>
              .{" "}
              {chain
                ? `Observed mandate: ${chain.status} at finalized block ${observation?.block?.height}. Available ${atomicToNear(chain.available)} NEAR; reserved ${atomicToNear(chain.reserved)} NEAR; spent ${atomicToNear(chain.spent)} NEAR.`
                : "No verified onchain state loaded. Funding and registration are not confirmed."}
            </li>
            <li>
              <Link href="/workspace/proposals">
                Prepare a restricted agent proposal
              </Link>
              , then{" "}
              <Link href={settlement}>
                have the designated agent submit it onchain
              </Link>
              .{" "}
              {observation
                ? `${observation.proposals.length} offchain proposal(s) loaded; this does not prove onchain submission.`
                : "Proposal state unavailable."}
            </li>
            <li>
              <Link href="/workspace/evidence">
                Independent verifier: obtain authentic source evidence and
                review exact claims
              </Link>
              . Required: {policy.verifierPolicy.requiredClaims.join(", ")};{" "}
              {policy.verifierPolicy.threshold} independent verifier(s) per
              claim. A digest proves byte integrity only.
            </li>
            <li>
              <Link href={settlement}>
                Verifier: sign the separate onchain attestation
              </Link>
              .{" "}
              {policy.verifierPolicy.requireOwnerApproval
                ? "Original owner must also sign a distinct per-payment approval."
                : "No separate owner attestation selected by this policy; execution remains owner-only."}{" "}
              Offchain reviews cannot satisfy the contract.
            </li>
            <li>
              <Link href={settlement}>
                Original owner: review and execute an eligible payment
              </Link>
              . Wait for verified receipts, callback and accounting; never retry
              an unknown outcome.
            </li>
            <li>
              Verify recipient balance independently against the finalized
              transfer and receipts. Spent totals alone do not identify a
              particular payment. Record actual public transaction references in
              the acceptance runbook.
            </li>
            <li>
              <Link href="/workspace/security">
                Inspect alerts and emergency controls
              </Link>
              . Guardian may only pause; owner resumes or revokes. An incident
              marked resolved does not release funds.
            </li>
          </ol>
          {observation?.intents.map((i) => (
            <article key={i.id}>
              <p>
                {i.operation.methodName}:{" "}
                {i.state.replaceAll("_", " ").toLowerCase()}
              </p>
              {[
                "UNKNOWN",
                "AWAITING_WALLET",
                "BROADCAST_REPORTED",
                "SUBMITTED",
                "FINALIZING",
              ].includes(i.state) && (
                <p>Outcome unresolved. Do not repeat this operation.</p>
              )}
              {i.explorerUrl && (
                <a href={i.explorerUrl} target="_blank" rel="noreferrer">
                  Inspect verified transaction
                </a>
              )}
            </article>
          ))}
          <details>
            <summary>Exact policy and role assignments</summary>
            <pre className="evidence-payload">
              {JSON.stringify(policy, null, 2)}
            </pre>
          </details>
        </section>
      )}
      <p>
        The demonstration vault retains an owner-controlled FullAccess key. It
        is mutable and is not a fully noncustodial production deployment.
      </p>
    </main>
  );
}
