"use client";
import {
  atomicToNear,
  type MandatePolicy,
  type MandateView,
} from "@avroqen/domain";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspaceIdentity } from "../../components/shell";
import {
  Badge,
  Card,
  EmptyState,
  Feedback,
  Icon,
  LoadingState,
  Metric,
  PageHeader,
  Timeline,
} from "../../components/ui";
import { savedOrganization } from "../organization-preference";
import {
  type DashboardObservation,
  nextAction,
  unresolvedStates,
} from "./status";

type Org = { id: string; name: string; role: string };
type Security = {
  counts: { severity: string; count: number }[];
  alerts: {
    id: string;
    explanation: string;
    severity: string;
    state: string;
  }[];
  health: { worker: string; healthy: boolean }[];
};
async function read<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "Sign in to view your assigned journey."
        : "Data unavailable. Check your connection and refresh.",
    );
  return r.json();
}
export default function Overview() {
  const [account, setAccount] = useState(""),
    [orgs, setOrgs] = useState<Org[]>([]),
    [org, setOrg] = useState("");
  const [assignments, setAssignments] = useState<MandatePolicy[]>([]),
    [selected, setSelected] = useState("");
  const [rows, setRows] = useState<MandateView[]>(),
    [more, setMore] = useState(false),
    [security, setSecurity] = useState<Security>();
  const [observation, setObservation] = useState<DashboardObservation>(),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const policy = assignments.find((p) => p.mandateId === selected);
  useEffect(() => {
    let active = true;
    void (async () => {
      const s = await read<{ accountId: string }>("/auth/session");
      const [a, o] = await Promise.all([
        read<{ mandates: MandatePolicy[] }>("/chain/assignments"),
        read<{ organizations: Org[] }>("/organizations").catch(() => ({
          organizations: [],
        })),
      ]);
      if (active) {
        setAccount(s.accountId);
        setAssignments(a.mandates);
        setOrgs(o.organizations ?? []);
        setOrg(
          savedOrganization(s.accountId, o.organizations ?? []) ||
            o.organizations?.[0]?.id ||
            "",
        );
      }
    })()
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: user-requested refresh resets every observation.
  useEffect(() => {
    let active = true;
    setRows(undefined);
    setSecurity(undefined);
    if (!org) return;
    void Promise.allSettled([
      read<{ mandates: MandateView[]; nextOffset: number | null }>(
        `/organizations/${org}/mandates`,
      ),
      read<Security>(`/organizations/${org}/security?offset=0`),
    ]).then(([m, s]) => {
      if (!active) return;
      if (m.status === "fulfilled" && Array.isArray(m.value.mandates)) {
        setRows(m.value.mandates);
        setMore(m.value.nextOffset !== null);
      }
      if (s.status === "fulfilled" && Array.isArray(s.value.counts))
        setSecurity(s.value);
    });
    return () => {
      active = false;
    };
  }, [org, revision]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit refresh must reload the finalized observation.
  useEffect(() => {
    let active = true;
    setObservation(undefined);
    if (!policy) return;
    setMessage("Checking the selected mandate…");
    void read<DashboardObservation>(
      `/organizations/${policy.organizationId}/mandates/${policy.mandateId}/chain`,
    )
      .then((d) => {
        if (
          d.policy.mandateId !== policy.mandateId ||
          d.policy.organizationId !== policy.organizationId
        )
          throw new Error();
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
  useWorkspaceIdentity(
    account || undefined,
    orgs.find((o) => o.id === org)?.name,
  );
  const consent = rows?.find((r) => r.policy.mandateId === selected);
  const next = nextAction(observation, consent);
  const target = `/workspace/${next.route}${selected ? `?mandate=${selected}` : ""}`;
  const pending = observation?.intents.filter((i) =>
    unresolvedStates.includes(i.state),
  ).length;
  const settled = observation?.intents.filter(
    (i) =>
      i.operation.kind === "EXECUTE" &&
      i.state === "CONFIRMED_SUCCESS" &&
      i.explorerUrl,
  ).length;
  return (
    <main className="workspace dashboard">
      <PageHeader
        eyebrow="Your control center"
        title="Overview"
        description="A clear view of delegated work, approvals and verified outcomes."
        action={
          <Link href="/workspace/mandates" className="button-link">
            <Icon name="mandate" size={16} /> Create mandate
          </Link>
        }
      />
      {loading ? (
        <LoadingState />
      ) : !account ? (
        <Card>
          <EmptyState
            title="Your workspace starts with your wallet"
            action={
              <Link className="button-link" href="/workspace">
                Connect wallet <Icon name="arrow" size={16} />
              </Link>
            }
          >
            Sign in to see your organizations, assigned mandates and pending
            decisions. Login does not send a transaction.
          </EmptyState>
          {message && <Feedback>{message}</Feedback>}
        </Card>
      ) : (
        <>
          <div className="overview-filters">
            <label>
              Organization
              <select
                value={org}
                onChange={(e) => {
                  setOrg(e.target.value);
                  setSelected("");
                  setObservation(undefined);
                  setMessage("");
                }}
              >
                <option value="">Assigned mandates only</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Journey mandate
              <select
                value={selected}
                onChange={(e) => {
                  setObservation(undefined);
                  setSelected(e.target.value);
                }}
              >
                <option value="">Select a mandate for chain details</option>
                {assignments
                  .filter((p) => !org || p.organizationId === org)
                  .map((p) => (
                    <option key={p.mandateId} value={p.mandateId}>
                      {p.taskReference}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setObservation(undefined);
                setRevision((r) => r + 1);
              }}
            >
              Refresh journey state
            </button>
          </div>
          <div className="metric-grid">
            <Metric
              label="Active consent"
              value={
                rows
                  ? rows.filter(
                      (r) =>
                        r.consentStatus === "CONSENT_APPROVED_OFFCHAIN" &&
                        !r.expired &&
                        !r.agentDisabled,
                    ).length
                  : "—"
              }
              note={
                rows
                  ? "Loaded mandates · offchain"
                  : "Organization data unavailable"
              }
              icon="mandate"
            />
            <Metric
              label="Awaiting consent"
              value={
                rows
                  ? rows.filter((r) => r.consentStatus === "DRAFT").length
                  : "—"
              }
              note="Owner review required"
              icon="wallet"
            />
            <Metric
              label="Pending operations"
              value={pending ?? "—"}
              note="Selected mandate · do not retry"
              icon="clock"
            />
            <Metric
              label="Security alerts"
              value={
                security
                  ? security.counts.reduce((n, c) => n + c.count, 0)
                  : "—"
              }
              note={
                security
                  ? "Active organization signals"
                  : "Monitoring data unavailable"
              }
              icon="shield"
            />
          </div>
          {message && <Feedback>{message}</Feedback>}
          <div className="dashboard-grid">
            <Card title="Mandate portfolio">
              {rows?.length ? (
                <>
                  <ul className="data-list">
                    {rows.map((r) => (
                      <li key={r.policy.mandateId}>
                        <div className="list-heading">
                          <h3>{r.policy.taskReference}</h3>
                          <Badge
                            tone={
                              r.consentStatus === "CONSENT_APPROVED_OFFCHAIN"
                                ? "success"
                                : "neutral"
                            }
                          >
                            {r.expired
                              ? "Expired"
                              : r.consentStatus === "DRAFT"
                                ? "Awaiting consent"
                                : r.consentStatus === "CONSENT_REVOKED_OFFCHAIN"
                                  ? "Consent revoked"
                                  : "Consent approved"}
                          </Badge>
                        </div>
                        <p className="item-meta">
                          {r.policy.recipient} ·{" "}
                          {atomicToNear(r.policy.maxPerPaymentAtomic)} NEAR per
                          payment
                        </p>
                        <p className="item-meta">
                          Agent {r.policy.agentAccount}
                        </p>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => setSelected(r.policy.mandateId)}
                        >
                          View mandate progress <Icon name="arrow" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {more && (
                    <Link href="/workspace/mandates">
                      More mandates available · open full list
                    </Link>
                  )}
                </>
              ) : (
                <EmptyState
                  title={rows ? "No mandates yet" : "Select an organization"}
                  action={
                    <Link className="action-link" href="/workspace/mandates">
                      Create your first mandate <Icon name="arrow" size={14} />
                    </Link>
                  }
                >
                  {rows
                    ? "Start with a task, a recipient and a clear spending limit."
                    : "Your authorized organization portfolio will appear here. Assigned verifiers can use the mandate selector above."}
                </EmptyState>
              )}
            </Card>
            <Card className="next-action">
              <p className="eyebrow">Recommended next step</p>
              <h2>{selected ? next.label : "Choose a mandate to continue"}</h2>
              <p>
                {selected
                  ? next.description
                  : "Select an existing mandate to review its verified progress, or create a bounded policy for your agent."}
              </p>
              <Link
                className="button-link"
                href={selected ? target : "/workspace/mandates"}
              >
                {selected ? next.action : "Explore mandates"}
                <Icon name="arrow" size={16} />
              </Link>
              <p className="card-footnote">
                Application consent is not onchain authority. Every financial
                action needs the designated wallet.
              </p>
            </Card>
          </div>
          {policy && (
            <Card title={policy.taskReference} className="selected-journey">
              <div className="section-heading">
                <p className="item-meta">
                  Owner {policy.ownerAccount} · {policy.network}
                </p>
                <Badge>{next.label}</Badge>
              </div>
              <div className="metric-grid">
                <Metric
                  label="Available allocation"
                  value={
                    observation?.onchain
                      ? `${atomicToNear(observation.onchain.available)} NEAR`
                      : "Unavailable"
                  }
                  note={
                    observation?.block
                      ? `Observed block ${observation.block.height}`
                      : "No current verified chain balance"
                  }
                />
                <Metric
                  label="Reserved allocation"
                  value={
                    observation?.onchain
                      ? `${atomicToNear(observation.onchain.reserved)} NEAR`
                      : "Unavailable"
                  }
                  note="Pending obligations stay protected"
                />
                <Metric
                  label="Agent proposals"
                  value={observation?.proposals.length ?? "—"}
                  note="Loaded offchain records, not payments"
                  icon="agent"
                />
                <Metric
                  label="Verified payments"
                  value={settled ?? "—"}
                  note="Loaded executions with verified receipts"
                  icon="payment"
                />
              </div>
              <p>
                {observation
                  ? `${observation.proposals.length} offchain proposal(s) loaded; this does not prove onchain submission.`
                  : "Proposal state unavailable."}
              </p>
              {!observation?.onchain && (
                <p>
                  No verified onchain state loaded. Funding and registration are
                  not confirmed.
                </p>
              )}
              <div className="organization-actions">
                <Link
                  className="button-link"
                  href={`/workspace/settlement?mandate=${selected}`}
                >
                  Original owner: review and execute an eligible payment
                </Link>
                <Link
                  className="button-link secondary"
                  href="/workspace/evidence"
                >
                  Verify evidence
                </Link>
              </div>
              <details>
                <summary>Exact roles, policy and financial limits</summary>
                <pre>{JSON.stringify(policy, null, 2)}</pre>
              </details>
            </Card>
          )}
          <div className="dashboard-grid">
            <Card title="Recent operations">
              {observation?.intents.length ? (
                <Timeline
                  items={observation.intents.map((i) => ({
                    id: i.id,
                    title: i.operation.methodName.replaceAll("_", " "),
                    detail: (
                      <>
                        <Badge
                          tone={
                            i.state === "CONFIRMED_SUCCESS"
                              ? "success"
                              : "warning"
                          }
                        >
                          {i.state === "CONFIRMED_SUCCESS" &&
                          i.operation.kind === "EXECUTE"
                            ? "Settled · verified"
                            : i.state.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                        {unresolvedStates.includes(i.state) && (
                          <p>
                            Outcome unresolved. Do not repeat this operation.
                          </p>
                        )}
                        {i.explorerUrl && (
                          <a
                            className="action-link"
                            href={i.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Inspect verified transaction{" "}
                            <Icon name="arrow" size={14} />
                          </a>
                        )}
                      </>
                    ),
                  }))}
                />
              ) : (
                <EmptyState title="No operations to display">
                  Select a mandate to load its recorded operations. Unavailable
                  history never means a zero balance.
                </EmptyState>
              )}
            </Card>
            <Card title="Security watch">
              {security ? (
                <>
                  {security.alerts.slice(0, 3).map((a) => (
                    <article key={a.id}>
                      <Badge
                        tone={a.severity === "HIGH" ? "danger" : "warning"}
                      >
                        {a.severity.toLowerCase()}
                      </Badge>
                      <p>{a.explanation}</p>
                    </article>
                  ))}
                  {!security.alerts.length && (
                    <p>
                      No incidents on this page. Monitoring is advisory, not a
                      guarantee.
                    </p>
                  )}
                  {security.health.map((h) => (
                    <p key={h.worker}>
                      <Icon name={h.healthy ? "check" : "alert"} size={14} />{" "}
                      {h.worker}:{" "}
                      {h.healthy ? "Recently checked" : "Unavailable or stale"}
                    </p>
                  ))}
                </>
              ) : (
                <p>
                  Organization monitoring unavailable. Select an organization or
                  check the Security workspace.
                </p>
              )}
              <Link className="action-link" href="/workspace/security">
                Open security workspace <Icon name="arrow" size={14} />
              </Link>
            </Card>
          </div>
        </>
      )}
      <details>
        <summary>Testnet safeguards and deployment governance</summary>
        <p>
          Offchain consent and reviews never authorize payments. Verified
          receipts, callbacks and recipient balance checks are required. The
          demo vault retains an owner-controlled FullAccess key; it is mutable
          and is not a fully noncustodial production deployment. Never retry an
          unresolved financial operation.
        </p>
      </details>
    </main>
  );
}
