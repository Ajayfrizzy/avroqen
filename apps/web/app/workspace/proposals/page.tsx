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
const messages: Record<string, string> = {
  AGENT_CREDENTIAL_INVALID:
    "Demo access expired or was revoked. Enable a new demo credential.",
  AGENT_DISABLED: "This agent is disabled. It cannot submit proposals.",
  CONSENT_UNAVAILABLE: "This mandate needs active offchain owner consent.",
  MANDATE_EXPIRED: "This mandate has expired.",
  PER_PAYMENT_LIMIT: "The amount exceeds the mandate's per-payment ceiling.",
  INVALID_PROPOSAL:
    "Enter a positive exact NEAR amount and a 64-character SHA-256 evidence digest.",
  INVALID_REQUEST: "Check the amount, digest and task fields.",
  ACCESS_DENIED: "You do not have access to this organization.",
  OWNER_REQUIRED: "Only the original mandate owner can issue demo access.",
  OWNER_ACCESS_REVOKED:
    "The issuing owner no longer has organization owner access.",
  IDEMPOTENCY_CONFLICT:
    "This request ID was already used with different terms. Prepare a new proposal.",
  RATE_LIMITED: "Too many requests. Wait one minute before retrying.",
  PROPOSAL_LIMIT: "This mandate has reached its retained proposal limit.",
  CREDENTIAL_LIMIT: "This mandate has reached its retained credential limit.",
};
export default function Proposals() {
  const [session, setSession] = useState<Session | null>(null),
    [orgs, setOrgs] = useState<Org[]>([]),
    [org, setOrg] = useState(""),
    [mandates, setMandates] = useState<MandateView[]>([]),
    [id, setId] = useState("");
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
  const current = mandates.find((m) => m.policy.mandateId === id);
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
        const o = await fetch("/api/organizations", { cache: "no-store" });
        if (active) {
          setSession(s);
          if (o.ok) {
            const result = await o.json();
            setOrgs(result.organizations);
            setOrgNext(result.nextOffset);
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
        setNotice("Demo credential expired.");
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
  const base = `/organizations/${org}/mandates/${id}`;
  function resetHistory() {
    historyRequest.current += 1;
    setHistory([]);
    setHistoryNext(null);
    setHistoryRetryOffset(0);
    setHistoryError("");
    setHistoryState("idle");
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
    orgs.find((o) => o.id === org)?.name,
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
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
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
                  setOrgs((prev) => [...prev, ...r.organizations]);
                  setOrgNext(r.nextOffset);
                })
              }
            >
              Load more organizations
            </button>
          )}
          {org && (
            <>
              <label htmlFor="proposal-mandate">Mandate</label>
              <select
                id="proposal-mandate"
                value={id}
                disabled={busy}
                onChange={(e) => {
                  clearCredential();
                  setId(e.target.value);
                  resetHistory();
                }}
              >
                <option value="">Choose a mandate</option>
                {mandates.map((m) => (
                  <option key={m.policy.mandateId} value={m.policy.mandateId}>
                    {m.policy.taskReference} —{" "}
                    {m.consentStatus === "CONSENT_APPROVED_OFFCHAIN"
                      ? "offchain consent approved"
                      : m.consentStatus === "CONSENT_REVOKED_OFFCHAIN"
                        ? "offchain consent revoked"
                        : "consent not approved"}
                  </option>
                ))}
              </select>
              {mandateNext !== null && (
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
                      setMandates((prev) => [...prev, ...r.mandates]);
                      setMandateNext(r.nextOffset);
                    })
                  }
                >
                  Load more mandates
                </button>
              )}
              {!mandates.length && (
                <p>
                  No mandates found.{" "}
                  <Link href={`/workspace/mandates?organization=${org}`}>
                    Create a mandate
                  </Link>
                  .
                </p>
              )}
            </>
          )}
          {current && (
            <section aria-label="Mandate scope">
              <h2>Exact agent scope</h2>
              {(current.agentDisabled ||
                current.expired ||
                current.consentStatus !== "CONSENT_APPROVED_OFFCHAIN") && (
                <p>
                  Demo unavailable:{" "}
                  {current.agentDisabled
                    ? "agent disabled"
                    : current.expired
                      ? "mandate expired"
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
                  current.consentStatus !== "CONSENT_APPROVED_OFFCHAIN" ||
                  current.policy.ownerAccount !== session.accountId ||
                  orgs.find((o) => o.id === org)?.role !== "owner"
                }
                onClick={() =>
                  void run(async () => {
                    await request("/auth/session");
                    capability.current = await request(`${base}/credentials`, {
                      purpose: "demo",
                    });
                    setReady(true);
                    setNotice(
                      "Demo access enabled for at most 15 minutes. It grants offchain proposal permissions only.",
                    );
                  })
                }
              >
                Enable scoped demo
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
                        "Demo credential revoked. Onchain authority is unchanged.",
                      );
                    })
                  }
                >
                  Revoke demo access
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
