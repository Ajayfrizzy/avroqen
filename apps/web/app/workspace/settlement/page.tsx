"use client";
import {
  atomicToNear,
  type MandatePolicy,
  nearToAtomic,
} from "@avroqen/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map1 } from "../../../../../packages/domain/src/evidence";
import type { ProposalInput } from "../../../../../packages/domain/src/proposals";
import type {
  ChainOperation,
  OperationInput,
} from "../../../../../packages/domain/src/settlement";
import type { VaultMandate } from "../../../../../packages/domain/src/vault";
import { submitOperation } from "../transaction-wallet";

type Session = { accountId: string; csrfToken: string };
type Intent = {
  id: string;
  state: string;
  reason: string;
  operation: ChainOperation;
  explorerUrl: string | null;
};
type Detail = {
  policy: MandatePolicy;
  onchain: VaultMandate | null;
  block: { height: number } | null;
  intents: Intent[];
  proposals: ProposalInput[];
  onchainProposals?: Record<
    string,
    {
      outcome: string;
      attestations: { signer: string; claim: string; expires_at_ns: string }[];
    }
  >;
  reviews: { id: string; payload: Map1 }[];
};
async function api<T>(
  path: string,
  session?: Session,
  body?: object,
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { "X-CSRF-Token": session.csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const messages: Record<string, string> = {
      DEPLOYMENT_NOT_AUTHORIZED: "Live transactions are not authorized.",
      UNRESOLVED_OPERATION:
        "This wallet has an unresolved operation. Reconcile it before preparing another.",
      OPERATION_NOT_ALLOWED:
        "This operation is not permitted by the mandate or signing identity.",
      CONSENT_OR_AGENT_UNAVAILABLE: "Consent or agent access is unavailable.",
      OWNER_REQUIRED: "Only the original owner may perform this action.",
      VAULT_MISMATCH: "This mandate targets a different vault.",
      INTENT_ALREADY_ATTEMPTED:
        "The wallet prompt was already attempted. Do not retry a transaction with an uncertain outcome.",
    };
    throw new Error(
      messages[e.error] ??
        (r.status === 401
          ? "Sign in again to continue."
          : "Request unavailable. Refresh state before retrying."),
    );
  }
  return r.json();
}
export default function Settlement() {
  const [session, setSession] = useState<Session>();
  const [assignments, setAssignments] = useState<MandatePolicy[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail>();
  const [enabled, setEnabled] = useState(false),
    [deployment, setDeployment] = useState("Checking deployment"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<OperationInput["kind"]>("REGISTER"),
    [amount, setAmount] = useState(""),
    [proposalId, setProposalId] = useState(""),
    [reviewId, setReviewId] = useState("");
  const [prepared, setPrepared] = useState<Intent>();
  const policy = assignments.find((p) => p.mandateId === selected);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    if (!session) return;
    const version = ++refreshVersion.current;
    const status = await api<{ submissionEnabled: boolean; status: string }>(
      "/chain/status",
      session,
    );
    if (version !== refreshVersion.current) return;
    setEnabled(status.submissionEnabled);
    setDeployment(status.status);
    if (policy) {
      const result = await api<Detail>(
        `/organizations/${policy.organizationId}/mandates/${policy.mandateId}/chain`,
        session,
      );
      if (
        version === refreshVersion.current &&
        result.policy.mandateId === policy.mandateId &&
        result.policy.organizationId === policy.organizationId
      )
        setDetail(result);
    }
  }, [session, policy]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const s = await api<Session>("/auth/session");
        const a = await api<{ mandates: MandatePolicy[] }>(
          "/chain/assignments",
          s,
        );
        if (active) {
          setSession(s);
          setAssignments(a.mandates);
        }
      } catch {
        if (active) setMessage("Sign in to view your assigned mandates.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    void refresh().catch(() =>
      setMessage("Chain state unavailable. No success is inferred."),
    );
  }, [refresh]);
  useEffect(() => {
    if (
      !detail?.intents.some((i) =>
        [
          "UNKNOWN",
          "AWAITING_WALLET",
          "BROADCAST_REPORTED",
          "SUBMITTED",
          "FINALIZING",
        ].includes(i.state),
      )
    )
      return;
    const timer = setInterval(() => {
      void refresh().catch(() =>
        setMessage(
          "Reconciliation is pending; chain state is currently unavailable.",
        ),
      );
    }, 15000);
    return () => clearInterval(timer);
  }, [detail, refresh]);
  async function prepare() {
    if (!session || !policy) return;
    setBusy(true);
    setMessage("");
    try {
      let input: OperationInput;
      if (kind === "REGISTER")
        input = { kind, storageLimit: nearToAtomic(amount), guardian: null };
      else if (
        ["FUND", "STORAGE_DEPOSIT", "WITHDRAW", "WITHDRAW_STORAGE"].includes(
          kind,
        )
      )
        input = { kind: kind as "FUND", amount: nearToAtomic(amount) };
      else if (kind === "PROPOSE" || kind === "EXECUTE")
        input = { kind, proposalId };
      else if (kind === "ATTEST") input = { kind, reviewId };
      else input = { kind: kind as "PAUSE" | "RESUME" | "REVOKE" };
      const v = await api<Intent>(
        `/organizations/${policy.organizationId}/mandates/${policy.mandateId}/chain/intents`,
        session,
        { idempotencyKey: crypto.randomUUID(), operation: input },
      );
      setPrepared(v);
      setMessage(
        "Prepared only. Review the exact operation before opening your wallet.",
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Preparation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    if (!session || !prepared) return;
    setBusy(true);
    setMessage("");
    let began = false;
    try {
      const hash = await submitOperation(prepared.operation, async () => {
        await api(`/chain/intents/${prepared.id}/begin`, session, {});
        began = true;
      });
      await api(`/chain/intents/${prepared.id}/report`, session, { hash });
      setMessage(
        "Wallet reported a transaction. Awaiting independent RPC and receipt verification.",
      );
      setPrepared(undefined);
    } catch {
      if (began) {
        await api(`/chain/intents/${prepared.id}/report`, session, {
          hash: null,
        }).catch(() => {});
        setPrepared(undefined);
        setMessage(
          "Transaction outcome unknown. Do not retry. Reconciliation will inspect the chain.",
        );
      } else
        setMessage(
          "Wallet connection canceled or unavailable, or preparation is no longer valid. No transaction prompt was opened by this attempt. Refresh before continuing.",
        );
    } finally {
      setBusy(false);
      await refresh().catch(() => {});
    }
  }
  const owner = policy?.ownerAccount === session?.accountId;
  return (
    <main className="workspace">
      <Link href="/workspace">← Wallet workspace</Link>
      <h1>Testnet settlement</h1>
      <p>
        Every financial operation requires the designated wallet. Offchain
        consent and reviews do not move funds.
      </p>
      <p role="status">
        Deployment: {deployment}.{" "}
        {enabled
          ? "Verified configuration; review every wallet prompt."
          : "Live submission disabled."}
      </p>
      {loading && <p>Loading assignments…</p>}
      {message && <p role="status">{message}</p>}
      {session && (
        <>
          <label>
            Mandate
            <select
              value={selected}
              disabled={busy}
              onChange={(e) => {
                refreshVersion.current++;
                setSelected(e.target.value);
                setKind(
                  assignments.find((p) => p.mandateId === e.target.value)
                    ?.ownerAccount === session.accountId
                    ? "REGISTER"
                    : assignments.find((p) => p.mandateId === e.target.value)
                          ?.agentAccount === session.accountId
                      ? "PROPOSE"
                      : "ATTEST",
                );
                setDetail(undefined);
                setPrepared(undefined);
                setProposalId("");
                setReviewId("");
              }}
            >
              <option value="">Select a mandate</option>
              {assignments.map((p) => (
                <option key={p.mandateId} value={p.mandateId}>
                  {p.taskReference} · {p.ownerAccount}
                </option>
              ))}
            </select>
          </label>
          {!assignments.length && (
            <p>
              No assigned mandates. Create one in the{" "}
              <Link href="/workspace/mandates">mandate workspace</Link>.
            </p>
          )}
          {policy && detail && (
            <>
              <section>
                <h2>{policy.taskReference}</h2>
                <p>
                  Owner: {policy.ownerAccount} · Agent: {policy.agentAccount} ·
                  Recipient: {policy.recipient}
                </p>
                <p>
                  Vault: {policy.vaultAccount} · Testnet · Per-payment limit:{" "}
                  {atomicToNear(policy.maxPerPaymentAtomic)} NEAR · Total
                  budget: {atomicToNear(policy.totalBudgetAtomic)} NEAR
                </p>
                <p>
                  Expires:{" "}
                  {new Date(
                    Number(BigInt(policy.expiresAtNs) / 1000000n),
                  ).toISOString()}
                </p>
                <p>
                  Required evidence:{" "}
                  {policy.verifierPolicy.requiredClaims.join(", ")};{" "}
                  {policy.verifierPolicy.threshold} independent verifier(s) per
                  claim. Separate owner approval:{" "}
                  {policy.verifierPolicy.requireOwnerApproval
                    ? "required"
                    : "not required"}
                  .
                </p>
                <p>
                  <Link href="/workspace/evidence">
                    Review evidence and sign independent claims
                  </Link>
                </p>
                {detail.onchain ? (
                  <>
                    <h3>Finalized vault state: {detail.onchain.status}</h3>
                    <p>
                      Available: {atomicToNear(detail.onchain.available)} NEAR ·
                      Reserved: {atomicToNear(detail.onchain.reserved)} NEAR ·
                      Spent: {atomicToNear(detail.onchain.spent)} NEAR ·
                      Withdrawal pending:{" "}
                      {atomicToNear(detail.onchain.withdrawal_pending)} NEAR
                    </p>
                    <p>
                      Observed at block {detail.block?.height}. Pending
                      obligations cannot be released by a timeout.
                    </p>
                  </>
                ) : (
                  <p>
                    No verified onchain mandate state available. This does not
                    mean a zero balance.
                  </p>
                )}
                <details>
                  <summary>Exact policy and atomic units</summary>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(policy, null, 2)}
                  </pre>
                </details>
              </section>
              <section>
                <h2>Prepare a wallet operation</h2>
                <label>
                  Operation
                  <select
                    value={kind}
                    disabled={busy}
                    onChange={(e) => {
                      setKind(e.target.value as OperationInput["kind"]);
                      setPrepared(undefined);
                    }}
                  >
                    {(owner
                      ? [
                          "STORAGE_DEPOSIT",
                          "REGISTER",
                          "FUND",
                          "EXECUTE",
                          "ATTEST",
                          "PAUSE",
                          "RESUME",
                          "REVOKE",
                          "WITHDRAW",
                          "WITHDRAW_STORAGE",
                        ]
                      : policy.agentAccount === session.accountId
                        ? ["PROPOSE"]
                        : ["ATTEST"]
                    ).map((k) => (
                      <option key={k} value={k}>
                        {
                          (
                            {
                              STORAGE_DEPOSIT: "Deposit storage credit",
                              REGISTER: "Register exact mandate",
                              FUND: "Fund mandate",
                              EXECUTE: "Execute approved proposal",
                              ATTEST: "Submit signed review onchain",
                              PAUSE: "Pause mandate",
                              RESUME: "Resume mandate",
                              REVOKE: "Revoke onchain mandate",
                              WITHDRAW: "Withdraw available funds",
                              WITHDRAW_STORAGE:
                                "Withdraw unused storage credit",
                              PROPOSE: "Submit agent proposal",
                            } as Record<string, string>
                          )[k]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                {[
                  "REGISTER",
                  "STORAGE_DEPOSIT",
                  "FUND",
                  "WITHDRAW",
                  "WITHDRAW_STORAGE",
                ].includes(kind) && (
                  <label>
                    {kind === "REGISTER"
                      ? "Storage spending ceiling (NEAR)"
                      : "Amount (NEAR)"}
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                )}
                {(kind === "PROPOSE" || kind === "EXECUTE") && (
                  <label>
                    Proposal
                    <select
                      value={proposalId}
                      onChange={(e) => setProposalId(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Select proposal</option>
                      {detail.proposals.map((p) => (
                        <option key={p.proposalId} value={p.proposalId}>
                          {atomicToNear(p.amountAtomic)} NEAR to {p.recipient} ·{" "}
                          {p.proposalId}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {proposalId && (
                  <p role="status">
                    Onchain proposal:{" "}
                    {detail.onchainProposals?.[proposalId]?.outcome ??
                      "not verified onchain"}
                    . Current attestations:{" "}
                    {detail.onchainProposals?.[proposalId]?.attestations
                      .map(
                        (a) =>
                          `${a.claim} by ${a.signer} (${BigInt(a.expires_at_ns) > BigInt(Date.now()) * 1000000n ? "unexpired" : "expired"})`,
                      )
                      .join("; ") || "none verified"}
                    . The contract rechecks quorum, expiry and separate owner
                    approval at execution.
                  </p>
                )}
                {kind === "ATTEST" && (
                  <label>
                    Your signed review
                    <select
                      value={reviewId}
                      onChange={(e) => setReviewId(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Select review</option>
                      {detail.reviews.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.payload.claim_type} · {r.payload.recipient} ·{" "}
                          {atomicToNear(r.payload.amount_atomic)} NEAR
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  disabled={!enabled || busy || !!prepared}
                  onClick={() => void prepare()}
                >
                  {busy ? "Working…" : "Prepare exact operation"}
                </button>
              </section>
              {prepared && (
                <section aria-label="Exact transaction review">
                  <h2>Review before signing</h2>
                  <p>
                    {prepared.operation.methodName} · Signed by{" "}
                    {prepared.operation.signerId} · To vault{" "}
                    {prepared.operation.receiverId}
                  </p>
                  <p>
                    Attached deposit: {atomicToNear(prepared.operation.deposit)}{" "}
                    NEAR. Network gas is additional. This action may move real
                    testnet funds.
                  </p>
                  {prepared.operation.expectedTransfer && (
                    <p>
                      Payment:{" "}
                      {atomicToNear(prepared.operation.expectedTransfer.amount)}{" "}
                      NEAR to {prepared.operation.expectedTransfer.recipient}.
                    </p>
                  )}
                  {typeof prepared.operation.args.amount === "string" && (
                    <p>
                      Withdrawal requested:{" "}
                      {atomicToNear(prepared.operation.args.amount)} NEAR to{" "}
                      {prepared.operation.signerId}.
                    </p>
                  )}
                  <details>
                    <summary>Exact transaction arguments</summary>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {JSON.stringify(prepared.operation.args, null, 2)}
                    </pre>
                  </details>
                  <button
                    type="button"
                    onClick={() => void sign()}
                    disabled={busy || !enabled}
                  >
                    Open wallet and authorize
                  </button>
                </section>
              )}
              <section>
                <h2>Operation history</h2>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void refresh().catch(() => setMessage("State unavailable."))
                  }
                >
                  Refresh verified state
                </button>
                {!detail.intents.length && (
                  <p>No blockchain operations prepared.</p>
                )}
                {detail.intents.map((i) => (
                  <article key={i.id}>
                    <h3>{i.operation.methodName}</h3>
                    <p>
                      {i.state} · {i.reason}
                    </p>
                    {[
                      "UNKNOWN",
                      "AWAITING_WALLET",
                      "BROADCAST_REPORTED",
                      "FINALIZING",
                      "SUBMITTED",
                    ].includes(i.state) && (
                      <p>
                        Do not repeat this operation while its outcome is
                        unresolved.
                      </p>
                    )}
                    {i.explorerUrl && (
                      <a href={i.explorerUrl} target="_blank" rel="noreferrer">
                        View verified transaction on NEAR explorer
                      </a>
                    )}
                    {i.state === "PREPARED" &&
                      i.operation.signerId === session.accountId && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPrepared(i)}
                        >
                          Review unsigned operation
                        </button>
                      )}
                  </article>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
