"use client";
import { agentInput, challengeInput, organizationInput } from "@avroqen/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Challenge, signChallenge } from "./wallet";
import { WalletSignInError } from "./wallet-errors";

type Session = {
  accountId: string;
  network: string;
  expiresAt: string;
  csrfToken: string;
};
type Org = { id: string; name: string; role: string };
type Agent = {
  id: string;
  name: string;
  accountId: string;
  disabledAt: string | null;
};
type Config = { network: "testnet" | "mainnet"; origin: string };
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public agentId?: string,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  session?: Session | null,
  body?: object,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { "X-CSRF-Token": session.csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).catch(() => {
    throw new ApiError(
      0,
      "Network connection failed. Check your connection, then refresh the agent list before retrying; the request may have reached the server.",
    );
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const messages: Record<string, string> = {
      AGENT_ALREADY_REGISTERED:
        "This agent is already registered in this organization. You can find it in your agent list.",
      AGENT_PREVIOUSLY_DISABLED:
        "This agent was previously registered but is now disabled. It cannot be registered again. View its existing record in the agent list.",
      INVALID_REQUEST:
        "Check the account format and required fields, then submit again.",
    };
    throw new ApiError(
      response.status,
      (data &&
      typeof data.error === "string" &&
      Object.hasOwn(messages, data.error)
        ? messages[data.error]
        : undefined) ??
        (response.status === 401
          ? "Your session ended. Sign in again."
          : response.status === 403
            ? "You are not authorized for this action."
            : response.status === 429
              ? "Too many requests. Please wait a minute."
              : "The request could not be completed. Refresh the list before retrying; if the problem continues, report this error."),
      response.status === 409 &&
        ["AGENT_ALREADY_REGISTERED", "AGENT_PREVIOUSLY_DISABLED"].includes(
          data?.error,
        ) &&
        typeof data?.agentId === "string" &&
        /^[0-9a-f-]{36}$/.test(data.agentId)
        ? data.agentId
        : undefined,
    );
  }
  return response.json() as Promise<T>;
}
export default function Workspace() {
  const [config, setConfig] = useState<Config | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [account, setAccount] = useState(""),
    [organizations, setOrganizations] = useState<Org[]>([]),
    [selected, setSelected] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]),
    [agentsLoading, setAgentsLoading] = useState(false);
  const [orgName, setOrgName] = useState(""),
    [agentName, setAgentName] = useState(""),
    [agentAccount, setAgentAccount] = useState("");
  const [orgNext, setOrgNext] = useState<number | null>(null),
    [agentNext, setAgentNext] = useState<number | null>(null);
  const [duplicate, setDuplicate] = useState<{
    orgId: string;
    agentId: string;
  } | null>(null);
  const [focusAgent, setFocusAgent] = useState<string | null>(null);
  useEffect(() => {
    if (!focusAgent) return;
    const record = document.getElementById(`agent-${focusAgent}`);
    record?.focus({ preventScroll: true });
    record?.scrollIntoView({ block: "center", behavior: "instant" });
    setFocusAgent(null);
  }, [focusAgent]);
  const requestVersion = useRef(0);
  const submitting = useRef(false);
  const org = organizations.find((o) => o.id === selected);
  const canManage = org && ["owner", "admin"].includes(org.role);
  const fail = useCallback((reason: unknown) => {
    if (reason instanceof WalletSignInError) {
      if (reason.kind === "canceled") setNotice(reason.message);
      else setError(reason.message);
      return;
    }
    setError(
      reason instanceof Error && reason.name === "ZodError"
        ? "Check the account format and required fields."
        : reason instanceof ApiError
          ? reason.message
          : "Wallet or service unavailable. No transaction was sent. Please retry.",
    );
    if (reason instanceof ApiError && reason.status === 401) {
      setSession(null);
      setOrganizations([]);
      setSelected("");
      setAgents([]);
    }
  }, []);
  const loadOrganizations = useCallback(
    async (current: Session, offset = 0) => {
      const data = await api<{
        organizations: Org[];
        nextOffset: number | null;
      }>(`/organizations?offset=${offset}`, current);
      setOrganizations((old) =>
        offset ? [...old, ...data.organizations] : data.organizations,
      );
      setOrgNext(data.nextOffset);
    },
    [],
  );
  useEffect(() => {
    let live = true;
    async function initialize() {
      try {
        const configuration = await api<Config>("/auth/config");
        if (!live) return;
        setConfig(configuration);
        try {
          const current = await api<Session>("/auth/session");
          if (live) {
            setSession(current);
            await loadOrganizations(current);
          }
        } catch (reason) {
          if (!(reason instanceof ApiError && reason.status === 401))
            throw reason;
        }
      } catch (reason) {
        if (live) fail(reason);
      } finally {
        if (live) setLoading(false);
      }
    }
    void initialize();
    return () => {
      live = false;
    };
  }, [fail, loadOrganizations]);
  useEffect(() => {
    const version = ++requestVersion.current;
    setAgents([]);
    setDuplicate(null);
    setAgentNext(null);
    if (!selected || !session) {
      setAgentsLoading(false);
      return;
    }
    setAgentsLoading(true);
    api<{ agents: Agent[]; nextOffset: number | null }>(
      `/organizations/${selected}/agents`,
      session,
    )
      .then((data) => {
        if (requestVersion.current === version) {
          setAgents(data.agents);
          setAgentNext(data.nextOffset);
        }
      })
      .catch((reason: unknown) => {
        if (requestVersion.current === version) fail(reason);
      })
      .finally(() => {
        if (requestVersion.current === version) setAgentsLoading(false);
      });
    return () => {
      requestVersion.current++;
    };
  }, [selected, session, fail]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        setSession(null);
        setOrganizations([]);
        setSelected("");
        setError("Your session ended. Sign in again.");
      },
      Math.max(0, new Date(session.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  async function run(work: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setDuplicate(null);
    try {
      await work();
    } catch (reason) {
      fail(reason);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <header>
        <Link href="/" className="brand">
          Avroqen<span className="dot">.</span>
        </Link>
        <span className="badge">Identity & agent access</span>
      </header>
      <h1>Your workspace</h1>
      <Link href="/workspace/evidence">Evidence and verifier review</Link>
      <Link href="/workspace/security">Security and incidents</Link>
      <Link href="/workspace/settlement">Testnet settlement</Link>
      <p className="intro">
        Connect your wallet to manage organizations and agent records.
      </p>
      <aside>
        <strong>Application access only</strong>
        <p>
          Signing a login message sends no transaction. Application roles and
          registered agents grant no treasury access, owner signing rights,
          verifier credentials, or settlement authority. Payments are not
          enabled.
        </p>
      </aside>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {duplicate && duplicate.orgId === selected && session && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const version = requestVersion.current;
              const record = await api<Agent>(
                `/organizations/${duplicate.orgId}/agents/${duplicate.agentId}`,
                session,
              );
              if (version !== requestVersion.current) return;
              setAgents((old) => [
                record,
                ...old.filter((a) => a.id !== record.id),
              ]);
              setFocusAgent(record.id);
            })
          }
        >
          View agent
        </button>
      )}
      {loading ? (
        <p role="status">Loading your session…</p>
      ) : !session ? (
        <section className="panel">
          <h2>Sign in with your NEAR wallet</h2>
          <p>
            Network: {config?.network ?? "Unavailable"}. Use an active
            full-access Ed25519 wallet key. Review the account, network, origin,
            and expiration in your wallet.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (!config) return;
                if (config.origin !== window.location.origin)
                  throw new ApiError(
                    403,
                    "Open the configured application origin to sign in.",
                  );
                const challenge = await api<Challenge>(
                  "/auth/challenge",
                  null,
                  challengeInput.parse({
                    accountId: account,
                    network: config.network,
                  }),
                );
                const signed = await signChallenge(challenge, config.network);
                const current = await api<Session>("/auth/verify", null, {
                  challengeId: challenge.challengeId,
                  network: config.network,
                  accountId: signed.accountId,
                  publicKey: signed.publicKey,
                  signature: signed.signature,
                });
                setSession(current);
                await loadOrganizations(current);
              });
            }}
          >
            <label htmlFor="wallet-account">NEAR account</label>
            <input
              id="wallet-account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
              minLength={2}
              maxLength={64}
              autoCapitalize="none"
              autoComplete="off"
              placeholder="your-account.testnet"
            />
            <button disabled={busy || !config} type="submit">
              {busy ? "Waiting for wallet…" : "Connect wallet & sign message"}
            </button>
          </form>
          <p>
            Allow the wallet popup. Canceling leaves you signed out. Never enter
            a private key here.
          </p>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>Signed in as {session.accountId}</h2>
            <p>
              {session.network} · Session expires{" "}
              {new Date(session.expiresAt).toLocaleTimeString()}
            </p>
            <button
              disabled={busy}
              type="button"
              onClick={() =>
                void run(async () => {
                  await api("/auth/logout", session, {});
                  setSession(null);
                  setOrganizations([]);
                  setSelected("");
                })
              }
            >
              Log out
            </button>
          </section>
          <section className="panel">
            <h2>Organizations</h2>
            {!organizations.length && (
              <p>No organizations yet. Create one to begin.</p>
            )}
            <label htmlFor="organization">Select organization</label>
            <select
              id="organization"
              value={selected}
              disabled={busy}
              onChange={(e) => {
                setError("");
                setSelected(e.target.value);
              }}
            >
              <option value="">Choose an organization</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.role})
                </option>
              ))}
            </select>
            {orgNext !== null && (
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void run(() => loadOrganizations(session, orgNext))
                }
              >
                Load more organizations
              </button>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const created = await api<Org>(
                    "/organizations",
                    session,
                    organizationInput.parse({
                      name: orgName,
                    }),
                  );
                  setOrganizations((old) => [...old, created]);
                  setSelected(created.id);
                  setOrgName("");
                });
              }}
            >
              <label htmlFor="org-name">New organization name</label>
              <input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                maxLength={80}
              />
              <button type="submit" disabled={busy}>
                Create organization
              </button>
            </form>
          </section>
          {org && (
            <section className="panel">
              <h2>Agents in {org.name}</h2>
              <p>
                <Link href="/workspace/proposals">
                  Restricted agent proposals
                </Link>
                <Link href={`/workspace/mandates?organization=${org.id}`}>
                  Create and review typed mandates
                </Link>
              </p>
              <p>
                Your application role: {org.role}. Disabling a record does not
                revoke onchain permissions; those require a separate
                owner-signed action.
              </p>
              {!canManage && (
                <p role="status">
                  Read-only access. Only owners and admins can register or
                  disable agents.
                </p>
              )}
              {agentsLoading ? (
                <p role="status">Loading agents…</p>
              ) : !agents.length ? (
                <p>No agents registered.</p>
              ) : (
                <ul className="agents">
                  {agents.map((agent) => (
                    <li key={agent.id} id={`agent-${agent.id}`} tabIndex={-1}>
                      <div>
                        <strong>{agent.name}</strong>
                        <p>{agent.accountId}</p>
                        <span>
                          {agent.disabledAt
                            ? "Disabled"
                            : "Registered — no execution authority"}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={busy || !canManage || !!agent.disabledAt}
                        onClick={() =>
                          void run(async () => {
                            const result = await api<{ disabledAt: string }>(
                              `/organizations/${org.id}/agents/${agent.id}/disable`,
                              session,
                              {},
                            );
                            setAgents((old) =>
                              old.map((a) =>
                                a.id === agent.id
                                  ? { ...a, disabledAt: result.disabledAt }
                                  : a,
                              ),
                            );
                          })
                        }
                      >
                        Disable
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {agentNext !== null && (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      const data = await api<{
                        agents: Agent[];
                        nextOffset: number | null;
                      }>(
                        `/organizations/${org.id}/agents?offset=${agentNext}`,
                        session,
                      );
                      setAgents((old) => [
                        ...old,
                        ...data.agents.filter(
                          (a) => !old.some((v) => v.id === a.id),
                        ),
                      ]);
                      setAgentNext(data.nextOffset);
                    })
                  }
                >
                  Load more agents
                </button>
              )}
              {canManage && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      const created = await api<Agent>(
                        `/organizations/${org.id}/agents`,
                        session,
                        agentInput.parse({
                          name: agentName,
                          accountId: agentAccount,
                        }),
                      ).catch((reason: unknown) => {
                        if (reason instanceof ApiError && reason.agentId)
                          setDuplicate({
                            orgId: org.id,
                            agentId: reason.agentId,
                          });
                        throw reason;
                      });
                      setAgents((old) => [...old, created]);
                      setAgentName("");
                      setAgentAccount("");
                    });
                  }}
                >
                  <label htmlFor="agent-name">Agent name</label>
                  <input
                    id="agent-name"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    required
                    maxLength={80}
                  />
                  <label htmlFor="agent-account">Agent NEAR account</label>
                  <input
                    id="agent-account"
                    value={agentAccount}
                    onChange={(e) => setAgentAccount(e.target.value)}
                    required
                    minLength={2}
                    maxLength={64}
                    autoCapitalize="none"
                  />
                  <button type="submit" disabled={busy}>
                    Register agent record
                  </button>
                </form>
              )}
            </section>
          )}
        </>
      )}
      {busy && <p role="status">Request in progress…</p>}
    </main>
  );
}
