"use client";
import { atomicToNear, type MandatePolicy } from "@avroqen/domain";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  type Map1,
  map1,
  type ReviewInput,
  type ReviewRecord,
  reviewInput,
  reviewMessage,
  validateMap1,
} from "../../../../../packages/domain/src/evidence";
import type { ProposalInput } from "../../../../../packages/domain/src/proposals";
import { type Challenge, signChallenge } from "../wallet";
import { WalletSignInError } from "../wallet-errors";

type Session = {
  accountId: string;
  network: "testnet" | "mainnet";
  csrfToken: string;
};
type View = {
  proposal: ProposalInput;
  policy: MandatePolicy;
  evidence: {
    id: string;
    metadata: {
      issuer: string;
      reference: string;
      evidenceDigest: string;
      mediaType: string;
      byteLength: number;
    };
    status: string;
  } | null;
  reviews: (ReviewRecord & { attestationStatus: string })[];
  allowedClaims: Map1["claim_type"][];
  readiness: {
    disputed: boolean;
    offchainReady: boolean;
    ownerApproved: boolean;
    ownerApprovalRequired: boolean;
    claims: { claim: string; count: number; required: number }[];
  };
};
const labels: Record<string, string> = {
  APPROVE: "Approve supported claim",
  REJECT: "Reject claim",
  PENDING: "Source temporarily unavailable",
  DISPUTE: "Dispute delivery",
  AUTHENTICATED_PROVIDER_PORTAL: "My authenticated provider portal",
  AUTHENTICATED_ISSUER_COMMUNICATION: "My authenticated issuer communication",
  LOCAL_EXERCISE: "Local exercise (not live evidence)",
  OWNER_DECISION: "Separate owner payment decision",
  SERVICE_ACTIVATED: "Service activated",
  SERVICE_FULFILLED: "Service fulfilled",
  MISSING: "No matching source record",
  UNAVAILABLE: "Source temporarily unavailable",
  INVOICE_ISSUED: "Invoice issued (not delivery)",
  SERVICE_CONFIRMED: "Service activation / fulfillment",
  OWNER_APPROVED: "Separate owner payment approval",
  DELIVERY_DISPUTED: "Delivery dispute",
  VERIFIED: "Human verified — not automated provider validation",
  REJECTED: "Rejected",
  UNVERIFIABLE: "Source could not be verified",
  PENDING_REVIEW: "Waiting for source access",
  DISPUTED: "Disputed — application preparation blocked",
  SYNTHETIC_ONLY: "Local exercise — excluded from live readiness",
};
const errors: Record<string, string> = {
  OBSERVATION_IN_FUTURE:
    "Your observation time is ahead of the server. Check the device clock and prepare a fresh review.",
  VERIFIER_REQUIRED: "This wallet is not designated for this claim.",
  ACCESS_DENIED: "This wallet cannot access this evidence.",
  EVIDENCE_NOT_FOUND: "Proposal not found or inaccessible.",
  EVIDENCE_MISMATCH:
    "The observed digest, amount or recipient differs from the proposal.",
  SOURCE_REFERENCE_MISMATCH:
    "The source reference differs from the submitted evidence.",
  INDEPENDENCE_REQUIRED:
    "Obtain evidence independently through your own authenticated source access.",
  SOURCE_UNAVAILABLE:
    "Source data is missing. Record unavailable or pending instead of approving.",
  CLAIM_MISMATCH:
    "The observation does not support that claim. An invoice is not proof of delivery.",
  REVIEW_ALREADY_FINAL:
    "This wallet already recorded a final decision for that claim.",
  DELIVERY_DISPUTED:
    "A signed dispute is terminal for this proposal. Prepare a new proposal if needed.",
  INVALID_PROOF:
    "Wallet proof expired or did not match. Start a fresh review signature.",
  INVALID_REQUEST:
    "Check the fields. URLs, files and extra authority fields are not accepted.",
  SESSION_REQUIRED: "Sign in again to continue.",
  RATE_LIMITED: "Wait one minute before retrying.",
  CONSENT_UNAVAILABLE: "Offchain mandate consent is unavailable.",
  AGENT_DISABLED: "The proposing agent is disabled.",
  MANDATE_EXPIRED: "The mandate has expired.",
};
export default function Evidence() {
  const [session, setSession] = useState<Session | null>(null),
    [loaded, setLoaded] = useState(false),
    [origin, setOrigin] = useState("");
  const [id, setId] = useState(""),
    [view, setView] = useState<View | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [assigned, setAssigned] = useState<
      { proposalId: string; task: string }[]
    >([]),
    [next, setNext] = useState<number | null>(null);
  const [draft, setDraft] = useState<ReviewInput | null>(null),
    [digest, setDigest] = useState("");
  const panel = useRef<HTMLElement>(null),
    guard = useRef(false);
  async function api<T>(path: string, body?: object): Promise<T> {
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
      throw new Error(
        errors[e.error] ??
          "The request could not be completed. Retry without sharing sensitive data.",
      );
    }
    return r.json();
  }
  async function run(f: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await f();
    } catch (e) {
      setError(
        e instanceof WalletSignInError
          ? e.kind === "canceled"
            ? "Review signing canceled. No decision or transaction was submitted."
            : e.message
          : e instanceof Error
            ? e.message
            : "Request failed.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch("/api/auth/config", { cache: "no-store" }),
    ])
      .then(async ([s, c]) => {
        if (!active) return;
        if (s.ok) setSession(await s.json());
        if (c.ok) setOrigin((await c.json()).origin);
        setId(new URLSearchParams(location.search).get("proposal") ?? "");
      })
      .catch(() => {
        if (active) setError("Unable to load identity. Refresh to retry.");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (draft) {
      panel.current?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      panel.current?.focus({ preventScroll: true });
    }
  }, [draft]);
  async function load() {
    setDraft(null);
    setView(null);
    setView(await api<View>(`/evidence/${id}`));
  }
  return (
    <main className="workspace">
      <Link href="/workspace">← Wallet workspace</Link>
      <h1>Evidence and verifier review</h1>
      <p>
        Human source verification. No automated provider verification,
        blockchain submission or payment. Onchain vault: not deployed.
      </p>
      {!loaded ? (
        <p role="status">Loading identity…</p>
      ) : !session ? (
        <p>
          Sign in through the <Link href="/workspace">wallet workspace</Link>.
        </p>
      ) : (
        <>
          <p>
            Reviewing as {session.accountId}. Obtain source evidence yourself
            through your authenticated provider or issuer channel. Do not follow
            agent-supplied links.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await api<{
                  proposals: typeof assigned;
                  nextOffset: number | null;
                }>("/verifier/proposals");
                setAssigned(r.proposals);
                setNext(r.nextOffset);
              })
            }
          >
            Load assigned proposals
          </button>
          {assigned.length === 0 && (
            <p>
              No assigned proposals loaded. Owners can open a proposal from
              their proposal history.
            </p>
          )}
          <ul>
            {assigned.map((p) => (
              <li key={p.proposalId}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setId(p.proposalId);
                    setView(null);
                    setDraft(null);
                  }}
                >
                  {p.task} — {p.proposalId}
                </button>
              </li>
            ))}
          </ul>
          {next !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api<{
                    proposals: typeof assigned;
                    nextOffset: number | null;
                  }>(`/verifier/proposals?offset=${next}`);
                  setAssigned((a) => [...a, ...r.proposals]);
                  setNext(r.nextOffset);
                })
              }
            >
              Load more assignments
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(load);
            }}
          >
            <label htmlFor="evidence-proposal">Proposal ID</label>
            <input
              id="evidence-proposal"
              value={id}
              disabled={busy}
              required
              onChange={(e) => {
                setId(e.target.value);
                setView(null);
                setDraft(null);
              }}
            />
            <button type="submit" disabled={busy}>
              Open evidence
            </button>
          </form>
          {view && (
            <>
              <section aria-label="Evidence requirements">
                <h2>Exact proposal and evidence requirements</h2>
                <dl className="policy-grid">
                  <div>
                    <dt>Authorized task / service</dt>
                    <dd>{view.policy.taskReference}</dd>
                  </div>
                  <div>
                    <dt>Mandate / policy version</dt>
                    <dd>
                      {view.policy.mandateId} / {view.policy.policyVersion}
                    </dd>
                  </div>
                  <div>
                    <dt>Recipient</dt>
                    <dd>{view.proposal.recipient}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      {atomicToNear(view.proposal.amountAtomic)} NEAR (
                      {view.proposal.amountAtomic} yoctoNEAR)
                    </dd>
                  </div>
                  <div>
                    <dt>Intended vault / network</dt>
                    <dd>
                      {view.proposal.vaultAccount} / {view.proposal.network}
                    </dd>
                  </div>
                  <div>
                    <dt>Evidence digest (not proof of authenticity)</dt>
                    <dd>{view.proposal.evidenceDigest}</dd>
                  </div>
                </dl>
                <p>
                  {view.readiness.disputed
                    ? "Delivery disputed. Further application approvals are blocked. This does not cancel an already dispatched payment."
                    : view.readiness.offchainReady
                      ? "Offchain human decisions meet the policy. Onchain acceptance is still unverified."
                      : "Required human decisions are missing or expired."}
                </p>
                <ul>
                  {view.readiness.claims.map((c) => (
                    <li key={c.claim}>
                      {labels[c.claim]}: {c.count} of {c.required} distinct
                      designated verifiers
                    </li>
                  ))}
                </ul>
                <p>
                  Separate owner approval:{" "}
                  {view.readiness.ownerApprovalRequired
                    ? view.readiness.ownerApproved
                      ? "Recorded offchain"
                      : "Missing"
                    : "Not required by this policy"}
                  .
                </p>
                {view.evidence ? (
                  <p>
                    Submitted by proposer/owner — untrusted:{" "}
                    {view.evidence.metadata.issuer}, reference{" "}
                    {view.evidence.metadata.reference}.{" "}
                    {view.evidence.metadata.mediaType},{" "}
                    {view.evidence.metadata.byteLength} bytes.
                  </p>
                ) : (
                  <>
                    <p>
                      No evidence metadata submitted yet. Only the owner or
                      scoped proposing agent may submit it.
                    </p>
                    {session.accountId === view.policy.ownerAccount && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            await api(`/evidence/${id}/intake`, {
                              sourceType: "HUMAN_REVIEW",
                              issuer: f.get("issuer"),
                              reference: f.get("reference"),
                              evidenceDigest: view.proposal.evidenceDigest,
                              mediaType: f.get("mediaType"),
                              byteLength: Number(f.get("byteLength")),
                            });
                            await load();
                          });
                        }}
                      >
                        <label htmlFor="issuer">
                          Issuer identifier (no URL or private data)
                        </label>
                        <input
                          id="issuer"
                          name="issuer"
                          maxLength={120}
                          required
                        />
                        <label htmlFor="reference">
                          Document reference (non-sensitive)
                        </label>
                        <input
                          id="reference"
                          name="reference"
                          maxLength={120}
                          required
                        />
                        <label htmlFor="mediaType">Document type</label>
                        <select id="mediaType" name="mediaType">
                          <option>application/pdf</option>
                          <option>text/plain</option>
                          <option>application/json</option>
                          <option>image/png</option>
                          <option>image/jpeg</option>
                        </select>
                        <label htmlFor="byteLength">
                          Document size in bytes (metadata only)
                        </label>
                        <input
                          id="byteLength"
                          name="byteLength"
                          type="number"
                          min={1}
                          max={5242880}
                          required
                        />
                        <button type="submit" disabled={busy}>
                          Submit untrusted metadata
                        </button>
                      </form>
                    )}
                  </>
                )}
              </section>
              {view.evidence &&
                view.allowedClaims.length > 0 &&
                !view.readiness.disputed && (
                  <section>
                    <h2>Independent human observation</h2>
                    <p>
                      Record only non-sensitive identifiers. Do not paste
                      invoices, screenshots, credentials or URLs. A source claim
                      is your responsibility; the app cannot prove that you
                      accessed the issuer.
                    </p>
                    <label htmlFor="hash-file">
                      Optional: hash a local document (never uploaded; maximum 5
                      MiB)
                    </label>
                    <input
                      id="hash-file"
                      type="file"
                      disabled={busy}
                      accept="application/pdf,text/plain,application/json,image/png,image/jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void run(async () => {
                          if (
                            file.size < 1 ||
                            file.size > 5242880 ||
                            ![
                              "application/pdf",
                              "text/plain",
                              "application/json",
                              "image/png",
                              "image/jpeg",
                            ].includes(file.type)
                          )
                            throw new Error(
                              "Unsupported file type or size. No file was uploaded.",
                            );
                          const hash = await crypto.subtle.digest(
                            "SHA-256",
                            await file.arrayBuffer(),
                          );
                          setDigest(
                            [...new Uint8Array(hash)]
                              .map((b) => b.toString(16).padStart(2, "0"))
                              .join(""),
                          );
                        });
                        e.target.value = "";
                      }}
                    />
                    <form
                      key={view.evidence.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        setDraft(null);
                        const f = new FormData(e.currentTarget);
                        void run(async () => {
                          setDraft(
                            reviewInput.parse({
                              claim: f.get("claim"),
                              decision: f.get("decision"),
                              observation: {
                                source: f.get("source"),
                                issuer: f.get("observedIssuer"),
                                reference: f.get("observedReference"),
                                observedAtNs: (
                                  BigInt(Date.now()) * 1000000n
                                ).toString(),
                                event: f.get("event"),
                                recipient: f.get("recipient"),
                                amountAtomic: f.get("amount"),
                                evidenceDigest: f.get("digest"),
                                independentlyObtained:
                                  f.get("independent") === "on",
                              },
                            }),
                          );
                        });
                      }}
                    >
                      <label htmlFor="claim">Claim</label>
                      <select id="claim" name="claim">
                        {view.allowedClaims.map((c) => (
                          <option key={c} value={c}>
                            {labels[c]}
                          </option>
                        ))}
                      </select>
                      <label htmlFor="decision">Decision</label>
                      <select id="decision" name="decision">
                        <option value="APPROVE">Approve supported claim</option>
                        <option value="REJECT">Reject claim</option>
                        <option value="UNVERIFIABLE">
                          Cannot verify source
                        </option>
                        <option value="PENDING">
                          Source temporarily unavailable
                        </option>
                        <option value="DISPUTE">Dispute delivery</option>
                      </select>
                      <label htmlFor="source">How you obtained evidence</label>
                      <select id="source" name="source">
                        <option value="AUTHENTICATED_PROVIDER_PORTAL">
                          My authenticated provider portal
                        </option>
                        <option value="AUTHENTICATED_ISSUER_COMMUNICATION">
                          My authenticated issuer communication
                        </option>
                        <option value="LOCAL_EXERCISE">
                          Local exercise — never live evidence
                        </option>
                        <option value="OWNER_DECISION">
                          Separate owner payment decision
                        </option>
                      </select>
                      <label htmlFor="event">Observed event</label>
                      <select id="event" name="event">
                        <option value="SERVICE_ACTIVATED">
                          Service activated
                        </option>
                        <option value="SERVICE_FULFILLED">
                          Service fulfilled
                        </option>
                        <option value="INVOICE_ISSUED">
                          Invoice issued only
                        </option>
                        <option value="MISSING">
                          No matching source record
                        </option>
                        <option value="UNAVAILABLE">
                          Source temporarily unavailable
                        </option>
                        <option value="DISPUTED">Delivery disputed</option>
                        <option value="OWNER_DECISION">
                          Owner payment decision
                        </option>
                      </select>
                      <label htmlFor="observedIssuer">
                        Independently observed issuer
                      </label>
                      <input
                        id="observedIssuer"
                        name="observedIssuer"
                        maxLength={120}
                        required
                      />
                      <label htmlFor="observedReference">
                        Independently observed reference
                      </label>
                      <input
                        id="observedReference"
                        name="observedReference"
                        maxLength={120}
                        required
                      />
                      <label htmlFor="observed-recipient">
                        Observed recipient
                      </label>
                      <input
                        id="observed-recipient"
                        name="recipient"
                        required
                      />
                      <label htmlFor="observed-amount">
                        Observed exact amount (yoctoNEAR)
                      </label>
                      <input
                        id="observed-amount"
                        name="amount"
                        required
                        inputMode="numeric"
                        maxLength={39}
                      />
                      <label htmlFor="observed-digest">
                        Independently obtained document SHA-256
                      </label>
                      <input
                        id="observed-digest"
                        name="digest"
                        value={digest}
                        onChange={(e) => setDigest(e.target.value)}
                        pattern="[0-9a-f]{64}"
                        required
                      />
                      <label className="check-label">
                        <input type="checkbox" name="independent" />I obtained
                        this evidence independently of the proposing agent using
                        my own authenticated source access.
                      </label>
                      <button type="submit" disabled={busy}>
                        Review exact decision
                      </button>
                    </form>
                  </section>
                )}
              {draft && (
                <section
                  ref={panel}
                  tabIndex={-1}
                  aria-label="Review exact decision"
                >
                  <h2>Review before wallet signing</h2>
                  <p>
                    {labels[draft.claim]} — {labels[draft.decision]}. Source:{" "}
                    {labels[draft.observation.source]}; event:{" "}
                    {labels[draft.observation.event]}.
                  </p>
                  <p>
                    Issuer/reference: {draft.observation.issuer} /{" "}
                    {draft.observation.reference}. Recipient:{" "}
                    {draft.observation.recipient}. Amount:{" "}
                    {atomicToNear(draft.observation.amountAtomic)} NEAR (
                    {draft.observation.amountAtomic} yoctoNEAR).
                  </p>
                  <p className="evidence-digest">
                    Observed digest: {draft.observation.evidenceDigest}
                  </p>
                  <p>
                    This signature records an offchain human decision only. It
                    cannot approve a blockchain payment. A dispute is terminal
                    in this application; it does not cancel a dispatched
                    transfer.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (origin !== location.origin)
                          throw new Error(
                            "Open the configured application origin to sign.",
                          );
                        const c = await api<
                          Challenge & {
                            expiresAt: string;
                            payload: Map1;
                            review: ReviewInput;
                            evidenceId: string;
                            submissionDigest: string;
                          }
                        >(`/evidence/${id}/challenge`, draft);
                        const metadataBytes = JSON.stringify({
                          sourceType: "HUMAN_REVIEW",
                          ...view.evidence?.metadata,
                        });
                        const digestBytes = await crypto.subtle.digest(
                          "SHA-256",
                          new TextEncoder().encode(metadataBytes),
                        );
                        const expectedDigest = [...new Uint8Array(digestBytes)]
                          .map((v) => v.toString(16).padStart(2, "0"))
                          .join("");
                        const p = map1.parse(c.payload);
                        const expected = reviewMessage({
                          organizationId: view.policy.organizationId,
                          policyDigest: view.proposal.policyDigest,
                          evidenceId: view.evidence?.id ?? "",
                          submissionDigest: expectedDigest,
                          review: draft,
                          payload: p,
                          challengeId: c.challengeId,
                          origin,
                          expiresAt: c.expiresAt,
                        });
                        if (
                          !validateMap1(
                            p,
                            view.proposal,
                            view.policy,
                            BigInt(Date.now()) * 1000000n,
                          ) ||
                          c.message !== expected ||
                          c.recipient !== origin ||
                          c.evidenceId !== view.evidence?.id ||
                          p.verifier_account !== session.accountId ||
                          p.claim_type !== draft.claim ||
                          p.proposal_id !== view.proposal.proposalId ||
                          p.mandate_id !== view.proposal.mandateId ||
                          p.network_id !== view.proposal.network ||
                          p.vault_account !== view.proposal.vaultAccount ||
                          p.recipient !== view.proposal.recipient ||
                          p.amount_atomic !== view.proposal.amountAtomic ||
                          p.evidence_digest !== view.proposal.evidenceDigest
                        )
                          throw new Error(
                            "Review challenge does not match the exact selected terms.",
                          );
                        const proof = await signChallenge(c, session.network);
                        if (proof.accountId !== session.accountId)
                          throw new Error(
                            "The signing wallet differs from this review account.",
                          );
                        const result = await api<View>(
                          `/evidence/${id}/verify`,
                          {
                            ...proof,
                            challengeId: c.challengeId,
                            network: session.network,
                          },
                        );
                        setView(result);
                        setDraft(null);
                        setNotice(
                          "Human decision recorded offchain. No blockchain transaction was sent.",
                        );
                      })
                    }
                  >
                    Sign offchain review message
                  </button>
                </section>
              )}
              <section>
                <h2>Signed human decisions</h2>
                {view.reviews.length === 0 ? (
                  <p>No signed decisions yet.</p>
                ) : (
                  view.reviews.map((r) => (
                    <article key={r.payload.nonce}>
                      <h3>{labels[r.payload.claim_type]}</h3>
                      <p>
                        {labels[r.status]} — {r.payload.verifier_account}
                      </p>
                      <p>
                        Human source: {labels[r.review.observation.source]}
                        {"; observed "}
                        {new Date(
                          Number(
                            BigInt(r.review.observation.observedAtNs) /
                              1000000n,
                          ),
                        ).toISOString()}
                        .
                      </p>
                      <p>
                        Valid until{" "}
                        {new Date(
                          Number(BigInt(r.payload.expires_at_ns) / 1000000n),
                        ).toISOString()}
                        .{" "}
                        {r.attestationStatus === "AWAITING_VERIFIER_SIGNATURE"
                          ? "Separate onchain wallet signature still required; contract not deployed."
                          : "No onchain attestation prepared."}
                      </p>
                      <details>
                        <summary>Inspect exact MAP-1 payload</summary>
                        <pre className="evidence-payload">
                          {JSON.stringify(r.payload, null, 2)}
                        </pre>
                      </details>
                    </article>
                  ))
                )}
              </section>
              <button type="button" disabled>
                Onchain attestation unavailable — not deployed
              </button>
            </>
          )}
        </>
      )}
      {busy && <p role="status">Working…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
