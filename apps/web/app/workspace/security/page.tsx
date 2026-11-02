"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Session = { accountId: string; csrfToken: string };
type Alert = {
  id: string;
  rule: string;
  severity: string;
  classification: string;
  explanation: string;
  mandate_id: string | null;
  subject: string;
  state: string;
  version: number;
  occurrences: number;
  first_observed: string;
  last_observed: string;
  assigned_account: string | null;
  resolution_reason: string | null;
};
type Overview = {
  alerts: Alert[];
  counts: { severity: string; count: number }[];
  settlements: { state: string; count: number }[];
  health: { worker: string; healthy: boolean; last_success: string }[];
  canRespond: boolean;
  nextOffset: number | null;
  notification: string;
};
type Detail = {
  ownerActions: boolean;
  alert: Alert;
  history: {
    version: number;
    action: string;
    actor_account: string | null;
    reason: string | null;
    occurred_at: string;
  }[];
  evidence: {
    source: string;
    source_id: string;
    event_type: string;
    reason: string;
    occurred_at: string;
  }[];
  nextOffset: number | null;
};
const labels: Record<string, string> = {
  OPEN: "Needs attention",
  ACKNOWLEDGED: "Acknowledged",
  INVESTIGATING: "Under investigation",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  POLICY_REJECTION: "Application policy rejection",
  CONFIGURATION_MISMATCH: "Observed configuration mismatch",
  OPERATIONAL_WARNING: "Operational warning",
  UNVERIFIED_OBSERVATION: "Unverified observation",
  PREPARED: "Prepared — not signed",
  AWAITING_WALLET: "Wallet prompt attempted",
  BROADCAST_REPORTED: "Broadcast reported — unverified",
  SUBMITTED: "Submitted",
  FINALIZING: "Awaiting finality",
  UNKNOWN: "Outcome unknown — do not retry",
  CONFIRMED_SUCCESS: "Verified successful operation",
  CONFIRMED_FAILED: "Verified failed operation",
};
async function api<T>(path: string, s?: Session, body?: object): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(s ? { "X-CSRF-Token": s.csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).catch(() => {
    throw new Error(
      "Security information is unavailable. Check your connection and retry.",
    );
  });
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "Sign in again to view security."
        : r.status === 403
          ? "You are not authorized for this action."
          : r.status === 409
            ? "This incident changed or the transition is not allowed. Refresh before trying again."
            : "Security information is unavailable. Check your connection and retry.",
    );
  return r.json();
}
export default function Security() {
  const [session, setSession] = useState<Session>(),
    [orgs, setOrgs] = useState<{ id: string; name: string; role: string }[]>(
      [],
    ),
    [org, setOrg] = useState(""),
    [overview, setOverview] = useState<Overview>(),
    [detail, setDetail] = useState<Detail>(),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0),
    [reason, setReason] = useState("INVESTIGATION_COMPLETE");
  const [agents, setAgents] = useState<
      { id: string; name: string; disabledAt: string | null }[]
    >([]),
    [credentials, setCredentials] = useState<
      {
        id: string;
        purpose: string;
        revokedAt: string | null;
        expiresAt: string;
      }[]
    >([]),
    [confirm, setConfirm] = useState<{
      kind: "disable" | "revoke";
      id: string;
    } | null>(null);
  const generation = useRef(0),
    focus = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const s = await api<Session>("/auth/session");
        const o = await api<{ organizations: typeof orgs }>(
          "/organizations",
          s,
        );
        if (live) {
          setSession(s);
          setOrgs(o.organizations);
        }
      } catch (e) {
        if (live) setMessage((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!session || !org) return;
    const v = ++generation.current;
    setLoading(true);
    setMessage("");
    try {
      const o = await api<Overview>(
        `/organizations/${org}/security?offset=${offset}`,
        session,
      );
      const a = await api<{ agents: typeof agents }>(
        `/organizations/${org}/agents`,
        session,
      );
      if (v === generation.current) {
        setOverview(o);
        setAgents(a.agents);
      }
    } catch (e) {
      if (v === generation.current) {
        setOverview(undefined);
        setMessage((e as Error).message);
      }
    } finally {
      if (v === generation.current) setLoading(false);
    }
  }, [org, session, offset]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function open(id: string) {
    if (!session) return;
    const v = generation.current;
    setBusy(true);
    setMessage("");
    setCredentials([]);
    setConfirm(null);
    try {
      const d = await api<Detail>(
        `/organizations/${org}/security/${id}`,
        session,
      );
      if (v !== generation.current) return;
      setDetail(d);
      if (d.alert.mandate_id) {
        const c = await api<{ credentials: typeof credentials }>(
          `/organizations/${org}/mandates/${d.alert.mandate_id}/credentials`,
          session,
        );
        if (v === generation.current) setCredentials(c.credentials);
      }
      requestAnimationFrame(() => {
        focus.current?.focus({ preventScroll: true });
        focus.current?.scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      });
    } catch (e) {
      if (v === generation.current) setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function update(state: string) {
    if (!detail || !session) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/organizations/${org}/security/${detail.alert.id}`, session, {
        version: detail.alert.version,
        state,
        ...(["RESOLVED", "DISMISSED"].includes(state) ? { reason } : {}),
      });
      await open(detail.alert.id);
      await refresh();
      setMessage("Incident updated. Financial state was not changed.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function contain() {
    if (!confirm || !session) return;
    setBusy(true);
    setMessage("");
    try {
      if (confirm.kind === "disable")
        await api(
          `/organizations/${org}/agents/${confirm.id}/disable`,
          session,
          {},
        );
      else if (detail?.alert.mandate_id)
        await api(
          `/organizations/${org}/mandates/${detail.alert.mandate_id}/credentials/revoke`,
          session,
          { credentialId: confirm.id },
        );
      setConfirm(null);
      if (detail) await open(detail.alert.id);
      await refresh();
      setMessage(
        "Application access removed. No onchain pause or revocation was performed.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace security-workspace">
      <header>
        <p>Avroqen · Security</p>
        <h1>Security and incident response</h1>
        <p>
          Alerts help you investigate. They do not authorize payments or
          automatically pause a vault.
        </p>
        <nav>
          <Link href="/workspace">Workspace</Link>
          {" · "}
          <Link href="/workspace/settlement">
            Verified settlement and wallet controls
          </Link>
        </nav>
      </header>
      <section>
        <h2>Organization</h2>
        <label>
          Select organization
          <select
            value={org}
            disabled={busy}
            onChange={(e) => {
              generation.current++;
              setOrg(e.target.value);
              setOverview(undefined);
              setDetail(undefined);
              setCredentials([]);
              setAgents([]);
              setConfirm(null);
              setOffset(0);
              setMessage("");
            }}
          >
            <option value="">Choose an organization</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {!loading && !orgs.length && (
          <p>
            No organizations available. Sign in or create an organization in the
            workspace.
          </p>
        )}
        <button
          type="button"
          disabled={!org || busy || loading}
          onClick={() => void refresh()}
        >
          Refresh security
        </button>
      </section>
      {message && <p role="alert">{message}</p>}
      {loading && <p role="status">Loading security information…</p>}
      {overview && (
        <>
          <section>
            <h2>Overview</h2>
            <p>
              Notification channel: this dashboard only. No email, push message
              or owner contact is claimed.
            </p>
            <p>
              {overview.counts.length
                ? overview.counts
                    .map((c) => `${labels[c.severity]}: ${c.count}`)
                    .join(" · ")
                : "No active alerts in this organization."}
            </p>
            <h3>Worker health</h3>
            {["reconciliation", "monitoring"].map((w) => (
              <p key={w}>
                {w === "reconciliation"
                  ? "Settlement reconciliation"
                  : "Security monitoring"}
                :{" "}
                {overview.health.find((h) => h.worker === w)?.healthy
                  ? "Recently checked"
                  : "Unavailable or stale — investigate service health"}
              </p>
            ))}
            <h3>Settlement status</h3>
            {overview.settlements.length ? (
              overview.settlements.map((s) => (
                <p key={s.state}>
                  {labels[s.state] ?? "Status unavailable"}: {s.count}
                </p>
              ))
            ) : (
              <p>No transaction intents recorded.</p>
            )}
            <p>
              Dispatched transfers may still settle. Unknown outcomes remain
              quarantined even after an incident is resolved.
            </p>
          </section>
          <section>
            <h2>Incidents</h2>
            {!overview.alerts.length && (
              <p>
                No incidents on this page. Monitoring is advisory and cannot
                guarantee detection.
              </p>
            )}
            {overview.alerts.map((a) => (
              <article key={a.id}>
                <h3>
                  {labels[a.severity]} · {labels[a.state]}
                </h3>
                <p>{a.explanation}</p>
                <p>
                  {labels[a.classification] ?? "Observation"} · {a.occurrences}{" "}
                  observations
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void open(a.id)}
                >
                  Inspect incident
                </button>
              </article>
            ))}
            <button
              type="button"
              disabled={offset === 0 || busy}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous incidents
            </button>
            <button
              type="button"
              disabled={overview.nextOffset === null || busy}
              onClick={() => setOffset(overview.nextOffset ?? 0)}
            >
              Next incidents
            </button>
          </section>
        </>
      )}
      {detail && (
        <section aria-label="Incident details">
          <h2 ref={focus} tabIndex={-1}>
            Incident review
          </h2>
          <p>{detail.alert.explanation}</p>
          <p>
            {labels[detail.alert.state]} · {detail.alert.occurrences}{" "}
            observations
          </p>
          <p>
            Assigned responder:{" "}
            {detail.alert.assigned_account ?? "Not assigned"}
          </p>
          {overview?.canRespond ? (
            <div>
              {detail.alert.state === "OPEN" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update("ACKNOWLEDGED")}
                >
                  Acknowledge and assign to me
                </button>
              )}
              {detail.alert.state === "ACKNOWLEDGED" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update("INVESTIGATING")}
                >
                  Begin investigation
                </button>
              )}
              {detail.alert.state === "INVESTIGATING" && (
                <>
                  <label>
                    Resolution reason
                    <select
                      value={reason}
                      disabled={busy}
                      onChange={(e) => setReason(e.target.value)}
                    >
                      <option value="INVESTIGATION_COMPLETE">
                        Investigation complete
                      </option>
                      <option value="CONTROL_APPLIED">
                        Control applied — verify its actual status separately
                      </option>
                      <option value="EXPECTED_ACTIVITY">
                        Expected activity
                      </option>
                      <option value="DUPLICATE_INCIDENT">
                        Duplicate incident
                      </option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void update("RESOLVED")}
                  >
                    Resolve incident only
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void update("DISMISSED")}
                  >
                    Dismiss incident only
                  </button>
                </>
              )}
            </div>
          ) : (
            <p>You have read-only incident access.</p>
          )}
          <h3>Emergency actions</h3>
          <p>
            Wallet approval and verified receipts are required for an onchain
            pause, resume or terminal revoke. Preparing an action is not
            confirmation.
          </p>
          {detail.alert.mandate_id ? (
            <>
              <Link
                href={`/workspace/settlement?mandate=${detail.alert.mandate_id}&action=PAUSE`}
              >
                Review wallet-authorized pause
              </Link>
              {detail.ownerActions && (
                <>
                  {" · "}
                  <Link
                    href={`/workspace/settlement?mandate=${detail.alert.mandate_id}&action=REVOKE`}
                  >
                    Review owner-only terminal revocation
                  </Link>
                  {" · "}
                  <Link
                    href={`/workspace/settlement?mandate=${detail.alert.mandate_id}&action=RESUME`}
                  >
                    Review owner-only resume
                  </Link>
                </>
              )}
            </>
          ) : (
            <Link href="/workspace/settlement">
              Choose an affected mandate and review verified state
            </Link>
          )}
          <h3>Application access only</h3>
          <p>
            Disabling an agent or revoking a capability does not revoke its
            onchain mandate. Existing transfers remain pending until reconciled.
          </p>
          {agents.map((a) => (
            <p key={a.id}>
              {a.name} — {a.disabledAt ? "Disabled" : "Active"}{" "}
              {overview?.canRespond && !a.disabledAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm({ kind: "disable", id: a.id })}
                >
                  Review disabling agent
                </button>
              )}
            </p>
          ))}
          {credentials.map((c) => (
            <p key={c.id}>
              {c.purpose} capability — {c.revokedAt ? "Revoked" : "Not revoked"}{" "}
              {detail.ownerActions && !c.revokedAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm({ kind: "revoke", id: c.id })}
                >
                  Review capability revocation
                </button>
              )}
            </p>
          ))}
          {confirm && (
            <fieldset aria-label="Confirm application containment">
              <p>
                Remove this application access? This cannot stop an
                already-dispatched transfer.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void contain()}
              >
                Confirm application access removal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
            </fieldset>
          )}
          <h3>Wallet or key compromise</h3>
          <p>
            Use a trusted device and your wallet's official recovery guidance.
            Never share a key or recovery phrase. A retained vault FullAccess
            key can replace code or move funds outside contract controls. Stop
            new signing and seek independent review; monitoring cannot repair
            key custody or reverse transfers.
          </p>
          <h3>Incident history</h3>
          {detail.history.map((h) => (
            <p key={h.version}>
              {labels[h.action] ??
                (h.action === "DETECTED"
                  ? "Alert generated"
                  : "Additional observation")}{" "}
              · {new Date(h.occurred_at).toLocaleString()} ·{" "}
              {h.actor_account ?? "Monitoring worker"}
            </p>
          ))}
          <details>
            <summary>Technical evidence references</summary>
            <p>
              Source records are application/RPC observations, not independent
              proof of an attack.
            </p>
            {detail.evidence.map((e) => (
              <p key={`${e.source}:${e.source_id}`}>
                {e.source} / {e.source_id} · {e.event_type} · {e.reason}
              </p>
            ))}
          </details>
          {detail.nextOffset !== null && (
            <p>
              Additional records are available through the paginated incident
              evidence API.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
