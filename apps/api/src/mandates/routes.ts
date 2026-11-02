import { randomBytes, randomUUID } from "node:crypto";
import {
  type ConsentAction,
  canonicalPolicy,
  consentChallengeInput,
  consentMessage,
  consentProofInput,
  listInput,
  type MandateView,
  mandateDraftInput,
  mandateParams,
  mandatePolicy,
  organizationParams,
} from "@avroqen/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { hash, verifyMessage } from "../identity/crypto.js";
import type { IdentityOptions, Session } from "../identity/routes.js";

export interface Context extends IdentityOptions {
  deny: (status: number, code: string) => never;
  tokenOf: (request: FastifyRequest) => string;
  session: (
    request: FastifyRequest,
    db: pg.Pool | pg.PoolClient,
    mutation?: boolean,
  ) => Promise<Session>;
  membership: (
    db: pg.PoolClient,
    value: Session,
    org: string,
    write: boolean,
  ) => Promise<string>;
  transaction: <T>(work: (db: pg.PoolClient) => Promise<T>) => Promise<T>;
}
export function mandateRoutes(app: FastifyInstance, ctx: Context) {
  const { config, transaction, session, membership, deny, tokenOf, verifyKey } =
    ctx;
  const base = "/api/organizations/:orgId/mandates";
  async function access(
    db: pg.PoolClient,
    request: FastifyRequest,
    org: string,
    write: boolean,
  ) {
    const who = await session(request, db, write);
    const role = await membership(db, who, org, false);
    if (write && role !== "owner") deny(403, "OWNER_REQUIRED");
    return who;
  }
  async function load(
    db: pg.PoolClient,
    request: FastifyRequest,
    write: boolean,
  ) {
    const { orgId, mandateId } = mandateParams.parse(request.params);
    const who = await access(db, request, orgId, write);
    const result = await db.query(
      `SELECT p.*, c.status FROM mandate_policies p JOIN mandate_consents c ON c.mandate_id=p.id
       WHERE p.id=$1 AND p.org_id=$2 AND p.network=$3 ${write ? "FOR UPDATE OF c" : ""}`,
      [mandateId, orgId, config.network],
    );
    const row = result.rows[0];
    if (!row) return deny(404, "MANDATE_NOT_FOUND");
    if (write && row.owner_account !== who.account_id)
      deny(403, "OWNER_REQUIRED");
    const policy = mandatePolicy.parse(JSON.parse(row.canonical_policy));
    if (
      canonicalPolicy(policy) !== row.canonical_policy ||
      hash(row.canonical_policy) !== row.policy_digest
    )
      deny(503, "POLICY_INTEGRITY_FAILED");
    return { who, row, policy };
  }
  async function agent(db: pg.PoolClient, id: string, org: string) {
    const result = await db.query(
      "SELECT near_account,disabled_at FROM registered_agents WHERE id=$1 AND org_id=$2 AND network=$3 FOR SHARE",
      [id, org, config.network],
    );
    return result.rows[0];
  }
  async function expired(db: pg.PoolClient, ns: string): Promise<boolean> {
    return (
      await db.query(
        "SELECT $1::numeric <= trunc(extract(epoch FROM clock_timestamp())*1000000000) AS expired",
        [ns],
      )
    ).rows[0].expired;
  }
  async function view(
    db: pg.PoolClient,
    row: {
      canonical_policy: string;
      policy_digest: string;
      status: MandateView["consentStatus"];
    },
  ): Promise<MandateView> {
    const policy = mandatePolicy.parse(JSON.parse(row.canonical_policy));
    return {
      policy,
      policyDigest: row.policy_digest,
      consentStatus: row.status,
      onchainStatus: "NOT_SUBMITTED",
      expired: await expired(db, policy.expiresAtNs),
      agentDisabled: !!(await agent(db, policy.agentId, policy.organizationId))
        ?.disabled_at,
    };
  }
  async function event(
    db: pg.PoolClient,
    id: string,
    actor: string,
    digest: string,
    name: string,
    challenge?: string,
    key?: string,
  ) {
    await db.query(
      "INSERT INTO mandate_events(id,mandate_id,event,actor_account,policy_digest,challenge_id,public_key) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), id, name, actor, digest, challenge ?? null, key ?? null],
    );
  }
  async function allowed(
    db: pg.PoolClient,
    data: Awaited<ReturnType<typeof load>>,
    action: ConsentAction,
  ) {
    if (data.row.status === "CONSENT_REVOKED_OFFCHAIN")
      deny(409, "CONSENT_REVOKED");
    if (action === "APPROVE_CONSENT") {
      if (data.row.status !== "DRAFT") deny(409, "CONSENT_ALREADY_APPROVED");
      if (await expired(db, data.policy.expiresAtNs))
        deny(409, "MANDATE_EXPIRED");
      const current = await agent(
        db,
        data.policy.agentId,
        data.policy.organizationId,
      );
      if (
        !current ||
        current.disabled_at ||
        current.near_account !== data.policy.agentAccount
      )
        deny(409, "AGENT_DISABLED");
      // Agent row acquisition can wait; expiry must hold after that wait too.
      if (await expired(db, data.policy.expiresAtNs))
        deny(409, "MANDATE_EXPIRED");
    }
  }
  app.post(base, async (request, reply) => {
    const { orgId } = organizationParams.parse(request.params);
    const input = mandateDraftInput.parse(request.body);
    const result = await transaction(async (db) => {
      const who = await access(db, request, orgId, true);
      const selected = await agent(db, input.agentId, orgId);
      if (!selected || selected.disabled_at) deny(409, "AGENT_DISABLED");
      await session(request, db, true);
      if (await expired(db, input.expiresAtNs)) deny(400, "MANDATE_EXPIRED");
      const policy = mandatePolicy.parse({
        schemaVersion: 1,
        policyVersion: 1,
        mandateId: randomUUID(),
        organizationId: orgId,
        ownerAccount: who.account_id,
        network: config.network,
        agentAccount: selected.near_account,
        ...input,
      });
      const bytes = canonicalPolicy(policy),
        digest = hash(bytes);
      await db.query(
        `INSERT INTO mandate_policies(id,org_id,network,owner_account,agent_id,agent_account,canonical_policy,policy_digest,expires_at_ns) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          policy.mandateId,
          orgId,
          config.network,
          who.account_id,
          policy.agentId,
          policy.agentAccount,
          bytes,
          digest,
          policy.expiresAtNs,
        ],
      );
      await db.query("INSERT INTO mandate_consents(mandate_id) VALUES($1)", [
        policy.mandateId,
      ]);
      await event(
        db,
        policy.mandateId,
        who.account_id,
        digest,
        "DRAFT_CREATED",
      );
      return {
        policy,
        policyDigest: digest,
        consentStatus: "DRAFT",
        onchainStatus: "NOT_SUBMITTED",
        expired: false,
        agentDisabled: false,
      };
    });
    return reply.code(201).send(result);
  });
  app.get(base, async (request) => {
    const { orgId } = organizationParams.parse(request.params),
      { offset } = listInput.parse(request.query);
    return transaction(async (db) => {
      await access(db, request, orgId, false);
      const result = await db.query(
        "SELECT p.*,c.status FROM mandate_policies p JOIN mandate_consents c ON c.mandate_id=p.id WHERE p.org_id=$1 AND p.network=$2 ORDER BY p.id LIMIT 50 OFFSET $3",
        [orgId, config.network, offset],
      );
      const mandates: MandateView[] = [];
      for (const row of result.rows) mandates.push(await view(db, row));
      return {
        mandates,
        nextOffset: result.rows.length === 50 ? offset + 50 : null,
      };
    });
  });
  app.get(`${base}/:mandateId`, async (request) =>
    transaction(async (db) => {
      const data = await load(db, request, false);
      const events = await db.query(
        'SELECT event,actor_account AS "actorAccount",occurred_at AS "occurredAt",policy_digest AS "policyDigest" FROM mandate_events WHERE mandate_id=$1 ORDER BY occurred_at,id LIMIT 100',
        [data.policy.mandateId],
      );
      return { ...(await view(db, data.row)), events: events.rows };
    }),
  );
  app.post(`${base}/:mandateId/challenge`, async (request) => {
    const { action } = consentChallengeInput.parse(request.body);
    return transaction(async (db) => {
      const data = await load(db, request, true);
      await allowed(db, data, action);
      await session(request, db, true);
      const id = randomUUID(),
        nonce = randomBytes(32);
      const expiry = (
        await db.query(
          "SELECT clock_timestamp()+interval '5 minutes' AS expiry",
        )
      ).rows[0].expiry as Date;
      const message = consentMessage({
        action,
        policy: data.policy,
        policyDigest: data.row.policy_digest,
        challengeId: id,
        origin: config.origin,
        expiresAt: expiry.toISOString(),
      });
      await db.query(
        "INSERT INTO mandate_challenges(id,mandate_id,session_hash,action,origin,nonce,message,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          data.policy.mandateId,
          hash(tokenOf(request)),
          action,
          config.origin,
          nonce,
          message,
          expiry,
        ],
      );
      await event(
        db,
        data.policy.mandateId,
        data.who.account_id,
        data.row.policy_digest,
        "CHALLENGE_ISSUED",
        id,
      );
      return {
        challengeId: id,
        message,
        nonce: nonce.toString("base64"),
        recipient: config.origin,
        expiresAt: expiry.toISOString(),
      };
    });
  });
  app.post(`${base}/:mandateId/verify`, async (request) => {
    const input = consentProofInput.parse(request.body);
    const inspect = async (db: pg.PoolClient) => {
      const data = await load(db, request, true);
      if (
        input.accountId !== data.who.account_id ||
        input.network !== config.network
      )
        deny(401, "INVALID_PROOF");
      const result = await db.query(
        "SELECT * FROM mandate_challenges WHERE id=$1 AND mandate_id=$2 AND session_hash=$3 AND action=$4 AND origin=$5 AND consumed_at IS NULL AND expires_at>clock_timestamp()",
        [
          input.challengeId,
          data.policy.mandateId,
          hash(tokenOf(request)),
          input.action,
          config.origin,
        ],
      );
      const challenge = result.rows[0];
      if (!challenge) return deny(401, "INVALID_PROOF");
      await allowed(db, data, input.action);
      const expected = consentMessage({
        action: input.action,
        policy: data.policy,
        policyDigest: data.row.policy_digest,
        challengeId: input.challengeId,
        origin: config.origin,
        expiresAt: challenge.expires_at.toISOString(),
      });
      if (
        expected !== challenge.message ||
        !verifyMessage(
          {
            message: expected,
            nonce: challenge.nonce,
            recipient: config.origin,
            callback_url: "",
          },
          input.publicKey,
          input.signature,
        )
      )
        deny(401, "INVALID_PROOF");
      // Locks may have waited beyond the initial session lookup.
      await session(request, db, true);
      return data;
    };
    await transaction(inspect);
    // Never hold SQL locks during a network request. Recheck all state after RPC.
    if (!(await verifyKey(input.accountId, input.publicKey)))
      deny(401, "INVALID_PROOF");
    return transaction(async (db) => {
      const data = await inspect(db);
      const consumed = await db.query(
        "UPDATE mandate_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING id",
        [input.challengeId],
      );
      if (consumed.rowCount !== 1) deny(401, "INVALID_PROOF");
      const status =
        input.action === "APPROVE_CONSENT"
          ? "CONSENT_APPROVED_OFFCHAIN"
          : "CONSENT_REVOKED_OFFCHAIN";
      await db.query(
        "UPDATE mandate_consents SET status=$1,updated_at=clock_timestamp() WHERE mandate_id=$2",
        [status, data.policy.mandateId],
      );
      await event(
        db,
        data.policy.mandateId,
        data.who.account_id,
        data.row.policy_digest,
        input.action,
        input.challengeId,
        input.publicKey,
      );
      return view(db, { ...data.row, status });
    });
  });
}
