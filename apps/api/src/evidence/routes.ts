import { randomBytes, randomUUID } from "node:crypto";
import {
  canonicalPolicy,
  independentVerifierPolicy,
  listInput,
  mandatePolicy,
} from "@avroqen/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import {
  attestationIntent,
  canonicalReview,
  evidenceInput,
  evidenceParams,
  map1,
  map1For,
  type ReviewRecord,
  reviewInput,
  reviewMessage,
  reviewProof,
  simulatedReviewEligible,
  validateMap1,
} from "../../../../packages/domain/src/evidence.js";
import {
  canonicalProposal,
  preflight,
  proposalInput,
} from "../../../../packages/domain/src/proposals.js";
import {
  allowedReviewer,
  assessHumanObservation,
  readiness,
} from "../../../../services/verifier/src/index.js";
import { hash, verifyMessage } from "../identity/crypto.js";
import type { Context } from "../mandates/routes.js";

export async function intakeEvidence(
  db: pg.PoolClient,
  proposalId: string,
  mandateId: string,
  actor: string,
  body: unknown,
  deny: Context["deny"],
) {
  const input = evidenceInput.parse(body);
  const row = (
    await db.query(
      "SELECT canonical_payload FROM agent_proposals WHERE id=$1 AND mandate_id=$2 FOR UPDATE",
      [proposalId, mandateId],
    )
  ).rows[0];
  if (!row) return deny(404, "PROPOSAL_NOT_FOUND");
  const proposal = proposalInput.parse(JSON.parse(row.canonical_payload));
  if (input.evidenceDigest !== proposal.evidenceDigest)
    deny(409, "EVIDENCE_MISMATCH");
  const bytes = JSON.stringify(input);
  const prior = (
    await db.query(
      "SELECT id,canonical_metadata FROM evidence_submissions WHERE proposal_id=$1",
      [proposalId],
    )
  ).rows[0];
  if (prior) {
    if (prior.canonical_metadata !== bytes) deny(409, "EVIDENCE_IMMUTABLE");
    return { id: prior.id, status: "SUBMITTED", provenance: "UNTRUSTED_CLAIM" };
  }
  const id = randomUUID();
  await db.query(
    "INSERT INTO evidence_submissions(id,proposal_id,canonical_metadata) VALUES($1,$2,$3)",
    [id, proposalId, bytes],
  );
  await db.query(
    "INSERT INTO evidence_events(id,evidence_id,actor_account,event) VALUES($1,$2,$3,'SUBMITTED')",
    [randomUUID(), id, actor],
  );
  return { id, status: "SUBMITTED", provenance: "UNTRUSTED_CLAIM" };
}
export function evidenceRoutes(app: FastifyInstance, ctx: Context) {
  const { transaction, session, membership, deny, config, tokenOf, verifyKey } =
    ctx;
  const base = "/api/evidence/:proposalId";
  async function load(db: pg.PoolClient, req: FastifyRequest, write = false) {
    const { proposalId } = evidenceParams.parse(req.params);
    const who = await session(req, db, write);
    const row = (
      await db.query(
        "SELECT p.*,a.canonical_payload FROM agent_proposals a JOIN mandate_policies p ON p.id=a.mandate_id WHERE a.id=$1 AND p.network=$2",
        [proposalId, config.network],
      )
    ).rows[0];
    if (!row) return deny(404, "EVIDENCE_NOT_FOUND");
    const policy = mandatePolicy.parse(JSON.parse(row.canonical_policy)),
      proposal = proposalInput.parse(JSON.parse(row.canonical_payload));
    const proposalCheck = preflight(proposal, policy, row.policy_digest, 0n);
    if (
      policy.mandateId !== row.id ||
      policy.organizationId !== row.org_id ||
      policy.ownerAccount !== row.owner_account ||
      policy.agentId !== row.agent_id ||
      policy.network !== config.network ||
      canonicalPolicy(policy) !== row.canonical_policy ||
      hash(row.canonical_policy) !== row.policy_digest ||
      canonicalProposal(proposal) !== row.canonical_payload ||
      proposal.policyDigest !== row.policy_digest ||
      proposal.mandateId !== policy.mandateId ||
      proposal.organizationId !== policy.organizationId ||
      (!proposalCheck.accepted &&
        proposalCheck.code !== "UNSAFE_VERIFIER_POLICY")
    )
      deny(503, "POLICY_INTEGRITY_FAILED");
    const assigned =
      policy.verifierPolicy.accounts.includes(who.account_id) &&
      who.account_id !== policy.agentAccount;
    const original = who.account_id === policy.ownerAccount;
    // Designated verifier assignment grants only evidence access, not org membership.
    const role =
      !assigned || original
        ? await membership(db, who, policy.organizationId, false)
        : null;
    const consent = (
      await db.query(
        `SELECT status FROM mandate_consents WHERE mandate_id=$1 ${write ? "FOR UPDATE" : ""}`,
        [policy.mandateId],
      )
    ).rows[0];
    const agent = (
      await db.query(
        `SELECT disabled_at,near_account,network FROM registered_agents WHERE id=$1 AND org_id=$2 ${write ? "FOR SHARE" : ""}`,
        [policy.agentId, policy.organizationId],
      )
    ).rows[0];
    const agentActive =
      !!agent &&
      !agent.disabled_at &&
      agent.near_account === policy.agentAccount &&
      agent.network === config.network;
    if (write) {
      if (!independentVerifierPolicy(policy).eligible)
        deny(409, "UNSAFE_VERIFIER_POLICY");
      if (consent?.status !== "CONSENT_APPROVED_OFFCHAIN")
        deny(409, "CONSENT_UNAVAILABLE");
      if (!agentActive) deny(403, "AGENT_DISABLED");
    }
    const evidence = (
      await db.query(
        `SELECT * FROM evidence_submissions WHERE proposal_id=$1 ${write ? "FOR UPDATE" : ""}`,
        [proposalId],
      )
    ).rows[0];
    const now = BigInt(
      (
        await db.query(
          "SELECT trunc(extract(epoch FROM clock_timestamp())*1000000000)::text AS ns",
        )
      ).rows[0].ns,
    );
    if (write && now >= BigInt(policy.expiresAtNs))
      deny(409, "MANDATE_EXPIRED");
    if (write) await session(req, db, true);
    return {
      who,
      row,
      policy,
      proposal,
      evidence,
      now,
      assigned,
      original,
      role,
      consent: consent?.status,
      agentActive,
    };
  }
  async function records(
    db: pg.PoolClient,
    id: string,
  ): Promise<ReviewRecord[]> {
    return (
      await db.query(
        "SELECT canonical_review,canonical_payload,status FROM evidence_reviews WHERE evidence_id=$1 ORDER BY created_at,id",
        [id],
      )
    ).rows.map((r) => ({
      review: reviewInput.parse(JSON.parse(r.canonical_review)),
      payload: map1.parse(JSON.parse(r.canonical_payload)),
      status: r.status,
    }));
  }
  async function view(
    db: pg.PoolClient,
    data: Awaited<ReturnType<typeof load>>,
  ) {
    const rs = data.evidence ? await records(db, data.evidence.id) : [];
    const summary = readiness(data.policy, rs, data.now, {
      enabled: config.testnetSimulationEnabled,
      proposal: data.proposal,
    });
    const verifierPolicyStatus = independentVerifierPolicy(data.policy);
    const active =
      verifierPolicyStatus.eligible &&
      data.agentActive &&
      data.consent === "CONSENT_APPROVED_OFFCHAIN" &&
      data.now < BigInt(data.policy.expiresAtNs);
    if (!active) summary.offchainReady = false;
    return {
      proposal: data.proposal,
      policy: data.policy,
      verifierPolicyStatus,
      evidence: data.evidence
        ? {
            id: data.evidence.id,
            metadata: evidenceInput.parse(
              JSON.parse(data.evidence.canonical_metadata),
            ),
            status: summary.disputed
              ? "DISPUTED"
              : summary.offchainReady
                ? summary.simulation.eligibleClaims.length > 0
                  ? "SIMULATION_READY"
                  : "VERIFIED"
                : rs.length
                  ? "PENDING_REVIEW"
                  : "SUBMITTED",
            provenance: "UNTRUSTED_CLAIM",
          }
        : null,
      reviews: rs.map((r) => {
        const simulated = simulatedReviewEligible(
          r,
          data.proposal,
          data.policy,
          data.now,
          config.testnetSimulationEnabled,
        );
        return {
          ...r,
          sourceClassification:
            r.review.observation.source === "LOCAL_EXERCISE"
              ? "TESTNET_SIMULATION_NOT_INDEPENDENT_COMMERCIAL_VERIFICATION"
              : "HUMAN_ASSERTION_NOT_AUTOMATED_PROVIDER_VERIFICATION",
          simulation: {
            enabled: config.testnetSimulationEnabled,
            eligible: simulated,
            provenance:
              r.review.observation.source === "LOCAL_EXERCISE"
                ? "LOCAL_EXERCISE_SYNTHETIC_ONLY"
                : null,
          },
          attestationStatus:
            active &&
            BigInt(r.payload.expires_at_ns) > data.now &&
            ((r.status === "VERIFIED" && !summary.disputed) ||
              r.status === "DISPUTED" ||
              (simulated && !summary.disputed))
              ? "AWAITING_VERIFIER_SIGNATURE"
              : "NOT_PREPARED",
          intent:
            active &&
            BigInt(r.payload.expires_at_ns) > data.now &&
            ((r.status === "VERIFIED" && !summary.disputed) ||
              r.status === "DISPUTED" ||
              (simulated && !summary.disputed))
              ? attestationIntent(r.payload, data.policy)
              : null,
        };
      }),
      readiness: summary,
      deploymentStatus: "NOT_DEPLOYED",
      allowedClaims: verifierPolicyStatus.eligible
        ? [
            "INVOICE_ISSUED",
            "SERVICE_CONFIRMED",
            "OWNER_APPROVED",
            "DELIVERY_DISPUTED",
          ].filter((c) =>
            allowedReviewer(
              data.policy,
              data.who.account_id,
              c as ReviewRecord["payload"]["claim_type"],
            ),
          )
        : [],
    };
  }
  app.get("/api/verifier/proposals", async (req) =>
    transaction(async (db) => {
      const who = await session(req, db),
        { offset } = listInput.parse(req.query);
      const rows = (
        await db.query(
          `SELECT a.id,p.org_id,p.canonical_policy,a.canonical_payload FROM agent_proposals a JOIN mandate_policies p ON p.id=a.mandate_id WHERE p.network=$1 AND p.agent_account<>$2 AND p.canonical_policy::jsonb->'verifierPolicy'->'accounts' ? $2 ORDER BY a.id LIMIT 50 OFFSET $3`,
          [config.network, who.account_id, offset],
        )
      ).rows;
      return {
        proposals: rows.map((r) => ({
          proposalId: r.id,
          organizationId: r.org_id,
          task: JSON.parse(r.canonical_policy).taskReference,
          proposal: proposalInput.parse(JSON.parse(r.canonical_payload)),
        })),
        nextOffset: rows.length === 50 ? offset + 50 : null,
      };
    }),
  );
  app.get(base, async (req) =>
    transaction(async (db) => view(db, await load(db, req))),
  );
  app.post(`${base}/intake`, async (req) =>
    transaction(async (db) => {
      const d = await load(db, req, true);
      if (!d.original || d.role !== "owner") deny(403, "OWNER_REQUIRED");
      return intakeEvidence(
        db,
        d.proposal.proposalId,
        d.policy.mandateId,
        d.who.account_id,
        req.body,
        deny,
      );
    }),
  );
  async function permitted(
    db: pg.PoolClient,
    d: Awaited<ReturnType<typeof load>>,
    input: ReturnType<typeof reviewInput.parse>,
  ) {
    if (!d.evidence) deny(409, "EVIDENCE_REQUIRED");
    if (!allowedReviewer(d.policy, d.who.account_id, input.claim))
      deny(403, "VERIFIER_REQUIRED");
    if (
      d.original &&
      (input.claim === "OWNER_APPROVED" ||
        input.claim === "DELIVERY_DISPUTED") &&
      d.role !== "owner"
    )
      deny(403, "OWNER_REQUIRED");
    const rs = await records(db, d.evidence.id);
    if (rs.some((r) => r.status === "DISPUTED")) deny(409, "DELIVERY_DISPUTED");
    if (
      rs.some(
        (r) =>
          r.payload.verifier_account === d.who.account_id &&
          r.payload.claim_type === input.claim &&
          ["VERIFIED", "REJECTED", "DISPUTED", "SYNTHETIC_ONLY"].includes(
            r.status,
          ) &&
          BigInt(r.payload.expires_at_ns) > d.now,
      )
    )
      deny(409, "REVIEW_ALREADY_FINAL");
    if (rs.length >= 128) deny(409, "REVIEW_LIMIT");
    const meta = evidenceInput.parse(JSON.parse(d.evidence.canonical_metadata));
    if (
      input.decision === "APPROVE" &&
      input.claim !== "OWNER_APPROVED" &&
      (input.observation.issuer !== meta.issuer ||
        input.observation.reference !== meta.reference)
    )
      deny(400, "SOURCE_REFERENCE_MISMATCH");
    const status = assessHumanObservation(input, d.proposal, d.now);
    if (
      ![
        "VERIFIED",
        "REJECTED",
        "UNVERIFIABLE",
        "PENDING_REVIEW",
        "DISPUTED",
        "SYNTHETIC_ONLY",
      ].includes(status)
    )
      deny(400, status);
    return status;
  }
  app.post(`${base}/challenge`, async (req) => {
    const input = reviewInput.parse(req.body);
    return transaction(async (db) => {
      const d = await load(db, req, true);
      await permitted(db, d, input);
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM evidence_challenges WHERE evidence_id=$1",
          [d.evidence.id],
        )
      ).rows[0].n;
      if (count >= 256) deny(409, "CHALLENGE_LIMIT");
      const id = randomUUID(),
        nonce = randomBytes(32),
        expiry = new Date(Number(d.now / 1000000n) + 300000);
      const end =
        d.now + 900000000000n < BigInt(d.policy.expiresAtNs)
          ? d.now + 900000000000n
          : BigInt(d.policy.expiresAtNs);
      const payload = map1For(
        d.proposal,
        input,
        d.who.account_id,
        randomUUID(),
        d.now,
        end,
      );
      const message = reviewMessage({
        organizationId: d.policy.organizationId,
        policyDigest: d.row.policy_digest,
        evidenceId: d.evidence.id,
        submissionDigest: hash(d.evidence.canonical_metadata),
        review: input,
        payload,
        challengeId: id,
        origin: config.origin,
        expiresAt: expiry.toISOString(),
      });
      await db.query(
        "INSERT INTO evidence_challenges(id,evidence_id,session_hash,actor_account,canonical_review,canonical_payload,nonce,message,origin,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          id,
          d.evidence.id,
          hash(tokenOf(req)),
          d.who.account_id,
          canonicalReview(input),
          JSON.stringify(payload),
          nonce,
          message,
          config.origin,
          expiry,
        ],
      );
      await db.query(
        "INSERT INTO evidence_events(id,evidence_id,actor_account,event) VALUES($1,$2,$3,'CHALLENGE_CREATED')",
        [randomUUID(), d.evidence.id, d.who.account_id],
      );
      return {
        challengeId: id,
        nonce: nonce.toString("base64"),
        message,
        recipient: config.origin,
        expiresAt: expiry.toISOString(),
        payload,
        review: input,
        evidenceId: d.evidence.id,
        submissionDigest: hash(d.evidence.canonical_metadata),
      };
    });
  });
  app.post(`${base}/verify`, async (req) => {
    const input = reviewProof.parse(req.body);
    const inspect = async (db: pg.PoolClient) => {
      const d = await load(db, req, true);
      if (input.accountId !== d.who.account_id)
        deny(401, "REVIEW_PROOF_ACCOUNT_MISMATCH");
      if (input.network !== config.network)
        deny(401, "REVIEW_PROOF_NETWORK_MISMATCH");
      if (!d.evidence) deny(401, "REVIEW_PROOF_EVIDENCE_UNAVAILABLE");
      const c = (
        await db.query(
          `SELECT *,session_hash=$3 AS session_matches,
            expires_at>clock_timestamp() AS unexpired
           FROM evidence_challenges WHERE id=$1 AND evidence_id=$2`,
          [input.challengeId, d.evidence.id, hash(tokenOf(req))],
        )
      ).rows[0];
      if (!c) return deny(401, "REVIEW_PROOF_CHALLENGE_UNAVAILABLE");
      if (!c.session_matches) deny(401, "REVIEW_PROOF_SESSION_MISMATCH");
      if (c.actor_account !== d.who.account_id)
        deny(401, "REVIEW_PROOF_ACTOR_MISMATCH");
      if (c.origin !== config.origin) deny(401, "REVIEW_PROOF_ORIGIN_MISMATCH");
      if (c.consumed_at) deny(401, "REVIEW_PROOF_CHALLENGE_CONSUMED");
      if (!c.unexpired) deny(401, "REVIEW_PROOF_CHALLENGE_EXPIRED");
      let review: ReturnType<typeof reviewInput.parse>;
      let payload: ReturnType<typeof map1.parse>;
      try {
        review = reviewInput.parse(JSON.parse(c.canonical_review));
        payload = map1.parse(JSON.parse(c.canonical_payload));
      } catch {
        return deny(401, "REVIEW_PROOF_PAYLOAD_MISMATCH");
      }
      const status = await permitted(db, d, review);
      if (
        !validateMap1(payload, d.proposal, d.policy, d.now) ||
        payload.verifier_account !== d.who.account_id ||
        payload.claim_type !== review.claim
      )
        deny(401, "REVIEW_PROOF_PAYLOAD_MISMATCH");
      const message = reviewMessage({
        organizationId: d.policy.organizationId,
        policyDigest: d.row.policy_digest,
        evidenceId: d.evidence.id,
        submissionDigest: hash(d.evidence.canonical_metadata),
        review,
        payload,
        challengeId: input.challengeId,
        origin: config.origin,
        expiresAt: c.expires_at.toISOString(),
      });
      if (message !== c.message) deny(401, "REVIEW_PROOF_MESSAGE_MISMATCH");
      if (
        !verifyMessage(
          {
            message,
            nonce: c.nonce,
            recipient: config.origin,
            callback_url: "",
          },
          input.publicKey,
          input.signature,
        )
      )
        deny(401, "REVIEW_PROOF_SIGNATURE_INVALID");
      await session(req, db, true);
      return { d, c, review, payload, status };
    };
    await transaction(inspect);
    if (!(await verifyKey(input.accountId, input.publicKey)))
      deny(401, "REVIEW_PROOF_KEY_NOT_AUTHORIZED");
    return transaction(async (db) => {
      const { d, c, review, payload, status } = await inspect(db);
      const used = await db.query(
        "UPDATE evidence_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING id",
        [c.id],
      );
      if (used.rowCount !== 1) deny(401, "REVIEW_PROOF_CONSUME_RACE");
      const id = randomUUID();
      await db.query(
        "INSERT INTO evidence_reviews(id,evidence_id,challenge_id,actor_account,claim,status,canonical_review,canonical_payload,attestation_nonce) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          d.evidence.id,
          c.id,
          d.who.account_id,
          review.claim,
          status,
          canonicalReview(review),
          JSON.stringify(payload),
          payload.nonce,
        ],
      );
      await db.query(
        "INSERT INTO evidence_events(id,evidence_id,review_id,actor_account,event) VALUES($1,$2,$3,$4,'DECISION_SIGNED')",
        [randomUUID(), d.evidence.id, id, d.who.account_id],
      );
      return view(db, d);
    });
  });
}
