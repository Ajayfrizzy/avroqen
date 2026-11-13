"use client";
import {
  atomicToNear,
  canonicalPolicy,
  independentVerifierPolicy,
  type MandatePolicy,
  nearToAtomic,
} from "@avroqen/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map1 } from "../../../../../packages/domain/src/evidence";
import type { ProposalInput } from "../../../../../packages/domain/src/proposals";
import {
  buildOperation,
  type ChainOperation,
  type OperationInput,
  operationInput,
  RECOVERY_VALIDITY_BLOCKS,
  type ReplacementInspection,
  rebuildHistoricalStorageDeposit,
  type WalletReport,
} from "../../../../../packages/domain/src/settlement";
import type { VaultMandate } from "../../../../../packages/domain/src/vault";
import { useWorkspaceIdentity } from "../../components/shell";
import { Badge, PageHeader, TransactionSummary } from "../../components/ui";
import { submitOperation } from "../transaction-wallet";
import { type Challenge, signChallenge } from "../wallet";
import { WalletSignInError } from "../wallet-errors";

type Session = { accountId: string; csrfToken: string };
type Intent = {
  id: string;
  state: string;
  reason: string;
  wallet_outcome: string | null;
  replacement_authorized_at: string | null;
  controlled_replacement_of: string | null;
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
type RecoveryAuthorization =
  | "idle"
  | "requesting"
  | "wallet"
  | "canceled"
  | "success"
  | "error";
type RecoveryReview = {
  intent: Intent;
  phase: "loading" | "ready" | "error";
  inspection?: ReplacementInspection;
  error?: string;
  authorization: RecoveryAuthorization;
  authorizationMessage?: string;
};
type RecoveryChallenge = Challenge & {
  replacementIntentId: string;
  expiresAt: string;
};
const expiryRecoveryOperations: readonly OperationInput["kind"][] = [
  "WITHDRAW",
  "WITHDRAW_STORAGE",
  "PAUSE",
  "REVOKE",
];
const walletOutcomeMessage: Record<WalletReport["outcome"], string> = {
  BROADCAST:
    "Wallet reported a transaction. Awaiting independent RPC and receipt verification.",
  CANCELED:
    "Wallet reported cancellation. No transaction hash was returned. Do not retry until reconciliation checks the chain.",
  SUBMISSION_FAILED:
    "Wallet reported submission failure. No transaction hash was returned. Do not retry until reconciliation checks the chain.",
  UNKNOWN:
    "The wallet returned no usable transaction hash. Do not retry. Reconciliation will inspect the chain.",
};
const persistedWalletOutcome: Record<string, string> = {
  UNVERIFIED_WALLET_HASH: "Wallet report: transaction hash received.",
  WALLET_CANCELED: "Wallet report: canceled without a transaction hash.",
  WALLET_SUBMISSION_FAILED:
    "Wallet report: submission failed without a transaction hash.",
  WALLET_OUTCOME_UNKNOWN: "Wallet report: no usable transaction hash returned.",
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
      RECOVERY_VALIDITY_WINDOW_OPEN:
        "The original transaction is still within its possible validity window. It remains quarantined and cannot be replaced yet.",
      RECOVERY_SIGNER_NONCE_CHANGED:
        "The signing account changed after the original attempt, so non-broadcast cannot be established safely.",
      RECOVERY_STORAGE_CREDIT_CHANGED:
        "Onchain storage credit changed after the original attempt. Reconcile the original operation before any replacement.",
      RECOVERY_EVIDENCE_UNAVAILABLE:
        "Independent recovery evidence is currently unavailable. The original operation remains quarantined.",
      RECOVERY_HISTORICAL_STATE_UNAVAILABLE:
        "The approved providers could not retrieve the exact historical recovery state. The original operation remains quarantined.",
      RECOVERY_EVIDENCE_INCONSISTENT:
        "Historical recovery providers returned inconsistent pinned evidence. The original operation remains quarantined; do not continue.",
      RPC_TIMEOUT:
        "The blockchain evidence check timed out. The original operation remains quarantined; retry the read-only check later.",
      RECOVERY_NOT_ELIGIBLE:
        "This operation is not eligible for controlled replacement.",
      RECOVERY_CHALLENGE_EXISTS:
        "A recovery authorization is already pending. Wait for it to expire before requesting another.",
      INVALID_PROOF:
        "The recovery authorization could not be verified. No replacement was prepared.",
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
  const [currentState, setCurrentState] = useState(false);
  const [enabled, setEnabled] = useState(false),
    [deployment, setDeployment] = useState("Checking deployment"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<OperationInput["kind"]>("REGISTER"),
    [amount, setAmount] = useState(""),
    [proposalId, setProposalId] = useState(""),
    [reviewId, setReviewId] = useState("");
  const [guardian, setGuardian] = useState("");
  const [prepared, setPrepared] = useState<Intent>();
  const [recovery, setRecovery] = useState<RecoveryReview>();
  const [recoveryChallenge, setRecoveryChallenge] = useState<{
    intentId: string;
    challenge: RecoveryChallenge;
  }>();
  const policy = assignments.find((p) => p.mandateId === selected);
  const verifierPolicyStatus = policy
      ? independentVerifierPolicy(policy)
      : null,
    unsafePolicy = verifierPolicyStatus?.eligible === false,
    expired = policy
      ? BigInt(policy.expiresAtNs) <= BigInt(Date.now()) * 1000000n
      : false,
    operationAllowed =
      !unsafePolicy && (!expired || expiryRecoveryOperations.includes(kind));
  const refreshVersion = useRef(0);
  const recoveryVersion = useRef(0);
  const reviewPanel = useRef<HTMLElement>(null);
  const requestedReview = useRef<string | null>(null);
  const focusReview = useCallback(() => {
    const panel = reviewPanel.current;
    if (!panel) return;
    panel.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    panel.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!prepared || requestedReview.current !== prepared.id) return;
    requestedReview.current = null;
    const frame = requestAnimationFrame(focusReview);
    return () => cancelAnimationFrame(frame);
  }, [prepared, focusReview]);
  const refresh = useCallback(async () => {
    if (!session) return;
    const version = ++refreshVersion.current;
    setCurrentState(false);
    setEnabled(false);
    setDeployment("Checking deployment");
    try {
      const status = await api<{
        deploymentVerified: boolean;
        submissionEnabled: boolean;
        status: string;
      }>("/chain/status", session);
      if (version !== refreshVersion.current) return;
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
        ) {
          setDetail(result);
          setCurrentState(true);
          setEnabled(status.submissionEnabled && status.deploymentVerified);
          if (
            result.onchain?.guardian === session.accountId &&
            result.policy.ownerAccount !== session.accountId
          )
            setKind("PAUSE");
        }
      }
    } catch (error) {
      if (version === refreshVersion.current) {
        setEnabled(false);
        setCurrentState(false);
        setDeployment("Unavailable — previous observations are not current");
        throw error;
      }
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
          const query = new URLSearchParams(window.location.search);
          const id = query.get("mandate"),
            action = query.get("action");
          if (id && a.mandates.some((p) => p.mandateId === id)) {
            setSelected(id);
            if (
              action === "PAUSE" ||
              action === "RESUME" ||
              action === "REVOKE"
            )
              setKind(action);
          }
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
    if (!session || !policy || !enabled || !currentState || !operationAllowed)
      return;
    setBusy(true);
    setMessage("");
    try {
      let input: OperationInput;
      if (kind === "REGISTER")
        input = {
          kind,
          storageLimit: nearToAtomic(amount),
          guardian: guardian || null,
        };
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
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(canonicalPolicy(policy)),
          ),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const proposal = detail?.proposals.find(
        (p) =>
          p.proposalId ===
          (kind === "ATTEST"
            ? detail.reviews.find((r) => r.id === reviewId)?.payload.proposal_id
            : proposalId),
      );
      const evidence = detail?.reviews.find((r) => r.id === reviewId)?.payload;
      const expected = buildOperation(input, {
        policy,
        policyDigest: digest,
        actor: session.accountId,
        now: BigInt(Date.now()) * 1000000n,
        guardian: detail?.onchain?.guardian ?? null,
        ...(proposal ? { proposal } : {}),
        ...(evidence ? { evidence } : {}),
      });
      const v = await api<Intent>(
        `/organizations/${policy.organizationId}/mandates/${policy.mandateId}/chain/intents`,
        session,
        { idempotencyKey: crypto.randomUUID(), operation: input },
      );
      if (JSON.stringify(v.operation) !== JSON.stringify(expected))
        throw new Error(
          "Prepared transaction does not match the reviewed terms. No wallet prompt was opened.",
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
    const controlledReplacement =
      prepared?.operation.kind === "STORAGE_DEPOSIT" &&
      Boolean(prepared.controlled_replacement_of);
    if (
      !session ||
      !prepared ||
      !enabled ||
      !currentState ||
      unsafePolicy ||
      (expired &&
        !controlledReplacement &&
        !expiryRecoveryOperations.includes(prepared.operation.kind))
    )
      return;
    setBusy(true);
    setMessage("");
    let began = false;
    let walletOutcome: WalletReport | undefined;
    try {
      if (!policy || !detail) throw new Error("Review required");
      const op = prepared.operation;
      const review = detail.reviews.find(
        (r) => JSON.stringify(r.payload) === JSON.stringify(op.args.evidence),
      );
      const input = operationInput.parse({
        kind: op.kind,
        ...(["FUND", "STORAGE_DEPOSIT"].includes(op.kind)
          ? { amount: op.deposit }
          : {}),
        ...(["WITHDRAW", "WITHDRAW_STORAGE"].includes(op.kind)
          ? { amount: op.args.amount }
          : {}),
        ...(op.kind === "REGISTER"
          ? { storageLimit: op.args.storage_limit, guardian: op.args.guardian }
          : {}),
        ...(["PROPOSE", "EXECUTE"].includes(op.kind)
          ? { proposalId: op.args.proposal_id }
          : {}),
        ...(op.kind === "ATTEST" ? { reviewId: review?.id } : {}),
      });
      const proposal = detail.proposals.find(
        (p) =>
          p.proposalId ===
          (op.kind === "ATTEST"
            ? review?.payload.proposal_id
            : op.args.proposal_id),
      );
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(canonicalPolicy(policy)),
          ),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const expected = controlledReplacement
        ? rebuildHistoricalStorageDeposit(op, {
            policy,
            policyDigest: digest,
            actor: session.accountId,
          })
        : buildOperation(input, {
            policy,
            policyDigest: digest,
            actor: session.accountId,
            now: BigInt(Date.now()) * 1000000n,
            guardian: detail?.onchain?.guardian ?? null,
            ...(proposal ? { proposal } : {}),
            ...(review ? { evidence: review.payload } : {}),
          });
      if (JSON.stringify(expected) !== JSON.stringify(op))
        throw new Error("Transaction binding mismatch");
      walletOutcome = await submitOperation(prepared.operation, async () => {
        await api(`/chain/intents/${prepared.id}/begin`, session, {});
        began = true;
      });
      await api(`/chain/intents/${prepared.id}/report`, session, walletOutcome);
      setMessage(walletOutcomeMessage[walletOutcome.outcome]);
      setPrepared(undefined);
    } catch {
      if (began) {
        // Never replace a known wallet hash with a null report. If reporting
        // failed, the AWAITING_WALLET intent is still scanned independently.
        if (!walletOutcome)
          await api(`/chain/intents/${prepared.id}/report`, session, {
            outcome: "UNKNOWN",
            hash: null,
          }).catch(() => {});
        setPrepared(undefined);
        setMessage(
          walletOutcome?.outcome === "BROADCAST"
            ? "The wallet returned a transaction hash, but Avroqen could not record it. Do not retry. Independent reconciliation will scan for the exact operation."
            : "Transaction outcome unknown. Do not retry. Independent reconciliation will inspect the chain.",
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
  async function inspectRecovery(intent: Intent) {
    if (
      !session ||
      !policy ||
      !enabled ||
      !currentState ||
      unsafePolicy ||
      intent.state !== "UNKNOWN" ||
      intent.operation.kind !== "STORAGE_DEPOSIT" ||
      intent.operation.signerId !== session.accountId ||
      intent.replacement_authorized_at
    )
      return;
    const version = ++recoveryVersion.current;
    setRecovery({
      intent,
      phase: "loading",
      authorization: "idle",
    });
    setRecoveryChallenge(undefined);
    try {
      const inspection = await api<ReplacementInspection>(
        `/chain/intents/${intent.id}/recovery/eligibility`,
        session,
      );
      if (inspection.intentId !== intent.id)
        throw new Error("Recovery evidence did not match the selected intent.");
      if (version !== recoveryVersion.current) return;
      setRecovery({
        intent,
        phase: "ready",
        inspection,
        authorization: "idle",
      });
    } catch (error) {
      if (version !== recoveryVersion.current) return;
      setRecovery({
        intent,
        phase: "error",
        error:
          error instanceof Error
            ? error.message
            : "Recovery evidence is unavailable. The original operation remains quarantined.",
        authorization: "idle",
      });
    }
  }
  async function authorizeRecovery() {
    if (
      !session ||
      !recovery ||
      recovery.phase !== "ready" ||
      recovery.inspection?.status !== "ELIGIBLE" ||
      !recovery.inspection.evidence ||
      !enabled ||
      !currentState ||
      unsafePolicy ||
      recovery.intent.operation.signerId !== session.accountId
    )
      return;
    const intent = recovery.intent;
    const update = (
      authorization: RecoveryAuthorization,
      authorizationMessage?: string,
    ) =>
      setRecovery((current) =>
        current?.intent.id === intent.id
          ? {
              ...current,
              authorization,
              ...(authorizationMessage ? { authorizationMessage } : {}),
            }
          : current,
      );
    update("requesting", "Preparing owner authorization challenge...");
    try {
      let challenge =
        recoveryChallenge?.intentId === intent.id &&
        Date.parse(recoveryChallenge.challenge.expiresAt) > Date.now()
          ? recoveryChallenge.challenge
          : undefined;
      if (!challenge) {
        challenge = await api<RecoveryChallenge>(
          `/chain/intents/${intent.id}/recovery/challenge`,
          session,
          {},
        );
        setRecoveryChallenge({ intentId: intent.id, challenge });
      }
      update("wallet", "Waiting for owner approval in Meteor Wallet...");
      const signed = await signChallenge(challenge, "testnet");
      if (signed.accountId !== session.accountId)
        throw new Error(
          "Recovery must be authorized by the account that approved the original wallet attempt.",
        );
      const replacement = await api<Intent>(
        `/chain/intents/${intent.id}/recovery/complete`,
        session,
        {
          action: "AUTHORIZE_CONTROLLED_REPLACEMENT",
          replacementIntentId: challenge.replacementIntentId,
          challengeId: challenge.challengeId,
          network: "testnet",
          ...signed,
        },
      );
      setPrepared(replacement);
      setRecoveryChallenge(undefined);
      update(
        "success",
        "One unsigned replacement is prepared. The original remains unknown. Review the exact operation before separately opening your wallet.",
      );
      await refresh().catch(() => {});
    } catch (error) {
      update(
        error instanceof WalletSignInError && error.kind === "canceled"
          ? "canceled"
          : "error",
        error instanceof Error
          ? error.message
          : "Controlled replacement authorization failed. The original operation remains quarantined.",
      );
    }
  }
  const owner = policy?.ownerAccount === session?.accountId;
  useWorkspaceIdentity(session?.accountId);
  return (
    <main className="workspace">
      <PageHeader
        eyebrow="Wallet-authorized operations"
        title="Payments"
        description="Review exact operations and track their verified onchain outcome."
      />
      {policy && (
        <p role="status">
          <Badge tone={enabled ? "success" : "warning"}>
            {enabled
              ? "Deployment verified"
              : deployment === "Checking deployment"
                ? "Checking deployment"
                : deployment === "UNAVAILABLE"
                  ? "Deployment verification unavailable."
                  : "Live submission disabled."}
          </Badge>{" "}
          {enabled
            ? "Review every wallet prompt."
            : deployment === "NOT_AUTHORIZED"
              ? "Deployment authorization is required before financial operations."
              : deployment}
        </p>
      )}
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
                setCurrentState(false);
                setEnabled(false);
                setPrepared(undefined);
                recoveryVersion.current++;
                setRecovery(undefined);
                setRecoveryChallenge(undefined);
                setGuardian("");
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
          {policy && !detail && (
            <section>
              <h2>{policy.taskReference}</h2>
              {(expired || unsafePolicy) && (
                <aside
                  className="mandate-safety-alert"
                  role="alert"
                  aria-label="Mandate safety status"
                >
                  <strong>New authorization is restricted</strong>
                  {expired && (
                    <p>
                      This mandate expired at{" "}
                      {new Date(
                        Number(BigInt(policy.expiresAtNs) / 1000000n),
                      ).toISOString()}
                      . New registration, funding, proposals, attestations,
                      execution and resume are blocked. Historical records
                      remain readable; recovery actions retain their separate
                      authorization rules.
                    </p>
                  )}
                  {unsafePolicy && (
                    <p>
                      Unsafe historical verifier policy: a designated verifier
                      overlaps the {verifierPolicyStatus.conflict.toLowerCase()}{" "}
                      role. The immutable policy remains readable, but no new
                      wallet operation or financial authorization can be
                      prepared from it.
                    </p>
                  )}
                </aside>
              )}
              <p>
                Owner: {policy.ownerAccount} · Agent: {policy.agentAccount} ·
                Recipient: {policy.recipient}
              </p>
              <p>
                No verified onchain mandate state available. This does not mean
                a zero balance.
              </p>
              <details>
                <summary>Exact policy and atomic units</summary>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(policy, null, 2)}
                </pre>
              </details>
            </section>
          )}
          {policy && detail && (
            <>
              <section>
                <h2>{policy.taskReference}</h2>
                {(expired || unsafePolicy) && (
                  <aside
                    className="mandate-safety-alert"
                    role="alert"
                    aria-label="Mandate safety status"
                  >
                    <strong>New authorization is restricted</strong>
                    {expired && (
                      <p>
                        This mandate expired at{" "}
                        {new Date(
                          Number(BigInt(policy.expiresAtNs) / 1000000n),
                        ).toISOString()}
                        . New registration, funding, proposals, attestations,
                        execution and resume are blocked. Historical records
                        remain readable; recovery actions retain their separate
                        authorization rules.
                      </p>
                    )}
                    {unsafePolicy && (
                      <p>
                        Unsafe historical verifier policy: a designated verifier
                        overlaps the{" "}
                        {verifierPolicyStatus.conflict.toLowerCase()} role. The
                        immutable policy, proposals and operation records remain
                        readable, but no new wallet operation or financial
                        authorization can be prepared from it.
                      </p>
                    )}
                  </aside>
                )}
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
                {currentState && detail.onchain ? (
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
                      : detail?.onchain?.guardian === session.accountId
                        ? ["PAUSE"]
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
                {kind === "REGISTER" && (
                  <label>
                    Optional guardian account (pause only)
                    <input
                      value={guardian}
                      disabled={busy || !!prepared}
                      onChange={(e) => setGuardian(e.target.value)}
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    Leave empty for no guardian. The guardian cannot resume,
                    revoke, execute or withdraw. Review the exact account in the
                    wallet transaction.
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
                    {(currentState
                      ? detail.onchainProposals?.[proposalId]?.outcome
                      : undefined) ?? "not verified onchain"}
                    . Current attestations:{" "}
                    {(currentState
                      ? detail.onchainProposals?.[proposalId]?.attestations
                      : undefined
                    )
                      ?.map(
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
                  disabled={
                    !enabled ||
                    !currentState ||
                    !operationAllowed ||
                    busy ||
                    !!prepared
                  }
                  onClick={() => void prepare()}
                >
                  {busy ? "Working…" : "Prepare exact operation"}
                </button>
                {expired && !expiryRecoveryOperations.includes(kind) && (
                  <p role="status">
                    This operation cannot be prepared after mandate expiry.
                  </p>
                )}
              </section>
              {prepared && (
                <section
                  ref={reviewPanel}
                  tabIndex={-1}
                  className="transaction-review"
                  aria-label="Exact transaction review"
                >
                  <h2>Review before signing</h2>
                  <TransactionSummary
                    entries={[
                      {
                        label: "Network",
                        value: prepared.operation.network,
                      },
                      {
                        label: "Wallet signer",
                        value: prepared.operation.signerId,
                      },
                      {
                        label: "Destination vault",
                        value: prepared.operation.receiverId,
                      },
                      {
                        label: "Contract method",
                        value: prepared.operation.methodName,
                      },
                    ]}
                  />
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
                    disabled={
                      busy ||
                      !enabled ||
                      unsafePolicy ||
                      (expired &&
                        !(
                          prepared.operation.kind === "STORAGE_DEPOSIT" &&
                          prepared.controlled_replacement_of
                        ) &&
                        !expiryRecoveryOperations.includes(
                          prepared.operation.kind,
                        ))
                    }
                  >
                    Open wallet and authorize
                  </button>
                </section>
              )}
              <section>
                <h2>Operation history</h2>
                {!currentState && (
                  <p role="status">
                    Last observed history only. Refresh required before wallet
                    actions. Unresolved operations remain quarantined.
                  </p>
                )}
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
                    <p>{i.state.replaceAll("_", " ").toLowerCase()}</p>
                    {i.wallet_outcome &&
                      persistedWalletOutcome[i.wallet_outcome] && (
                        <p>{persistedWalletOutcome[i.wallet_outcome]}</p>
                      )}
                    {[
                      "UNKNOWN",
                      "AWAITING_WALLET",
                      "BROADCAST_REPORTED",
                      "FINALIZING",
                      "SUBMITTED",
                    ].includes(i.state) && (
                      <>
                        <p>
                          Do not repeat this operation while its outcome is
                          unresolved.
                        </p>
                        <p>
                          Avroqen will compare the exact operation with
                          finalized onchain transactions. Refresh verified state
                          after reconciliation; contact an operator if it
                          remains unresolved.
                        </p>
                      </>
                    )}
                    {i.replacement_authorized_at &&
                      !(
                        recovery?.intent.id === i.id &&
                        recovery.authorization === "success"
                      ) && (
                        <section
                          className="recovery-panel"
                          aria-label="Controlled replacement authorization"
                        >
                          <Badge tone="success">Authorization complete</Badge>
                          <p>
                            A single controlled replacement has been authorized.
                            The original intent <code>{i.id}</code> remains
                            UNKNOWN and must not be resubmitted.
                          </p>
                        </section>
                      )}
                    <details>
                      <summary>Technical outcome</summary>
                      <p>
                        {i.state} · {i.reason}
                      </p>
                    </details>
                    {i.explorerUrl && (
                      <a href={i.explorerUrl} target="_blank" rel="noreferrer">
                        View verified transaction on NEAR explorer
                      </a>
                    )}
                    {i.state === "PREPARED" &&
                      i.operation.signerId === session.accountId && (
                        <button
                          type="button"
                          disabled={busy || unsafePolicy}
                          onClick={() => {
                            requestedReview.current = i.id;
                            if (prepared?.id === i.id) focusReview();
                            else setPrepared(i);
                          }}
                        >
                          Review unsigned operation
                        </button>
                      )}
                    {i.state === "UNKNOWN" &&
                      i.operation.kind === "STORAGE_DEPOSIT" &&
                      i.operation.signerId === session.accountId &&
                      !i.replacement_authorized_at && (
                        <button
                          type="button"
                          disabled={
                            busy || !enabled || !currentState || unsafePolicy
                          }
                          onClick={() => void inspectRecovery(i)}
                        >
                          Review controlled replacement
                        </button>
                      )}
                    {recovery?.intent.id === i.id && (
                      <section
                        className="recovery-panel"
                        aria-label="Controlled replacement eligibility"
                      >
                        <h4>Controlled replacement review</h4>
                        <p>
                          Original intent <code>{i.id}</code>
                        </p>
                        {recovery.phase === "loading" && (
                          <>
                            <p role="status">
                              Checking finalized blockchain evidence...
                            </p>
                            <div
                              className="skeleton short"
                              aria-hidden="true"
                            />
                          </>
                        )}
                        {recovery.phase === "error" && (
                          <>
                            <p role="alert">{recovery.error}</p>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void inspectRecovery(i)}
                            >
                              Retry eligibility check
                            </button>
                          </>
                        )}
                        {recovery.phase === "ready" && recovery.inspection && (
                          <>
                            <Badge
                              tone={
                                recovery.inspection.status === "ELIGIBLE"
                                  ? "success"
                                  : recovery.inspection.status ===
                                      "WAITING_VALIDITY"
                                    ? "warning"
                                    : "danger"
                              }
                            >
                              {
                                {
                                  ELIGIBLE: "Eligible for owner authorization",
                                  WAITING_VALIDITY:
                                    "Waiting for validity window",
                                  SIGNER_STATE_CHANGED: "Signer state changed",
                                  STORAGE_CREDIT_CHANGED:
                                    "Storage credit changed",
                                }[recovery.inspection.status]
                              }
                            </Badge>
                            <dl className="review-summary">
                              <div>
                                <dt>Recovery threshold</dt>
                                <dd>
                                  {recovery.inspection.thresholdBlocks.toLocaleString()}{" "}
                                  blocks
                                </dd>
                              </div>
                              <div>
                                <dt>Current finalized block</dt>
                                <dd>{recovery.inspection.currentHeight}</dd>
                              </div>
                              <div>
                                <dt>Blocks since original anchor</dt>
                                <dd>{recovery.inspection.elapsedBlocks}</dd>
                              </div>
                              <div>
                                <dt>Blocks remaining</dt>
                                <dd>{recovery.inspection.remainingBlocks}</dd>
                              </div>
                            </dl>
                            {recovery.inspection.status ===
                              "WAITING_VALIDITY" && (
                              <p role="status">
                                The original attempt remains UNKNOWN and
                                quarantined until the full{" "}
                                {RECOVERY_VALIDITY_BLOCKS.toLocaleString()}
                                -block window has elapsed.
                              </p>
                            )}
                            {recovery.inspection.status ===
                              "SIGNER_STATE_CHANGED" && (
                              <p role="alert">
                                The signer key set, permissions, or nonce
                                changed after the original attempt. Safe
                                non-broadcast recovery cannot be established.
                              </p>
                            )}
                            {recovery.inspection.status ===
                              "STORAGE_CREDIT_CHANGED" && (
                              <p role="alert">
                                Onchain storage credit differs from the required
                                null state. Reconcile the original operation; no
                                replacement can be authorized.
                              </p>
                            )}
                            {recovery.inspection.status === "ELIGIBLE" &&
                              recovery.inspection.evidence && (
                                <>
                                  <h5>Verified recovery evidence</h5>
                                  <dl className="review-summary">
                                    <div>
                                      <dt>Original anchor</dt>
                                      <dd>
                                        {
                                          recovery.inspection.evidence
                                            .anchorHeight
                                        }
                                        <br />
                                        {
                                          recovery.inspection.evidence
                                            .anchorHash
                                        }
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Finalized evidence head</dt>
                                      <dd>
                                        {
                                          recovery.inspection.evidence
                                            .evidenceHeight
                                        }
                                        <br />
                                        {
                                          recovery.inspection.evidence
                                            .evidenceHash
                                        }
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Signer key state</dt>
                                      <dd>
                                        Unchanged ·{" "}
                                        {
                                          recovery.inspection.evidence
                                            .signerKeysDigest
                                        }
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Storage credit</dt>
                                      <dd>Null at anchor and evidence head</dd>
                                    </div>
                                  </dl>
                                  <button
                                    type="button"
                                    disabled={
                                      busy ||
                                      !enabled ||
                                      !currentState ||
                                      [
                                        "requesting",
                                        "wallet",
                                        "success",
                                      ].includes(recovery.authorization)
                                    }
                                    onClick={() => void authorizeRecovery()}
                                  >
                                    {recovery.authorization === "canceled"
                                      ? "Retry controlled replacement authorization"
                                      : "Authorize controlled replacement"}
                                  </button>
                                </>
                              )}
                            {recovery.authorization === "requesting" && (
                              <p role="status">
                                Preparing owner authorization challenge...
                              </p>
                            )}
                            {recovery.authorization === "wallet" && (
                              <p role="status">
                                Waiting for owner approval in Meteor Wallet...
                              </p>
                            )}
                            {recovery.authorization === "canceled" && (
                              <p role="status">
                                {recovery.authorizationMessage}
                              </p>
                            )}
                            {recovery.authorization === "error" && (
                              <p role="alert">
                                {recovery.authorizationMessage}
                              </p>
                            )}
                            {recovery.authorization === "success" && (
                              <p role="status">
                                {recovery.authorizationMessage}
                              </p>
                            )}
                          </>
                        )}
                      </section>
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
