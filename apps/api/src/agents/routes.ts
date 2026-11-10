import { randomBytes, randomUUID } from "node:crypto";
import {
  canonicalPolicy,
  independentVerifierPolicy,
  listInput,
  mandateParams,
  mandatePolicy,
} from "@avroqen/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import {
  denialReasons,
  prepareProposal,
  runtimeTool,
} from "../../../../packages/agent/src/runtime.js";
import {
  canonicalProposal,
  credentialIssueInput,
  credentialRevokeInput,
  preflight,
  proposalInput,
} from "../../../../packages/domain/src/proposals.js";
import { intakeEvidence } from "../evidence/routes.js";
import { hash } from "../identity/crypto.js";
import type { Context } from "../mandates/routes.js";

export function agentRoutes(app: FastifyInstance, ctx: Context) {
  const { transaction, session, membership, deny, config } = ctx;
  const base = "/api/organizations/:orgId/mandates/:mandateId";
  async function event(
    db: pg.PoolClient,
    mandate: string,
    credential: string | null,
    name: string,
    reason = name,
    proposal: string | null = null,
  ) {
    await db.query(
      "INSERT INTO agent_events(id,mandate_id,credential_id,proposal_id,event,reason) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), mandate, credential, proposal, name, reason],
    );
  }
  async function policyRow(db: pg.PoolClient, id: string) {
    const row = (
      await db.query(
        "SELECT * FROM mandate_policies WHERE id=$1 AND network=$2",
        [id, config.network],
      )
    ).rows[0];
    if (!row) return deny(404, "MANDATE_NOT_FOUND");
    const policy = mandatePolicy.parse(JSON.parse(row.canonical_policy));
    if (
      canonicalPolicy(policy) !== row.canonical_policy ||
      hash(row.canonical_policy) !== row.policy_digest ||
      policy.mandateId !== row.id ||
      policy.organizationId !== row.org_id ||
      policy.ownerAccount !== row.owner_account ||
      policy.agentId !== row.agent_id ||
      policy.network !== config.network
    )
      deny(503, "POLICY_INTEGRITY_FAILED");
    return { row, policy };
  }
  async function live(
    db: pg.PoolClient,
    data: Awaited<ReturnType<typeof policyRow>>,
  ) {
    const { row, policy } = data;
    if (!independentVerifierPolicy(policy).eligible)
      deny(409, "UNSAFE_VERIFIER_POLICY");
    const consent = (
      await db.query(
        "SELECT status FROM mandate_consents WHERE mandate_id=$1 FOR UPDATE",
        [row.id],
      )
    ).rows[0];
    if (consent?.status !== "CONSENT_APPROVED_OFFCHAIN")
      deny(409, "CONSENT_UNAVAILABLE");
    const agent = (
      await db.query(
        "SELECT * FROM registered_agents WHERE id=$1 AND org_id=$2 AND network=$3 FOR SHARE",
        [policy.agentId, policy.organizationId, config.network],
      )
    ).rows[0];
    if (
      !agent ||
      agent.disabled_at ||
      agent.near_account !== policy.agentAccount
    )
      deny(403, "AGENT_DISABLED");
    await time(db, policy.expiresAtNs);
  }
  async function time(db: pg.PoolClient, expires: string) {
    const now = (
      await db.query(
        "SELECT trunc(extract(epoch FROM clock_timestamp())*1000000000)::text AS ns",
      )
    ).rows[0].ns as string;
    if (BigInt(now) >= BigInt(expires)) deny(409, "MANDATE_EXPIRED");
    return BigInt(now);
  }
  async function owner(db: pg.PoolClient, req: FastifyRequest, write: boolean) {
    const params = mandateParams.parse(req.params);
    const who = await session(req, db, write);
    const role = await membership(db, who, params.orgId, false);
    const data = await policyRow(db, params.mandateId);
    if (data.policy.organizationId !== params.orgId)
      deny(404, "MANDATE_NOT_FOUND");
    if (
      write &&
      (role !== "owner" || who.account_id !== data.policy.ownerAccount)
    )
      deny(403, "OWNER_REQUIRED");
    return data;
  }
  async function authenticate(db: pg.PoolClient, req: FastifyRequest) {
    const header = req.headers.authorization;
    if (!header || !/^Bearer [0-9a-f]{64}$/.test(header))
      return deny(401, "AGENT_CREDENTIAL_INVALID");
    const tokenHash = hash(header.slice(7));
    const initial = (
      await db.query(
        "SELECT id,mandate_id FROM agent_credentials WHERE token_hash=$1",
        [tokenHash],
      )
    ).rows[0];
    if (!initial) return deny(401, "AGENT_CREDENTIAL_INVALID");
    const data = await policyRow(db, initial.mandate_id);
    const role = (
      await db.query(
        "SELECT role FROM memberships WHERE org_id=$1 AND network=$2 AND account_id=$3 AND status='active' FOR SHARE",
        [data.policy.organizationId, config.network, data.policy.ownerAccount],
      )
    ).rows[0]?.role;
    if (role !== "owner") deny(403, "OWNER_ACCESS_REVOKED");
    await live(db, data);
    const credential = (
      await db.query(
        "SELECT * FROM agent_credentials WHERE id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE",
        [initial.id, tokenHash],
      )
    ).rows[0];
    if (!credential || credential.issuer_account !== data.policy.ownerAccount)
      return deny(401, "AGENT_CREDENTIAL_INVALID");
    // Recheck time after all potentially blocking locks.
    const valid = (
      await db.query(
        "SELECT expires_at>clock_timestamp() AS valid FROM agent_credentials WHERE id=$1",
        [credential.id],
      )
    ).rows[0]?.valid;
    if (!valid) deny(401, "AGENT_CREDENTIAL_INVALID");
    const now = await time(db, data.policy.expiresAtNs);
    return { ...data, credential, now };
  }
  app.post(`${base}/credentials`, async (req) => {
    const input = credentialIssueInput.parse(req.body);
    return transaction(async (db) => {
      const data = await owner(db, req, true);
      await live(db, data);
      if (input.rotateId) {
        const revoked = await db.query(
          "UPDATE agent_credentials SET revoked_at=clock_timestamp() WHERE id=$1 AND mandate_id=$2 AND revoked_at IS NULL RETURNING id",
          [input.rotateId, data.row.id],
        );
        if (!revoked.rowCount) deny(404, "CREDENTIAL_NOT_FOUND");
        await event(
          db,
          data.row.id,
          input.rotateId,
          "CREDENTIAL_REVOKED",
          "ROTATED",
        );
      }
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM agent_credentials WHERE mandate_id=$1",
          [data.row.id],
        )
      ).rows[0].n;
      if (count >= 128) deny(409, "CREDENTIAL_LIMIT");
      await session(req, db, true);
      await time(db, data.policy.expiresAtNs);
      const token = randomBytes(32).toString("hex"),
        id = randomUUID();
      const result = await db.query(
        "WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now) INSERT INTO agent_credentials(id,token_hash,mandate_id,issuer_account,purpose,created_at,expires_at) SELECT $1,$2,$3,$4,$5,now,LEAST(now+$6::interval,to_timestamp(($7::numeric/1000000000)::double precision)) FROM instant RETURNING expires_at",
        [
          id,
          hash(token),
          data.row.id,
          data.policy.ownerAccount,
          input.purpose,
          input.purpose === "demo" ? "15 minutes" : "24 hours",
          data.policy.expiresAtNs,
        ],
      );
      await event(
        db,
        data.row.id,
        id,
        input.rotateId ? "CREDENTIAL_ROTATED" : "CREDENTIAL_ISSUED",
      );
      return {
        id,
        token,
        expiresAt: result.rows[0].expires_at,
        scope: "OFFCHAIN_PROPOSALS_ONLY",
      };
    });
  });
  app.post(`${base}/credentials/revoke`, async (req) => {
    const { credentialId } = credentialRevokeInput.parse(req.body);
    return transaction(async (db) => {
      const data = await owner(db, req, true);
      // Available even if consent or agent is disabled/expired.
      await db.query(
        "SELECT mandate_id FROM mandate_consents WHERE mandate_id=$1 FOR UPDATE",
        [data.row.id],
      );
      const exists = (
        await db.query(
          "SELECT id FROM agent_credentials WHERE id=$1 AND mandate_id=$2 FOR UPDATE",
          [credentialId, data.row.id],
        )
      ).rows[0];
      if (!exists) deny(404, "CREDENTIAL_NOT_FOUND");
      await session(req, db, true);
      const changed = await db.query(
        "UPDATE agent_credentials SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL RETURNING id",
        [credentialId],
      );
      if (changed.rowCount)
        await event(db, data.row.id, credentialId, "CREDENTIAL_REVOKED");
      return { revoked: true, onchainAuthorityChanged: false };
    });
  });
  app.get(`${base}/credentials`, async (req) =>
    transaction(async (db) => {
      const data = await owner(db, req, true);
      const result = await db.query(
        'SELECT id,purpose,expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM agent_credentials WHERE mandate_id=$1 ORDER BY created_at DESC LIMIT 128',
        [data.row.id],
      );
      return { credentials: result.rows };
    }),
  );
  app.get(`${base}/proposals`, async (req) =>
    transaction(async (db) => {
      const { offset } = listInput.parse(req.query);
      const data = await owner(db, req, false);
      const result = await db.query(
        "SELECT canonical_payload,status,created_at FROM agent_proposals WHERE mandate_id=$1 ORDER BY created_at,id LIMIT 50 OFFSET $2",
        [data.row.id, offset],
      );
      return {
        proposals: result.rows.map((r) => ({
          proposal: JSON.parse(r.canonical_payload),
          status: r.status,
          createdAt: r.created_at,
          onchainStatus: "NOT_SUBMITTED",
        })),
        nextOffset: result.rows.length === 50 ? offset + 50 : null,
      };
    }),
  );
  app.post("/api/agent/tools", async (req) => {
    const input = runtimeTool.parse(req.body);
    return transaction(async (db) => {
      const data = await authenticate(db, req);
      if (input.tool === "submit_evidence") {
        const result = await intakeEvidence(
          db,
          input.proposalId,
          data.row.id,
          data.policy.agentAccount,
          input.evidence,
          deny,
        );
        await time(db, data.policy.expiresAtNs);
        const valid = (
          await db.query(
            "SELECT expires_at>clock_timestamp() AS valid FROM agent_credentials WHERE id=$1",
            [data.credential.id],
          )
        ).rows[0]?.valid;
        if (!valid) deny(401, "AGENT_CREDENTIAL_INVALID");
        return result;
      }
      if (input.tool === "denial_reasons") return { reasons: denialReasons };
      if (input.tool === "mandate_summary")
        return {
          policy: data.policy,
          policyDigest: data.row.policy_digest,
          advisoryOnly: true,
          onchainStatus: "NOT_SUBMITTED",
        };
      if (input.tool === "proposal_status") {
        const r = (
          await db.query(
            "SELECT canonical_payload,status,created_at FROM agent_proposals WHERE id=$1 AND mandate_id=$2",
            [input.proposalId, data.row.id],
          )
        ).rows[0];
        if (!r) return deny(404, "PROPOSAL_NOT_FOUND");
        return {
          proposal: JSON.parse(r.canonical_payload),
          status: r.status,
          createdAt: r.created_at,
          onchainStatus: "NOT_SUBMITTED",
        };
      }
      if (input.tool === "prepare") {
        const result = prepareProposal(
          input.task,
          data.policy,
          data.row.policy_digest,
          data.now,
        );
        if (!result.preflight.accepted)
          await event(
            db,
            data.row.id,
            data.credential.id,
            "PREFLIGHT_REJECTED",
            result.preflight.code,
          );
        return result;
      }
      const proposal = proposalInput.parse(input.proposal);
      const check = preflight(
        proposal,
        data.policy,
        data.row.policy_digest,
        data.now,
      );
      if (!check.accepted) {
        await event(
          db,
          data.row.id,
          data.credential.id,
          "PREFLIGHT_REJECTED",
          check.code,
        );
        return {
          status: "PREFLIGHT_REJECTED",
          code: check.code,
          onchainStatus: "NOT_SUBMITTED",
        };
      }
      const canonical = canonicalProposal(proposal);
      const prior = (
        await db.query(
          "SELECT canonical_payload FROM agent_proposals WHERE mandate_id=$1 AND idempotency_key=$2",
          [data.row.id, proposal.idempotencyKey],
        )
      ).rows[0];
      if (prior) {
        if (prior.canonical_payload !== canonical)
          deny(409, "IDEMPOTENCY_CONFLICT");
        return {
          proposal,
          status: "SUBMITTED_OFFCHAIN",
          onchainStatus: "NOT_SUBMITTED",
          replayed: true,
        };
      }
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM agent_proposals WHERE mandate_id=$1",
          [data.row.id],
        )
      ).rows[0].n;
      if (count >= 128) deny(409, "PROPOSAL_LIMIT");
      await time(db, data.policy.expiresAtNs);
      const valid = (
        await db.query(
          "SELECT expires_at>clock_timestamp() AS valid FROM agent_credentials WHERE id=$1",
          [data.credential.id],
        )
      ).rows[0].valid;
      if (!valid) deny(401, "AGENT_CREDENTIAL_INVALID");
      await db.query(
        "INSERT INTO agent_proposals(id,mandate_id,idempotency_key,canonical_payload) VALUES($1,$2,$3,$4)",
        [proposal.proposalId, data.row.id, proposal.idempotencyKey, canonical],
      );
      await event(
        db,
        data.row.id,
        data.credential.id,
        "PROPOSAL_SUBMITTED",
        "OFFCHAIN_ONLY",
        proposal.proposalId,
      );
      return {
        proposal,
        status: "SUBMITTED_OFFCHAIN",
        onchainStatus: "NOT_SUBMITTED",
        replayed: false,
      };
    });
  });
}
