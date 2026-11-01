"use client";
import {
  atomicToNear,
  type ConsentAction,
  canonicalPolicy,
  consentMessage,
  type MandateView,
  mandateDraftInput,
  nearToAtomic,
} from "@avroqen/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Challenge, signChallenge } from "../wallet";
import { WalletSignInError } from "../wallet-errors";

type Session = {
  accountId: string;
  network: "testnet" | "mainnet";
  csrfToken: string;
  expiresAt: string;
};
type Org = { id: string; name: string; role: string };
type Agent = {
  id: string;
  name: string;
  accountId: string;
  disabledAt: string | null;
};
class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super("Request failed");
  }
}
async function api<T>(
  path: string,
  session?: Session,
  body?: object,
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { "X-CSRF-Token": session.csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new ApiFailure(r.status, typeof e.error === "string" ? e.error : "");
  }
  return r.json();
}
const labels = {
  DRAFT: "Draft — no consent",
  CONSENT_APPROVED_OFFCHAIN: "Consent approved — offchain only",
  CONSENT_REVOKED_OFFCHAIN: "Consent revoked — offchain only",
};
function Terms({ value }: { value: MandateView }) {
  const p = value.policy;
  return (
    <div className="policy-review">
      <div className="mandate-status">
        <span className="badge">{labels[value.consentStatus]}</span>
        <span>{value.expired ? "Expired" : "Within expiry window"}</span>
      </div>
      <h3>{p.taskReference}</h3>
      <dl className="policy-grid">
        <div>
          <dt>Owner / network</dt>
          <dd>
            {p.ownerAccount} · {p.network}
          </dd>
        </div>
        <div>
          <dt>Intended vault — unverified / not deployed by M2</dt>
          <dd>{p.vaultAccount}</dd>
        </div>
        <div>
          <dt>Exact recipient</dt>
          <dd>{p.recipient}</dd>
        </div>
        <div>
          <dt>Agent — proposals only</dt>
          <dd>
            {p.agentAccount}
            {value.agentDisabled && " (disabled)"}
          </dd>
        </div>
        <div>
          <dt>Per-payment ceiling</dt>
          <dd>
            {atomicToNear(p.maxPerPaymentAtomic)} NEAR
            <small>{p.maxPerPaymentAtomic} yoctoNEAR</small>
          </dd>
        </div>
        <div>
          <dt>Total ceiling</dt>
          <dd>
            {atomicToNear(p.totalBudgetAtomic)} NEAR
            <small>{p.totalBudgetAtomic} yoctoNEAR</small>
          </dd>
        </div>
        <div>
          <dt>Maximum executions</dt>
          <dd>{p.maxExecutions} (reserved + successful in the future vault)</dd>
        </div>
        <div>
          <dt>Expires (UTC)</dt>
          <dd>
            {new Date(Number(BigInt(p.expiresAtNs) / 1000000n)).toISOString()}
            <small>{p.expiresAtNs} ns</small>
          </dd>
        </div>
        <div>
          <dt>Verifier quorum per required claim</dt>
          <dd>
            {p.verifierPolicy.threshold} of {p.verifierPolicy.accounts.length}:{" "}
            {p.verifierPolicy.accounts.join(", ")}
          </dd>
        </div>
        <div>
          <dt>Required third-party claims</dt>
          <dd>{p.verifierPolicy.requiredClaims.join(", ")}</dd>
        </div>
        <div>
          <dt>Separate per-payment owner approval</dt>
          <dd>
            {p.verifierPolicy.requireOwnerApproval
              ? "Required in addition to quorum"
              : "Not selected"}
          </dd>
        </div>
        <div>
          <dt>Onchain status</dt>
          <dd>NOT_SUBMITTED — no enforceable vault authorization</dd>
        </div>
      </dl>
      <details>
        <summary>Immutable policy identifiers and exact signed terms</summary>
        <p>
          Mandate {p.mandateId} · version {p.policyVersion} · organization{" "}
          {p.organizationId}
        </p>
        <p>SHA-256 {value.policyDigest}</p>
        <pre>{canonicalPolicy(p)}</pre>
      </details>
      <p>
        Verifier claims do not guarantee delivery. INVOICE_ISSUED proves
        issuance only. Disputed delivery blocks later execution. This consent is
        not a per-payment approval or delivery attestation.
      </p>
    </div>
  );
}
export default function Mandates() {
  const [session, setSession] = useState<Session>(),
    [origin, setOrigin] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]),
    [selected, setSelected] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]),
    [rows, setRows] = useState<MandateView[]>([]),
    [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [review, setReview] = useState<MandateView>(),
    [action, setAction] = useState<ConsentAction>("APPROVE_CONSENT"),
    [confirmed, setConfirmed] = useState(false);
  const [formOpen, setFormOpen] = useState(false),
    [orgNext, setOrgNext] = useState<number | null>(null),
    [agentNext, setAgentNext] = useState<number | null>(null);
  const draftHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const heading = review
      ? reviewHeading.current
      : formOpen
        ? draftHeading.current
        : null;
    if (heading) {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [formOpen, review]);
  const [scopeFailed, setScopeFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const generation = useRef(0),
    live = useRef(true);
  const org = orgs.find((v) => v.id === selected);
  const fail = useCallback((e: unknown) => {
    if (e instanceof WalletSignInError) {
      if (e.kind === "canceled")
        setNotice(
          "Wallet consent canceled. No transaction was sent. Consent is unchanged.",
        );
      else
        setError(
          e.kind === "popup"
            ? "Allow the wallet popup and retry. No transaction was sent."
            : "Wallet connection failed. Retry with a fresh challenge. No transaction was sent.",
        );
    } else if (e instanceof ApiFailure) {
      const codes: Record<string, string> = {
        MANDATE_EXPIRED:
          "This mandate has expired. New approval is not allowed.",
        CONSENT_REVOKED: "This consent is already revoked.",
        CONSENT_ALREADY_APPROVED:
          "This consent is already approved. Refresh to see its status.",
        AGENT_DISABLED:
          "The agent is disabled or unavailable. New consent is not allowed.",
        INVALID_PROOF:
          "Wallet proof rejected or expired. Check the account and retry with a fresh challenge.",
      };
      setError(
        e.status === 401 && e.code === "SESSION_REQUIRED"
          ? "Your session ended. Return to the workspace to sign in."
          : e.status === 403
            ? "Access denied. Only this mandate's owner can change its consent."
            : e.status === 429
              ? "Too many requests. Wait a minute before retrying."
              : (codes[e.code] ??
                "Request could not be completed. Check the fields or retry."),
      );
      if (e.status === 401 && e.code === "SESSION_REQUIRED") {
        generation.current++;
        setSession(undefined);
        setRows([]);
        setReview(undefined);
      }
    } else
      setError(
        "Check all required fields and exact limits. The operation was not completed.",
      );
  }, []);
  useEffect(() => {
    live.current = true;
    void (async () => {
      try {
        const [s, c, o] = await Promise.all([
          api<Session>("/auth/session"),
          api<{ origin: string }>("/auth/config"),
          api<{ organizations: Org[]; nextOffset: number | null }>(
            "/organizations",
          ),
        ]);
        if (!live.current) return;
        setSession(s);
        setOrigin(c.origin);
        setOrgs(o.organizations);
        setOrgNext(o.nextOffset);
        const requested = new URL(window.location.href).searchParams.get(
          "organization",
        );
        if (o.organizations.some((v) => v.id === requested))
          setSelected(requested ?? "");
      } catch (e) {
        if (live.current) fail(e);
      } finally {
        if (live.current) setLoading(false);
      }
    })();
    return () => {
      live.current = false;
      generation.current++;
    };
  }, [fail]);
  useEffect(() => {
    void reload;
    const version = ++generation.current;
    setScopeFailed(false);
    setRows([]);
    setAgents([]);
    setNext(null);
    setReview(undefined);
    setFormOpen(false);
    setAgentNext(null);
    if (!session || !selected) return;
    setLoading(true);
    void Promise.all([
      api<{ mandates: MandateView[]; nextOffset: number | null }>(
        `/organizations/${selected}/mandates`,
        session,
      ),
      api<{ agents: Agent[]; nextOffset: number | null }>(
        `/organizations/${selected}/agents`,
        session,
      ),
    ])
      .then(([m, a]) => {
        if (generation.current === version) {
          setRows(m.mandates);
          setNext(m.nextOffset);
          setAgents(a.agents);
          setAgentNext(a.nextOffset);
        }
      })
      .catch((e: unknown) => {
        if (generation.current === version) {
          setScopeFailed(true);
          fail(e);
        }
      })
      .finally(() => {
        if (generation.current === version) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [session, selected, fail, reload]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        generation.current++;
        setSession(undefined);
        setReview(undefined);
        setRows([]);
        setError("Your session ended. Return to the workspace to sign in.");
      },
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  async function run(work: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (live.current) fail(e);
    } finally {
      submitting.current = false;
      if (live.current) setBusy(false);
    }
  }
  function update(v: MandateView) {
    setRows((old) => [
      v,
      ...old.filter((r) => r.policy.mandateId !== v.policy.mandateId),
    ]);
  }
  async function openReview(v: MandateView, a: ConsentAction) {
    setReview(undefined);
    setFormOpen(false);
    const version = generation.current;
    const fresh = await api<MandateView>(
      `/organizations/${selected}/mandates/${v.policy.mandateId}`,
      session,
    );
    if (!live.current || version !== generation.current) return;
    setReview(fresh);
    setAction(a);
    setConfirmed(false);
  }
  return (
    <main className="workspace mandates-workspace">
      <header>
        <Link href="/" className="brand">
          Avroqen<span className="dot">.</span>
        </Link>
        <Link href="/workspace">Wallet & organizations</Link>
      </header>
      <p className="eyebrow">M2 · OWNER CONSENT</p>
      <h1>Permission, precisely defined.</h1>
      <p className="intro">
        Give a proposed task clear boundaries. Review every term before your
        wallet records consent.
      </p>
      <aside>
        <strong>Offchain preparation only</strong>
        <p>
          No funds move here. Approval and revocation change application consent
          only. No vault is deployed or called. M3 requires a separate
          owner-signed onchain transaction. Application roles never replace
          onchain ownership.
        </p>
      </aside>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="consent-notice">
          {notice}
        </p>
      )}
      {!session && !loading && (
        <p>
          <Link href="/workspace">Sign in through the workspace</Link> to review
          mandates.
        </p>
      )}
      {session && (
        <section className="panel">
          <h2>Your organization</h2>
          <p>
            {session.accountId} · {session.network}
          </p>
          <label htmlFor="mandate-org">Organization</label>
          <select
            id="mandate-org"
            disabled={busy}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setError("");
              setNotice("");
            }}
          >
            <option value="">Choose an organization</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
          </select>
          {orgNext !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const o = await api<{
                    organizations: Org[];
                    nextOffset: number | null;
                  }>(`/organizations?offset=${orgNext}`, session);
                  setOrgs((old) => [...old, ...o.organizations]);
                  setOrgNext(o.nextOffset);
                })
              }
            >
              Load more organizations
            </button>
          )}
        </section>
      )}
      {loading && <p role="status">Loading mandates…</p>}
      {scopeFailed && session && (
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setError("");
            setReload((v) => v + 1);
          }}
        >
          Retry loading mandates
        </button>
      )}
      {org && session && !loading && !scopeFailed && (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">IMMUTABLE TERMS</p>
                <h2>Mandates in {org.name}</h2>
              </div>
              {org.role === "owner" && (
                <button
                  disabled={busy}
                  type="button"
                  aria-expanded={formOpen}
                  aria-controls="mandate-draft-form"
                  onClick={() => {
                    setFormOpen(true);
                    if (formOpen) {
                      draftHeading.current?.focus({ preventScroll: true });
                      draftHeading.current?.scrollIntoView({
                        block: "start",
                        behavior: "instant",
                      });
                    }
                    setReview(undefined);
                  }}
                >
                  Create a draft
                </button>
              )}
            </div>
            {org.role !== "owner" && (
              <p>
                Read-only access. Only an organization owner may create a
                mandate; only its wallet owner may approve or revoke consent.
              </p>
            )}
            {!rows.length && (
              <p>
                No mandates yet. Start with a bounded task and an active agent
                record.
              </p>
            )}
            <ul className="mandate-list">
              {rows.map((v) => (
                <li key={v.policy.mandateId}>
                  <div>
                    <h3>{v.policy.taskReference}</h3>
                    <p>
                      {v.policy.recipient} · up to{" "}
                      {atomicToNear(v.policy.totalBudgetAtomic)} NEAR total
                    </p>
                    <p>
                      {labels[v.consentStatus]}
                      {v.expired ? " · Expired" : ""}
                    </p>
                  </div>
                  <div className="mandate-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => openReview(v, "APPROVE_CONSENT"))
                      }
                    >
                      Review exact terms
                    </button>
                    {org.role === "owner" &&
                      v.policy.ownerAccount === session.accountId &&
                      v.consentStatus !== "CONSENT_REVOKED_OFFCHAIN" && (
                        <button
                          className="secondary"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(() => openReview(v, "REVOKE_CONSENT"))
                          }
                        >
                          Request revocation
                        </button>
                      )}
                  </div>
                </li>
              ))}
            </ul>
            {next !== null && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const m = await api<{
                      mandates: MandateView[];
                      nextOffset: number | null;
                    }>(
                      `/organizations/${selected}/mandates?offset=${next}`,
                      session,
                    );
                    setRows((old) => [...old, ...m.mandates]);
                    setNext(m.nextOffset);
                  })
                }
              >
                Load more mandates
              </button>
            )}
          </section>
          {formOpen && org.role === "owner" && (
            <section id="mandate-draft-form" className="panel">
              <h2 ref={draftHeading} tabIndex={-1}>
                Create immutable draft
              </h2>
              <p>
                Saved terms cannot be edited. Corrections require a new mandate
                and fresh signature.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void run(async () => {
                    const get = (name: string) => String(form.get(name) ?? "");
                    const millis = Date.parse(`${get("expiry")}:00Z`);
                    if (!Number.isSafeInteger(millis))
                      throw new Error("Invalid date");
                    const body = mandateDraftInput.parse({
                      vaultAccount: get("vault"),
                      agentId: get("agent"),
                      recipient: get("recipient"),
                      asset: "NativeNear",
                      taskReference: get("task"),
                      maxPerPaymentAtomic: nearToAtomic(get("per")),
                      totalBudgetAtomic: nearToAtomic(get("total")),
                      expiresAtNs: (BigInt(millis) * 1000000n).toString(),
                      maxExecutions: Number(get("executions")),
                      verifierPolicy: {
                        version: 1,
                        accounts: get("verifiers")
                          .split(",")
                          .map((s) => s.trim()),
                        threshold: Number(get("threshold")),
                        requiredClaims: form.getAll("claims"),
                        requireOwnerApproval:
                          form.get("ownerApproval") === "on",
                      },
                    });
                    const v = await api<MandateView>(
                      `/organizations/${selected}/mandates`,
                      session,
                      body,
                    );
                    update(v);
                    setFormOpen(false);
                    setReview(v);
                    setAction("APPROVE_CONSENT");
                    setConfirmed(false);
                    setNotice(
                      "Draft saved. No consent or onchain authority has been granted.",
                    );
                  });
                }}
              >
                <label htmlFor="task">Task reference</label>
                <input id="task" name="task" required maxLength={160} />
                <label htmlFor="agent">Agent</label>
                <select id="agent" name="agent" required defaultValue="">
                  <option value="">Select an active agent</option>
                  {agents
                    .filter((a) => !a.disabledAt)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.accountId}
                      </option>
                    ))}
                </select>
                {agentNext !== null && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const a = await api<{
                          agents: Agent[];
                          nextOffset: number | null;
                        }>(
                          `/organizations/${selected}/agents?offset=${agentNext}`,
                          session,
                        );
                        setAgents((old) => [...old, ...a.agents]);
                        setAgentNext(a.nextOffset);
                      })
                    }
                  >
                    Load more agents
                  </button>
                )}
                <label htmlFor="vault">
                  Intended vault account (unverified; not deployed by M2)
                </label>
                <input
                  id="vault"
                  name="vault"
                  required
                  maxLength={64}
                  autoCapitalize="none"
                />
                <label htmlFor="recipient">Exact recipient account</label>
                <input
                  id="recipient"
                  name="recipient"
                  required
                  maxLength={64}
                  autoCapitalize="none"
                />
                <label htmlFor="per">Maximum per payment (NEAR)</label>
                <input
                  id="per"
                  name="per"
                  inputMode="decimal"
                  required
                  maxLength={65}
                />
                <label htmlFor="total">Total budget ceiling (NEAR)</label>
                <input
                  id="total"
                  name="total"
                  inputMode="decimal"
                  required
                  maxLength={65}
                />
                <label htmlFor="executions">Maximum executions</label>
                <input
                  id="executions"
                  name="executions"
                  type="number"
                  min={1}
                  max={4294967295}
                  step={1}
                  required
                />
                <label htmlFor="expiry">
                  Expiration date and time (UTC, not local time)
                </label>
                <input
                  id="expiry"
                  name="expiry"
                  type="datetime-local"
                  step={60}
                  required
                />
                <fieldset>
                  <legend>Evidence requirements</legend>
                  <p>
                    Quorum applies to every selected third-party claim. The
                    owner must choose trusted, independent verifiers; account
                    names do not prove independence.
                  </p>
                  <label htmlFor="verifiers">
                    Verifier accounts, separated by commas (maximum 16)
                  </label>
                  <input
                    id="verifiers"
                    name="verifiers"
                    required
                    maxLength={1040}
                    autoCapitalize="none"
                  />
                  <label htmlFor="threshold">
                    Required verifier quorum per claim
                  </label>
                  <input
                    id="threshold"
                    name="threshold"
                    type="number"
                    min={1}
                    max={16}
                    step={1}
                    required
                  />
                  <label className="check-label">
                    <input
                      type="checkbox"
                      name="claims"
                      value="INVOICE_ISSUED"
                    />{" "}
                    Invoice issued (not proof of delivery)
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      name="claims"
                      value="SERVICE_CONFIRMED"
                    />{" "}
                    Service confirmed
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      name="ownerApproval"
                      defaultChecked
                    />{" "}
                    Also require separate owner approval for every payment
                  </label>
                </fieldset>
                <button disabled={busy} type="submit">
                  Save draft & review
                </button>
              </form>
            </section>
          )}
          {review && (
            <section
              className="panel consent-review"
              aria-label="Policy review"
            >
              <p className="eyebrow">REVIEW BEFORE SIGNING</p>
              <h2 ref={reviewHeading} tabIndex={-1}>
                {action === "REVOKE_CONSENT"
                  ? "Revoke offchain consent"
                  : "Review mandate consent"}
              </h2>
              <Terms value={review} />
              {action === "REVOKE_CONSENT" && (
                <p className="consent-notice">
                  This permanently stops use of this app consent. It does not
                  revoke an onchain mandate or cancel an already dispatched
                  transfer. An onchain mandate requires a separate wallet
                  transaction.
                </p>
              )}
              {org.role === "owner" &&
                review.policy.ownerAccount === session.accountId &&
                review.consentStatus !== "CONSENT_REVOKED_OFFCHAIN" &&
                (action === "REVOKE_CONSENT" ||
                  (review.consentStatus === "DRAFT" &&
                    !review.expired &&
                    !review.agentDisabled)) && (
                  <>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={busy}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />{" "}
                      I reviewed the exact terms and understand this is offchain
                      consent only.
                    </label>
                    <button
                      type="button"
                      disabled={busy || !confirmed}
                      onClick={() =>
                        void run(async () => {
                          const version = generation.current;
                          if (origin !== window.location.origin)
                            throw new Error("Origin mismatch");
                          const base = `/organizations/${selected}/mandates/${review.policy.mandateId}`;
                          const c = await api<
                            Challenge & { expiresAt: string }
                          >(`${base}/challenge`, session, { action });
                          const expected = consentMessage({
                            action,
                            policy: review.policy,
                            policyDigest: review.policyDigest,
                            challengeId: c.challengeId,
                            origin,
                            expiresAt: c.expiresAt,
                          });
                          if (c.message !== expected || c.recipient !== origin)
                            throw new Error("Unexpected signing payload");
                          const signed = await signChallenge(
                            c,
                            session.network,
                          );
                          if (!live.current || generation.current !== version)
                            return;
                          if (signed.accountId !== session.accountId)
                            throw new Error("Wrong wallet account");
                          const result = await api<MandateView>(
                            `${base}/verify`,
                            session,
                            {
                              ...signed,
                              network: session.network,
                              challengeId: c.challengeId,
                              action,
                            },
                          );
                          if (!live.current || generation.current !== version)
                            return;
                          update(result);
                          setReview(result);
                          setConfirmed(false);
                          setNotice(
                            action === "APPROVE_CONSENT"
                              ? "Offchain consent recorded. No funds moved; no onchain mandate was created."
                              : "Offchain consent revoked. No onchain transaction was sent.",
                          );
                        })
                      }
                    >
                      {busy
                        ? "Waiting for wallet…"
                        : action === "REVOKE_CONSENT"
                          ? "Sign offchain revocation"
                          : "Sign offchain approval"}
                    </button>
                  </>
                )}
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setReview(undefined)}
              >
                Close review
              </button>
            </section>
          )}
        </>
      )}
      {busy && <p role="status">Request in progress…</p>}
    </main>
  );
}
