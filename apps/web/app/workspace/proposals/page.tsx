"use client";
import { atomicToNear, type MandateView, nearToAtomic } from "@avroqen/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProposalInput } from "../../../../../packages/domain/src/proposals";
import { useWorkspaceIdentity } from "../../components/shell";
import { PageHeader } from "../../components/ui";
import { hashEvidenceFile } from "../evidence-file";
import { savedOrganization } from "../organization-preference";

type Session = { accountId: string; csrfToken: string; expiresAt: string };
type Org = { id: string; name: string; role: string };
type Assignment = MandateView & { organizationName: string };
type MandateMode = "assigned" | "organization";
type Prepared = {
  proposal: ProposalInput;
  preflight: { accepted: boolean; code: string };
  evidenceVerified: false;
};
type Entry = {
  proposal: ProposalInput;
  status: string;
  onchainStatus: string;
  createdAt: string;
};
type HistoryRequestState = "idle" | "loading" | "loaded" | "error";
function formatUtcTimestamp(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Invalid server timestamp"
    : `${timestamp.toISOString().replace("T", " ").replace("Z", "")} UTC`;
}
function MandatePicker({
  busy,
  id,
  label,
  mandates,
  onChange,
}: {
  busy: boolean;
  id: string;
  label: string;
  mandates: MandateView[];
  onChange: (id: string) => void;
}) {
  return (
    <>
      <label htmlFor="proposal-mandate">{label}</label>
      <select
        id="proposal-mandate"
        value={id}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a mandate</option>
        {mandates.map((mandate) => (
          <option
            key={mandate.policy.mandateId}
            value={mandate.policy.mandateId}
          >
            {mandate.policy.taskReference} —{" "}
            {mandate.consentStatus === "CONSENT_APPROVED_OFFCHAIN"
              ? "offchain consent approved"
              : mandate.consentStatus === "CONSENT_REVOKED_OFFCHAIN"
                ? "offchain consent revoked"
                : "consent not approved"}
          </option>
        ))}
      </select>
    </>
  );
}
const messages: Record<string, string> = {
  AGENT_CREDENTIAL_INVALID:
    "Scoped access expired or was revoked. Enable a new scoped credential.",
  AGENT_DISABLED: "This agent is disabled. It cannot submit proposals.",
  CONSENT_UNAVAILABLE: "This mandate needs active offchain owner consent.",
  MANDATE_EXPIRED: "This mandate has expired.",
  PER_PAYMENT_LIMIT: "The amount exceeds the mandate's per-payment ceiling.",
  INVALID_PROPOSAL:
    "Enter a positive exact NEAR amount and a 64-character SHA-256 evidence digest.",
  INVALID_REQUEST: "Check the amount, digest and task fields.",
  ACCESS_DENIED: "You do not have access to this organization.",
  ASSIGNMENT_NOT_FOUND: "This mandate is not assigned to the signed-in wallet.",
  OWNER_REQUIRED: "Only the original mandate owner can issue demo access.",
  OWNER_ACCESS_REVOKED:
    "The issuing owner no longer has organization owner access.",
  IDEMPOTENCY_CONFLICT:
    "This request ID was already used with different terms. Prepare a new proposal.",
  RATE_LIMITED: "Too many requests. Wait one minute before retrying.",
  PROPOSAL_LIMIT: "This mandate has reached its retained proposal limit.",
  CREDENTIAL_LIMIT: "This mandate has reached its retained credential limit.",
  UNSAFE_VERIFIER_POLICY:
    "This mandate has a conflicting verifier role and cannot accept proposals.",
};
export default function Proposals() {
  const [session, setSession] = useState<Session | null>(null),
    [orgs, setOrgs] = useState<Org[]>([]),
    [org, setOrg] = useState(""),
    [mandates, setMandates] = useState<MandateView[]>([]),
    [id, setId] = useState("");
  const [mode, setMode] = useState<MandateMode>("organization"),
    [assignments, setAssignments] = useState<Assignment[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null),
    [history, setHistory] = useState<Entry[]>([]);
  const [historyState, setHistoryState] = useState<HistoryRequestState>("idle"),
    [historyError, setHistoryError] = useState("");
  const [orgNext, setOrgNext] = useState<number | null>(null),
    [mandateNext, setMandateNext] = useState<number | null>(null),
    [assignmentNext, setAssignmentNext] = useState<number | null>(null),
    [historyNext, setHistoryNext] = useState<number | null>(null),
    [historyRetryOffset, setHistoryRetryOffset] = useState(0);
  const [digest, setDigest] = useState("");
  const taskField = useRef<HTMLTextAreaElement>(null);
  const capability = useRef<{
      id: string;
      token: string;
      expiresAt: string;
    } | null>(null),
    review = useRef<HTMLElement>(null);
  const operation = useRef(false),
    historyRequest = useRef(0);
  const availableMandates = mode === "assigned" ? assignments : mandates;
  const current = availableMandates.find((m) => m.policy.mandateId === id);
  const clearCredential = useCallback(() => {
    capability.current = null;
    setReady(false);
    setPrepared(null);
  }, []);
  async function request<T>(
    path: string,
    body?: object,
    agent = false,
  ): Promise<T> {
    const token = capability.current;
    if (agent && (!token || Date.parse(token.expiresAt) <= Date.now())) {
      clearCredential();
      throw new Error(messages.AGENT_CREDENTIAL_INVALID);
    }
    const r = await fetch(`/api${path}`, {
      method: body ? "POST" : "GET",
      credentials: agent ? "omit" : "same-origin",
      cache: "no-store",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(agent
          ? { Authorization: `Bearer ${token?.token}` }
          : session
            ? { "X-CSRF-Token": session.csrfToken }
            : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) {
        clearCredential();
        if (!agent) setSession(null);
      }
      throw new Error(
        messages[data.error] ??
          (r.status === 401
            ? "Sign in again to continue."
            : "The service could not complete this request. Retry shortly."),
      );
    }
    return r.json();
  }
  async function run(work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const s = await r.json();
        const [o, a] = await Promise.all([
          fetch("/api/organizations", { cache: "no-store" }),
          fetch("/api/agent/assignments", { cache: "no-store" }),
        ]);
        if (active) {
          setSession(s);
          if (o.ok && a.ok) {
            const result = await o.json();
            const assigned = await a.json();
            setOrgs(result.organizations);
            setOrgNext(result.nextOffset);
            setAssignments(assigned.assignments);
            setAssignmentNext(assigned.nextOffset);
            if (assigned.assignments.length) setMode("assigned");
            const preferred = savedOrganization(
              s.accountId,
              result.organizations,
            );
            if (preferred) {
              setOrg(preferred);
              const response = await fetch(
                `/api/organizations/${preferred}/mandates`,
                { cache: "no-store" },
              );
              if (!response.ok) throw new Error();
              const data = await response.json();
              if (active) {
                setMandates(data.mandates);
                setMandateNext(data.nextOffset);
              }
            }
          }
        }
      })
      .catch(() => {
        if (active) setError("Unable to load the workspace. Refresh to retry.");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
      capability.current = null;
      historyRequest.current += 1;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        capability.current &&
        Date.parse(capability.current.expiresAt) <= Date.now()
      ) {
        clearCredential();
        setNotice("Scoped credential expired.");
      }
      if (session && Date.parse(session.expiresAt) <= Date.now()) {
        clearCredential();
        setSession(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session, clearCredential]);
  useEffect(() => {
    function check() {
      if (document.visibilityState !== "visible") return;
      fetch("/api/auth/session", { cache: "no-store" })
        .then((r) => {
          if (!r.ok) {
            clearCredential();
            setSession(null);
          }
        })
        .catch(() => {
          clearCredential();
        });
    }
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [clearCredential]);
  useEffect(() => {
    if (prepared) {
      review.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      review.current?.focus({ preventScroll: true });
    }
  }, [prepared]);
  useEffect(() => {
    if (ready) {
      taskField.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
      taskField.current?.focus({ preventScroll: true });
    }
  }, [ready]);
  const base =
    mode === "assigned"
      ? `/agent/assignments/${id}`
      : `/organizations/${org}/mandates/${id}`;
  function resetHistory() {
    historyRequest.current += 1;
    setHistory([]);
    setHistoryNext(null);
    setHistoryRetryOffset(0);
    setHistoryError("");
    setHistoryState("idle");
  }
  function selectMode(next: MandateMode) {
    clearCredential();
    setMode(next);
    setId("");
    resetHistory();
  }
  async function loadHistory(offset = 0) {
    const requestId = ++historyRequest.current;
    setHistoryRetryOffset(offset);
    setHistoryError("");
    setHistoryState("loading");
    try {
      const h = await request<{
        proposals: Entry[];
        nextOffset: number | null;
      }>(`${base}/proposals?offset=${offset}`);
      if (requestId !== historyRequest.current) return;
      setHistory((previous) =>
        offset ? [...previous, ...h.proposals] : h.proposals,
      );
      setHistoryNext(h.nextOffset);
      setHistoryState("loaded");
    } catch (requestError) {
      if (requestId !== historyRequest.current) return;
      setHistoryError(
        requestError instanceof Error
          ? requestError.message
          : "Request failed.",
      );
      setHistoryState("error");
    }
  }
  useWorkspaceIdentity(
    session?.accountId,
    mode === "assigned"
      ? (current as Assignment | undefined)?.organizationName
      : orgs.find((o) => o.id === org)?.name,
  );
  return (
    <main className="workspace">
      <PageHeader
        eyebrow="Agent workspace"
        title="Agents & proposals"
        description="Turn bounded tasks into proposals. Your wallet remains in control of payments."
      />
      {!loaded ? (
        <p role="status">Loading workspace…</p>
      ) : !session ? (
        <p>
          Sign in through the <Link href="/workspace">wallet workspace</Link> to
          continue.
        </p>
      ) : (
        <>
          <p>Signed in as {session.accountId}</p>
          <div
            role="tablist"
            aria-label="Mandate source"
            className="tabs"
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault();
              const next = mode === "assigned" ? "organization" : "assigned";
              selectMode(next);
              requestAnimationFrame(() =>
                document.getElementById(`${next}-mandates-tab`)?.focus(),
              );
            }}
          >
            <button
              id="assigned-mandates-tab"
              type="button"
              role="tab"
              aria-controls="assigned-mandates-panel"
              aria-selected={mode === "assigned"}
              tabIndex={mode === "assigned" ? 0 : -1}
              disabled={busy}
              onClick={() => selectMode("assigned")}
            >
              Assigned to me ({assignments.length})
            </button>
            <button
              id="organization-mandates-tab"
              type="button"
              role="tab"
              aria-controls="organization-mandates-panel"
              aria-selected={mode === "organization"}
              tabIndex={mode === "organization" ? 0 : -1}
              disabled={busy}
              onClick={() => selectMode("organization")}
            >
              Organization mandates
            </button>
          </div>
          {mode === "organization" ? (
            <div
              id="organization-mandates-panel"
              role="tabpanel"
              aria-labelledby="organization-mandates-tab"
              className="tab-panel"
            >
              <label htmlFor="proposal-org">Organization</label>
              <select
                id="proposal-org"
                value={org}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value;
                  clearCredential();
                  setOrg(next);
                  setId("");
                  setMandates([]);
                  setMandateNext(null);
                  resetHistory();
                  if (next)
                    void run(async () => {
                      const result = await request<{
                        mandates: MandateView[];
                        nextOffset: number | null;
                      }>(`/organizations/${next}/mandates`);
                      setMandates(result.mandates);
                      setMandateNext(result.nextOffset);
                    });
                }}
              >
                <option value="">Choose an organization</option>
                {orgs.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
              {orgNext !== null && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const r = await request<{
                        organizations: Org[];
                        nextOffset: number | null;
                      }>(`/organizations?offset=${orgNext}`);
                      setOrgs((previous) => [...previous, ...r.organizations]);
                      setOrgNext(r.nextOffset);
                    })
                  }
                >
                  Load more organizations
                </button>
              )}
              {org && (
                <MandatePicker
                  busy={busy}
                  id={id}
                  label="Mandate"
                  mandates={mandates}
                  onChange={(next) => {
                    clearCredential();
                    setId(next);
                    resetHistory();
                  }}
                />
              )}
              {org && mandateNext !== null && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const r = await request<{
                        mandates: MandateView[];
                        nextOffset: number | null;
                      }>(
                        `/organizations/${org}/mandates?offset=${mandateNext}`,
                      );
                      setMandates((previous) => [...previous, ...r.mandates]);
                      setMandateNext(r.nextOffset);
                    })
                  }
                >
                  Load more mandates
                </button>
              )}
              {org && !mandates.length && (
                <p>
                  No mandates found.{" "}
                  <Link href={`/workspace/mandates?organization=${org}`}>
                    Create a mandate
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : (
            <div
              id="assigned-mandates-panel"
              role="tabpanel"
              aria-labelledby="assigned-mandates-tab"
              className="tab-panel"
            >
              <MandatePicker
                busy={busy}
                id={id}
                label="Assigned mandate"
                mandates={assignments}
                onChange={(next) => {
                  clearCredential();
                  setId(next);
                  resetHistory();
                }}
              />
              {!assignments.length && (
                <p>No mandates are assigned to this wallet.</p>
              )}
              {assignmentNext !== null && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await request<{
                        assignments: Assignment[];
                        nextOffset: number | null;
                      }>(`/agent/assignments?offset=${assignmentNext}`);
                      setAssignments((previous) => [
                        ...previous,
                        ...result.assignments,
                      ]);
                      setAssignmentNext(result.nextOffset);
                    })
                  }
                >
                  Load more assignments
                </button>
              )}
            </div>
          )}
          {current && (
            <section aria-label="Mandate scope">
              <h2>Exact agent scope</h2>
              {(current.agentDisabled ||
                current.expired ||
                current.consentStatus !== "CONSENT_APPROVED_OFFCHAIN" ||
                !current.verifierPolicyStatus.eligible) && (
                <p>
                  Demo unavailable:{" "}
                  {current.agentDisabled
                    ? "agent disabled"
                    : current.expired
                      ? "mandate expired"
                      : !current.verifierPolicyStatus.eligible
                        ? "verifier policy is unsafe"
                        : "owner consent is not active"}
                  .
                </p>
              )}
              <dl className="policy-grid">
                <div>
                  <dt>Agent</dt>
                  <dd>{current.policy.agentAccount}</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd>{current.policy.recipient}</dd>
                </div>
                <div>
                  <dt>Intended vault / network</dt>
                  <dd>
                    {current.policy.vaultAccount} / {current.policy.network}
                  </dd>
                </div>
                <div>
                  <dt>Maximum per payment (NEAR)</dt>
                  <dd>{atomicToNear(current.policy.maxPerPaymentAtomic)}</dd>
                </div>
                <div>
                  <dt>Required independent claims</dt>
                  <dd>
                    {current.policy.verifierPolicy.requiredClaims.join(", ")} —{" "}
                    {current.policy.verifierPolicy.threshold} verifiers per
                    claim; separate owner approval{" "}
                    {current.policy.verifierPolicy.requireOwnerApproval
                      ? "required"
                      : "not selected"}
                    .
                  </dd>
                </div>
              </dl>
              <p>
                Total budget: {atomicToNear(current.policy.totalBudgetAtomic)}{" "}
                NEAR; execution cap: {current.policy.maxExecutions}. Expires:{" "}
                {new Date(
                  Number(BigInt(current.policy.expiresAtNs) / 1000000n),
                ).toISOString()}
                .
              </p>
              <p>
                Evidence is not verified by this demo. Actual budgets and
                execution limits must be checked by MandateVault.
              </p>
              <button
                type="button"
                disabled={
                  busy ||
                  ready ||
                  current.expired ||
                  current.agentDisabled ||
                  !current.verifierPolicyStatus.eligible ||
                  current.consentStatus !== "CONSENT_APPROVED_OFFCHAIN" ||
                  (mode === "assigned"
                    ? current.policy.agentAccount !== session.accountId
                    : current.policy.ownerAccount !== session.accountId ||
                      orgs.find((o) => o.id === org)?.role !== "owner")
                }
                onClick={() =>
                  void run(async () => {
                    await request("/auth/session");
                    capability.current = await request(`${base}/credentials`, {
                      purpose: "demo",
                    });
                    setReady(true);
                    setNotice(
                      "Scoped access enabled for at most 15 minutes. It grants offchain proposal permissions only.",
                    );
                  })
                }
              >
                {mode === "assigned"
                  ? "Enable scoped proposal access"
                  : "Enable scoped demo"}
              </button>
              {ready && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await request(`${base}/credentials/revoke`, {
                        credentialId: capability.current?.id,
                      });
                      clearCredential();
                      setNotice(
                        "Scoped credential revoked. Onchain authority is unchanged.",
                      );
                    })
                  }
                >
                  {mode === "assigned"
                    ? "Revoke scoped access"
                    : "Revoke demo access"}
                </button>
              )}
              {ready && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    setPrepared(null);
                    void run(async () => {
                      await request("/auth/session");
                      const result = await request<Prepared>(
                        "/agent/tools",
                        {
                          tool: "prepare",
                          task: {
                            description: String(form.get("description")),
                            amountAtomic: nearToAtomic(
                              String(form.get("amount")),
                            ),
                            evidenceDigest: String(form.get("digest")),
                            proposalId: crypto.randomUUID(),
                            idempotencyKey: crypto.randomUUID(),
                          },
                        },
                        true,
                      );
                      setPrepared(result);
                    });
                  }}
                >
                  <h3>DRAFT — prepare a task</h3>
                  <label htmlFor="task-description">
                    Task description (untrusted context only)
                  </label>
                  <textarea
                    ref={taskField}
                    id="task-description"
                    name="description"
                    required
                    maxLength={1000}
                  />
                  <label htmlFor="task-amount">Exact amount (NEAR)</label>
                  <input
                    id="task-amount"
                    name="amount"
                    required
                    inputMode="decimal"
                    maxLength={64}
                  />
                  <label htmlFor="task-file">
                    Hash evidence document locally (maximum 5 MiB; never
                    uploaded)
                  </label>
                  <input
                    id="task-file"
                    type="file"
                    disabled={busy}
                    accept="application/pdf,text/plain,application/json,image/png,image/jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setDigest("");
                      if (file)
                        void run(async () =>
                          setDigest(await hashEvidenceFile(file)),
                        );
                      e.target.value = "";
                    }}
                  />
                  <p>
                    The digest identifies exact bytes, not truth. A designated
                    verifier must obtain the source independently.
                  </p>
                  <label htmlFor="task-digest">
                    Evidence SHA-256 digest (not proof of truth)
                  </label>
                  <input
                    id="task-digest"
                    name="digest"
                    value={digest}
                    onChange={(e) => setDigest(e.target.value)}
                    required
                    pattern="[0-9a-f]{64}"
                    maxLength={64}
                  />
                  <button disabled={busy} type="submit">
                    {busy ? "Working…" : "Prepare proposal"}
                  </button>
                </form>
              )}
              <button
                type="button"
                disabled={busy || historyState === "loading"}
                onClick={() => void run(() => loadHistory())}
              >
                Load proposal history
              </button>
            </section>
          )}
          {prepared && (
            <section ref={review} tabIndex={-1} aria-label="Review proposal">
              <h2>Review proposal</h2>
              <p role="status">
                {prepared.preflight.accepted
                  ? "Within app limits — advisory only"
                  : `Cannot submit — ${messages[prepared.preflight.code] ?? prepared.preflight.code}`}
              </p>
              <dl className="policy-grid">
                <div>
                  <dt>Recipient</dt>
                  <dd>{prepared.proposal.recipient}</dd>
                </div>
                <div>
                  <dt>Amount (NEAR)</dt>
                  <dd>{atomicToNear(prepared.proposal.amountAtomic)}</dd>
                </div>
                <div>
                  <dt>Evidence digest — unverified</dt>
                  <dd>{prepared.proposal.evidenceDigest}</dd>
                </div>
              </dl>
              <details>
                <summary>Exact proposal and atomic units</summary>
                <pre className="evidence-payload">
                  {JSON.stringify(prepared.proposal, null, 2)}
                </pre>
              </details>
              <button
                type="button"
                disabled={busy || !ready || !prepared.preflight.accepted}
                onClick={() =>
                  void run(async () => {
                    await request("/auth/session");
                    const result = await request<{
                      status: string;
                      code?: string;
                    }>(
                      "/agent/tools",
                      { tool: "submit", proposal: prepared.proposal },
                      true,
                    );
                    if (result.status !== "SUBMITTED_OFFCHAIN")
                      throw new Error(
                        messages[result.code ?? ""] ?? "Preflight rejected.",
                      );
                    setNotice(
                      "SUBMITTED_OFFCHAIN — no onchain submission or payment.",
                    );
                    await loadHistory();
                  })
                }
              >
                Submit offchain proposal
              </button>
            </section>
          )}
          {id && (
            <section aria-label="Proposal history">
              <h2>Proposal history</h2>
              {historyState === "idle" && (
                <p>Load proposal history to view records for this mandate.</p>
              )}
              {historyState === "loading" && (
                <p role="status">Loading proposal history…</p>
              )}
              {historyState === "error" && (
                <div>
                  <p role="alert">{historyError}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => loadHistory(historyRetryOffset))
                    }
                  >
                    Retry proposal history
                  </button>
                </div>
              )}
              {historyState === "loaded" && history.length === 0 && (
                <p role="status">No proposals found for this mandate.</p>
              )}
              {historyState === "loaded" && historyNext !== null && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => loadHistory(historyNext))}
                >
                  Load more proposals
                </button>
              )}
              {history.map((h) => (
                <article key={h.proposal.proposalId}>
                  <Link
                    href={`/workspace/evidence?proposal=${h.proposal.proposalId}`}
                  >
                    Evidence and verification
                  </Link>
                  <p>
                    {h.proposal.recipient}:{" "}
                    {atomicToNear(h.proposal.amountAtomic)} NEAR
                  </p>
                  <p>Offchain proposal status: {h.status}</p>
                  <p>Onchain submission status: {h.onchainStatus}</p>
                  <p>
                    Created:{" "}
                    <time dateTime={h.createdAt}>
                      {formatUtcTimestamp(h.createdAt)}
                    </time>
                  </p>
                  <p>
                    Recorded offchain; chain submission and payment are not
                    verified here.
                  </p>
                  <Link
                    href={`/workspace/settlement?mandate=${h.proposal.mandateId}`}
                  >
                    Check verified settlement
                  </Link>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {busy && <p role="status">Working…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
