import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  agentInput,
  agentParams,
  challengeInput,
  listInput,
  organizationInput,
  organizationParams,
} from "@avroqen/domain";
import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { agentRoutes } from "../agents/routes.js";
import { mandateRoutes } from "../mandates/routes.js";
import type { IdentityConfig } from "./config.js";
import { csrfFor, hash, verifyMessage } from "./crypto.js";
import { parseVerification } from "./validation.js";

export interface IdentityOptions {
  pool: pg.Pool;
  config: IdentityConfig;
  verifyKey: (account: string, key: string) => Promise<boolean>;
}
class Denied extends Error {
  constructor(
    public status: number,
    public code: string,
    public agentId?: string,
  ) {
    super(code);
  }
}
const deny = (status: number, code: string): never => {
  throw new Denied(status, code);
};
const secret = () => randomBytes(32).toString("hex");
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export interface Session {
  account_id: string;
  network: string;
  expires_at: Date;
  csrf_hash: string;
}
export async function identityRoutes(
  app: FastifyInstance,
  { pool, config, verifyKey }: IdentityOptions,
) {
  await app.register(cookie);
  const sessionName = `${config.secure ? "__Host-" : ""}avroqen_session`;
  const loginName = `${config.secure ? "__Host-" : ""}avroqen_login`;
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: config.secure,
    sameSite: "strict" as const,
  };
  const audit = async (
    db: pg.Pool | pg.PoolClient,
    event: string,
    reason: string,
    session?: Session,
    org?: string,
    target?: string,
  ) => {
    await db.query(
      "INSERT INTO security_audit_records (id,event,reason,actor_account,network,org_id,target_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        event,
        reason,
        session?.account_id ?? null,
        session?.network ?? null,
        org ?? null,
        target ?? null,
      ],
    );
  };
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    // Do not trust forwarded IP headers. Proxy deployments deliberately share this limit.
    const bucket = hash(
      `m1:${request.ip}:${request.method === "GET" ? "read" : "write"}`,
    );
    const result = await pool.query(
      `INSERT INTO request_limits (bucket_hash,window_start,hits) VALUES ($1,date_trunc('minute',clock_timestamp()),1)
      ON CONFLICT (bucket_hash,window_start) DO UPDATE SET hits=request_limits.hits+1 RETURNING hits`,
      [bucket],
    );
    const limit = request.method === "GET" ? 120 : 30;
    if (result.rows[0].hits > limit) {
      if (result.rows[0].hits === limit + 1)
        await audit(pool, "rate_limited", "REQUEST_LIMIT");
      reply.header("Retry-After", "60");
      deny(429, "RATE_LIMITED");
    }
    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      request.headers.origin !== config.origin
    )
      deny(403, "ORIGIN_DENIED");
  });
  app.setErrorHandler(async (error, request, reply) => {
    let status = error instanceof Denied ? error.status : 503;
    let code = error instanceof Denied ? error.code : "SERVICE_UNAVAILABLE";
    if (error instanceof Error && error.name === "ZodError") {
      status = 400;
      code = "INVALID_REQUEST";
    }
    if (
      error instanceof Error &&
      "statusCode" in error &&
      (error.statusCode === 400 ||
        error.statusCode === 413 ||
        error.statusCode === 415)
    ) {
      status = error.statusCode;
      code = "INVALID_REQUEST";
    }
    if (error instanceof Error && "code" in error && error.code === "23505") {
      status = 409;
      code = "ALREADY_EXISTS";
    }
    try {
      if (code !== "RATE_LIMITED")
        await audit(
          pool,
          request.url.startsWith("/api/auth/")
            ? "login_denied"
            : "access_denied",
          code,
        );
    } catch {
      status = 503;
      code = "SERVICE_UNAVAILABLE";
    }
    reply.code(status).send({
      error: code,
      ...(status === 409 && error instanceof Denied && error.agentId
        ? { agentId: error.agentId }
        : {}),
    });
  });
  async function transaction<T>(
    work: (db: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const value = await work(db);
      await db.query("COMMIT");
      return value;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  const tokenOf = (request: FastifyRequest) => {
    const token = request.cookies[sessionName];
    if (!token || !/^[0-9a-f]{64}$/.test(token))
      return deny(401, "SESSION_REQUIRED");
    return token;
  };
  async function session(
    request: FastifyRequest,
    db: pg.Pool | pg.PoolClient,
    mutation = false,
  ): Promise<Session> {
    const token = tokenOf(request);
    const result = await db.query(
      `SELECT account_id,network,expires_at,csrf_hash FROM auth_sessions WHERE token_hash=$1 AND network=$2 AND challenge_id IN (SELECT id FROM auth_challenges WHERE recipient=$3 AND callback_url='') AND revoked_at IS NULL AND expires_at>clock_timestamp() ${mutation ? "FOR SHARE" : ""}`,
      [hash(token), config.network, config.origin],
    );
    const value = result.rows[0] as Session | undefined;
    if (!value) return deny(401, "SESSION_REQUIRED");
    if (mutation) {
      const csrf = request.headers["x-csrf-token"];
      if (typeof csrf !== "string" || !equal(hash(csrf), value.csrf_hash))
        deny(403, "CSRF_DENIED");
    }
    return value;
  }
  async function membership(
    db: pg.PoolClient,
    value: Session,
    org: string,
    write: boolean,
  ) {
    const result = await db.query(
      "SELECT role FROM memberships WHERE org_id=$1 AND network=$2 AND account_id=$3 AND status='active' FOR SHARE",
      [org, value.network, value.account_id],
    );
    const role = result.rows[0]?.role;
    if (!role || (write && !["owner", "admin"].includes(role)))
      deny(403, "ACCESS_DENIED");
    return role as string;
  }
  app.get("/api/auth/config", async () => ({
    network: config.network,
    origin: config.origin,
    connector: "meteor",
  }));
  app.post("/api/auth/challenge", async (request, reply) => {
    const input = challengeInput.parse(request.body);
    if (input.network !== config.network) deny(400, "NETWORK_MISMATCH");
    const id = randomUUID(),
      nonce = randomBytes(32),
      browser = secret();
    const expires = (
      await pool.query(
        "SELECT clock_timestamp()+interval '5 minutes' AS expiry",
      )
    ).rows[0].expiry as Date;
    const message = `Sign in to Avroqen. No transaction or financial authority.\nAccount: ${input.accountId}\nNetwork: ${config.network}\nOrigin: ${config.origin}\nChallenge: ${id}\nExpires: ${expires.toISOString()}`;
    await transaction(async (db) => {
      await db.query(
        `INSERT INTO auth_challenges (id,network,account_id,nonce,browser_hash,message,recipient,callback_url,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'',$8)`,
        [
          id,
          config.network,
          input.accountId,
          nonce,
          hash(browser),
          message,
          config.origin,
          expires,
        ],
      );
      await audit(db, "challenge_created", "CHALLENGE_ISSUED");
    });
    reply.setCookie(loginName, browser, { ...cookieOptions, maxAge: 300 });
    return {
      challengeId: id,
      message,
      nonce: nonce.toString("base64"),
      recipient: config.origin,
      expiresAt: expires.toISOString(),
    };
  });
  app.post("/api/auth/verify", async (request, reply) => {
    const parsed = parseVerification(request.body);
    if (!parsed.success) {
      // Fixed event plus allowlisted field/category pairs only. No request logging.
      console.info(
        JSON.stringify({
          event: "AUTH_VERIFY_SCHEMA_REJECTED",
          issues: parsed.issues,
        }),
      );
      await audit(pool, "login_denied", "INVALID_REQUEST");
      return reply
        .code(400)
        .send({ error: "INVALID_REQUEST", issues: parsed.issues });
    }
    const input = parsed.data;
    const browser = request.cookies[loginName];
    if (
      input.network !== config.network ||
      !browser ||
      !/^[0-9a-f]{64}$/.test(browser)
    )
      deny(401, "INVALID_PROOF");
    const result = await pool.query(
      "SELECT * FROM auth_challenges WHERE id=$1 AND network=$2 AND account_id=$3 AND browser_hash=$4 AND consumed_at IS NULL AND expires_at>clock_timestamp()",
      [
        input.challengeId,
        config.network,
        input.accountId,
        hash(browser as string),
      ],
    );
    const challenge = result.rows[0];
    if (
      !challenge ||
      challenge.recipient !== config.origin ||
      challenge.callback_url !== "" ||
      !verifyMessage(challenge, input.publicKey, input.signature)
    )
      deny(401, "INVALID_PROOF");
    if (!(await verifyKey(input.accountId, input.publicKey)))
      deny(401, "INVALID_PROOF");
    const token = secret(),
      csrfToken = csrfFor(token);
    const expiresAt = await transaction(async (db) => {
      const consumed = await db.query(
        "UPDATE auth_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING id",
        [input.challengeId],
      );
      if (consumed.rowCount !== 1) deny(401, "INVALID_PROOF");
      const old = request.cookies[sessionName];
      if (old)
        await db.query(
          "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1",
          [hash(old)],
        );
      const inserted = await db.query(
        `INSERT INTO auth_sessions (token_hash,challenge_id,csrf_hash,network,account_id,public_key,expires_at) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '15 minutes') RETURNING expires_at`,
        [
          hash(token),
          input.challengeId,
          hash(csrfToken),
          config.network,
          input.accountId,
          input.publicKey,
        ],
      );
      await audit(db, "login_succeeded", "WALLET_VERIFIED", {
        account_id: input.accountId,
        network: config.network,
        expires_at: inserted.rows[0].expires_at,
        csrf_hash: hash(csrfToken),
      });
      return inserted.rows[0].expires_at;
    });
    reply
      .clearCookie(loginName, cookieOptions)
      .setCookie(sessionName, token, { ...cookieOptions, maxAge: 900 });
    return {
      accountId: input.accountId,
      network: config.network,
      expiresAt,
      csrfToken,
    };
  });
  app.get("/api/auth/session", async (request) => {
    const value = await session(request, pool);
    return {
      accountId: value.account_id,
      network: value.network,
      expiresAt: value.expires_at,
      csrfToken: csrfFor(tokenOf(request)),
    };
  });
  app.post("/api/auth/logout", async (request, reply) => {
    await transaction(async (db) => {
      // Exclusive lock avoids a shared-lock upgrade deadlock with concurrent logout.
      await db.query(
        "SELECT token_hash FROM auth_sessions WHERE token_hash=$1 FOR UPDATE",
        [hash(tokenOf(request))],
      );
      const value = await session(request, db, true);
      await db.query(
        "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1",
        [hash(tokenOf(request))],
      );
      await audit(db, "logout", "SESSION_REVOKED", value);
    });
    reply.clearCookie(sessionName, cookieOptions);
    return { loggedOut: true };
  });
  app.get("/api/organizations", async (request) => {
    const value = await session(request, pool),
      { offset } = listInput.parse(request.query);
    const result = await pool.query(
      `SELECT o.id,o.display_name AS name,m.role FROM organizations o JOIN memberships m ON m.org_id=o.id AND m.network=o.network WHERE m.account_id=$1 AND m.network=$2 AND m.status='active' ORDER BY o.id LIMIT 50 OFFSET $3`,
      [value.account_id, value.network, offset],
    );
    return {
      organizations: result.rows,
      nextOffset: result.rows.length === 50 ? offset + 50 : null,
    };
  });
  app.post("/api/organizations", async (request, reply) => {
    const input = organizationInput.parse(request.body);
    const value = await transaction(async (db) => {
      const identity = await session(request, db, true),
        id = randomUUID();
      await db.query(
        "INSERT INTO organizations (id,network,display_name) VALUES ($1,$2,$3)",
        [id, identity.network, input.name],
      );
      await db.query(
        "INSERT INTO memberships (org_id,network,account_id,role) VALUES ($1,$2,$3,'owner')",
        [id, identity.network, identity.account_id],
      );
      await audit(
        db,
        "organization_created",
        "APP_ORGANIZATION_CREATED",
        identity,
        id,
      );
      return { id, name: input.name, role: "owner" };
    });
    return reply.code(201).send(value);
  });
  app.get("/api/organizations/:orgId/agents", async (request) => {
    const { orgId } = organizationParams.parse(request.params),
      { offset } = listInput.parse(request.query);
    return transaction(async (db) => {
      const identity = await session(request, db);
      await membership(db, identity, orgId, false);
      const result = await db.query(
        'SELECT id,display_name AS name,near_account AS "accountId",disabled_at AS "disabledAt" FROM registered_agents WHERE org_id=$1 AND network=$2 ORDER BY id LIMIT 50 OFFSET $3',
        [orgId, identity.network, offset],
      );
      return {
        agents: result.rows,
        nextOffset: result.rows.length === 50 ? offset + 50 : null,
      };
    });
  });
  app.get("/api/organizations/:orgId/agents/:agentId", async (request) => {
    const { orgId, agentId } = agentParams.parse(request.params);
    return transaction(async (db) => {
      const identity = await session(request, db);
      await membership(db, identity, orgId, false);
      const result = await db.query(
        'SELECT id,display_name AS name,near_account AS "accountId",disabled_at AS "disabledAt" FROM registered_agents WHERE id=$1 AND org_id=$2 AND network=$3',
        [agentId, orgId, identity.network],
      );
      if (!result.rows[0]) deny(404, "AGENT_NOT_FOUND");
      return result.rows[0];
    });
  });
  app.post("/api/organizations/:orgId/agents", async (request, reply) => {
    const { orgId } = organizationParams.parse(request.params),
      input = agentInput.parse(request.body);
    const result = await transaction(async (db) => {
      const identity = await session(request, db, true);
      await membership(db, identity, orgId, true);
      const id = randomUUID();
      const inserted = await db.query(
        "INSERT INTO registered_agents (id,org_id,network,near_account,display_name) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (org_id,network,near_account) DO NOTHING RETURNING id",
        [id, orgId, identity.network, input.accountId, input.name],
      );
      if (inserted.rowCount !== 1) {
        const existing = await db.query(
          "SELECT id,disabled_at FROM registered_agents WHERE org_id=$1 AND network=$2 AND near_account=$3 FOR SHARE",
          [orgId, identity.network, input.accountId],
        );
        if (!existing.rows[0]) deny(409, "ALREADY_EXISTS");
        throw new Denied(
          409,
          existing.rows[0].disabled_at
            ? "AGENT_PREVIOUSLY_DISABLED"
            : "AGENT_ALREADY_REGISTERED",
          existing.rows[0].id,
        );
      }
      await audit(
        db,
        "agent_registered",
        "RECORD_ONLY_NO_AUTHORITY",
        identity,
        orgId,
        id,
      );
      return { id, ...input, disabledAt: null };
    });
    return reply.code(201).send(result);
  });
  app.post(
    "/api/organizations/:orgId/agents/:agentId/disable",
    async (request) => {
      const { orgId, agentId } = agentParams.parse(request.params);
      if (request.body !== undefined && JSON.stringify(request.body) !== "{}")
        deny(400, "INVALID_REQUEST");
      return transaction(async (db) => {
        const identity = await session(request, db, true);
        await membership(db, identity, orgId, true);
        const result = await db.query(
          'UPDATE registered_agents SET disabled_at=COALESCE(disabled_at,clock_timestamp()) WHERE id=$1 AND org_id=$2 AND network=$3 RETURNING id,disabled_at AS "disabledAt"',
          [agentId, orgId, identity.network],
        );
        if (result.rowCount !== 1) deny(404, "AGENT_NOT_FOUND");
        await audit(
          db,
          "agent_disabled",
          "APP_RECORD_DISABLED",
          identity,
          orgId,
          agentId,
        );
        return result.rows[0];
      });
    },
  );
  agentRoutes(app, {
    pool,
    config,
    verifyKey,
    deny,
    tokenOf,
    session,
    membership,
    transaction,
  });
  mandateRoutes(app, {
    pool,
    config,
    verifyKey,
    deny,
    tokenOf,
    session,
    membership,
    transaction,
  });
}
