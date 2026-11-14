import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { serialize } from "borsh";
import bs58 from "bs58";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { buildApi } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/db/migrate.js";
import {
  type ConsentAction,
  canonicalPolicy,
  mandatePolicy,
  readApiConfig,
} from "../../packages/domain/src/index.js";

const schema = `m2_${randomUUID().replaceAll("-", "")}`;
const settings = readApiConfig(process.env).database;
const admin = new pg.Pool(settings),
  pool = new pg.Pool({
    ...settings,
    options: `-c search_path=${schema}`,
    application_name: schema,
  });
const origin = "https://app.example.test";
let keyAllowed = true,
  unavailable = false;
let hook: (() => Promise<void>) | undefined;
const app = buildApi(async () => {}, {
  pool,
  config: {
    origin,
    network: "testnet",
    secure: true,
    testnetSimulationEnabled: false,
  },
  verifyKey: async () => {
    await hook?.();
    if (unavailable) throw new Error("private provider error");
    return keyAllowed;
  },
});
const pair = generateKeyPairSync("ed25519");
const publicKey = `ed25519:${bs58.encode(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32))}`;
type Headers = { origin: string; cookie: string; "x-csrf-token": string };
let headers: Headers, org: string, agentId: string;
function signature(c: { message: string; nonce: string; recipient: string }) {
  const bytes = serialize(
    {
      struct: {
        tag: "u32",
        message: "string",
        nonce: { array: { type: "u8", len: 32 } },
        recipient: "string",
        callback: { option: "string" },
      },
    },
    {
      tag: 2147484061,
      message: c.message,
      nonce: [...Buffer.from(c.nonce, "base64")],
      recipient: c.recipient,
      callback: null,
    },
  );
  return sign(
    null,
    createHash("sha256").update(bytes).digest(),
    pair.privateKey,
  ).toString("base64");
}
async function login(accountId = "alice.testnet"): Promise<Headers> {
  const c = await app.inject({
    method: "POST",
    url: "/api/auth/challenge",
    headers: { origin },
    payload: { accountId, network: "testnet" },
  });
  const browser = c.cookies.find((v) => v.name === "__Host-avroqen_login");
  const r = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    headers: { origin, cookie: `__Host-avroqen_login=${browser?.value}` },
    payload: {
      challengeId: c.json().challengeId,
      accountId,
      network: "testnet",
      publicKey,
      signature: signature(c.json()),
    },
  });
  expect(r.statusCode).toBe(200);
  return {
    origin,
    cookie: `__Host-avroqen_session=${r.cookies.find((v) => v.name === "__Host-avroqen_session")?.value}`,
    "x-csrf-token": r.json().csrfToken,
  };
}
const post = (url: string, payload: object, h = headers) =>
  app.inject({ method: "POST", url, payload, headers: h });
const path = (id = "") =>
  `/api/organizations/${org}/mandates${id ? `/${id}` : ""}`;
function terms() {
  return {
    vaultAccount: "vault.testnet",
    agentId,
    recipient: "vendor.testnet",
    asset: "NativeNear",
    taskReference: "Hosting",
    maxPerPaymentAtomic: "1",
    totalBudgetAtomic: "10",
    expiresAtNs: (BigInt(Date.now() + 3600000) * 1000000n).toString(),
    maxExecutions: 10,
    verifierPolicy: {
      version: 1,
      accounts: ["verifier.testnet"],
      threshold: 1,
      requiredClaims: ["SERVICE_CONFIRMED"],
      requireOwnerApproval: true,
    },
  };
}
async function draft(change = {}) {
  const r = await post(path(), { ...terms(), ...change });
  expect(r.statusCode).toBe(201);
  return r.json();
}
async function historicalUnsafe(verifier: string) {
  const policy = mandatePolicy.parse({
    ...terms(),
    schemaVersion: 1,
    policyVersion: 1,
    mandateId: randomUUID(),
    organizationId: org,
    ownerAccount: "alice.testnet",
    network: "testnet",
    agentId,
    agentAccount: "agent.testnet",
    verifierPolicy: {
      ...terms().verifierPolicy,
      accounts: [verifier],
    },
  });
  const bytes = canonicalPolicy(policy);
  const digest = createHash("sha256").update(bytes).digest("hex");
  await pool.query(
    "INSERT INTO mandate_policies(id,org_id,network,owner_account,agent_id,agent_account,canonical_policy,policy_digest,expires_at_ns) VALUES($1,$2,'testnet',$3,$4,$5,$6,$7,$8)",
    [
      policy.mandateId,
      org,
      policy.ownerAccount,
      agentId,
      policy.agentAccount,
      bytes,
      digest,
      policy.expiresAtNs,
    ],
  );
  await pool.query("INSERT INTO mandate_consents(mandate_id) VALUES($1)", [
    policy.mandateId,
  ]);
  return policy;
}
async function proof(
  id: string,
  action: ConsentAction = "APPROVE_CONSENT",
  h = headers,
) {
  const r = await post(`${path(id)}/challenge`, { action }, h);
  expect(r.statusCode).toBe(200);
  return {
    action,
    challengeId: r.json().challengeId as string,
    network: "testnet",
    accountId: "alice.testnet",
    publicKey,
    signature: signature(r.json()),
  };
}
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await app.ready();
});
beforeEach(async () => {
  hook = undefined;
  keyAllowed = true;
  unavailable = false;
  await pool.query(
    "TRUNCATE request_limits,security_audit_records,organizations,auth_sessions,auth_challenges CASCADE",
  );
  headers = await login();
  const o = await post("/api/organizations", { name: "M2 org" });
  org = o.json().id;
  const a = await post(`/api/organizations/${org}/agents`, {
    name: "Proposer",
    accountId: "agent.testnet",
  });
  agentId = a.json().id;
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
it("creates immutable owner terms, approves and revokes offchain only, rejects replay", async () => {
  const d = await draft(),
    id = d.policy.mandateId;
  expect(d.policy.ownerAccount).toBe("alice.testnet");
  expect(d.onchainStatus).toBe("NOT_SUBMITTED");
  const p = await proof(id),
    r = await post(`${path(id)}/verify`, p);
  expect(r.statusCode).toBe(200);
  expect(r.json().consentStatus).toBe("CONSENT_APPROVED_OFFCHAIN");
  expect((await post(`${path(id)}/verify`, p)).statusCode).toBe(401);
  const revoke = await proof(id, "REVOKE_CONSENT");
  const revoked = await post(`${path(id)}/verify`, revoke);
  expect(revoked.statusCode).toBe(200);
  expect(revoked.json().onchainStatus).toBe("NOT_SUBMITTED");
  expect(revoked.json().consentStatus).toBe("CONSENT_REVOKED_OFFCHAIN");
  expect(
    (await post(`${path(id)}/challenge`, { action: "APPROVE_CONSENT" }))
      .statusCode,
  ).toBe(409);
  const events = (
    await pool.query(
      "SELECT event FROM mandate_events WHERE event IN ('APPROVE_CONSENT','REVOKE_CONSENT') ORDER BY occurred_at",
    )
  ).rows.map((r) => r.event);
  expect(events).toEqual(["APPROVE_CONSENT", "REVOKE_CONSENT"]);
});
it("approves a Meteor-compatible ASCII proof for a policy containing Unicode", async () => {
  const d = await draft({ taskReference: "Hosting \u2014 annual" }),
    id = d.policy.mandateId;
  const challenge = await post(`${path(id)}/challenge`, {
    action: "APPROVE_CONSENT",
  });
  expect(challenge.statusCode).toBe(200);
  expect(challenge.json().message).toContain("Hosting \\u2014 annual");
  expect(Buffer.byteLength(challenge.json().message)).toBe(
    challenge.json().message.length,
  );
  const response = await post(`${path(id)}/verify`, {
    action: "APPROVE_CONSENT",
    challengeId: challenge.json().challengeId,
    network: "testnet",
    accountId: "alice.testnet",
    publicKey,
    signature: signature(challenge.json()),
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().consentStatus).toBe("CONSENT_APPROVED_OFFCHAIN");
});
it.each([
  ["OWNER", "alice.testnet"],
  ["AGENT", "agent.testnet"],
  ["RECIPIENT", "vendor.testnet"],
  ["VAULT", "vault.testnet"],
])(
  "rejects direct API mandate creation with %s verifier overlap",
  async (role, account) => {
    const response = await post(path(), {
      ...terms(),
      verifierPolicy: { ...terms().verifierPolicy, accounts: [account] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe(`VERIFIER_ROLE_CONFLICT_${role}`);
    expect((await pool.query("SELECT * FROM mandate_policies")).rowCount).toBe(
      0,
    );
  },
);
it("keeps an unsafe historical mandate readable while blocking new approval", async () => {
  const policy = await historicalUnsafe("alice.testnet");
  const detail = await app.inject({ url: path(policy.mandateId), headers });
  expect(detail.statusCode).toBe(200);
  expect(detail.json().policy).toEqual(policy);
  expect(detail.json().verifierPolicyStatus).toEqual({
    eligible: false,
    conflict: "OWNER",
  });
  const approval = await post(`${path(policy.mandateId)}/challenge`, {
    action: "APPROVE_CONSENT",
  });
  expect(approval.statusCode).toBe(409);
  expect(approval.json().error).toBe("VERIFIER_ROLE_CONFLICT_OWNER");
  const revocation = await post(`${path(policy.mandateId)}/challenge`, {
    action: "REVOKE_CONSENT",
  });
  expect(revocation.statusCode).toBe(200);
  expect((await pool.query("SELECT * FROM mandate_policies")).rowCount).toBe(1);
});
it.each([
  ["accountId", "CONSENT_PROOF_ACCOUNT_MISMATCH"],
  ["network", "CONSENT_PROOF_NETWORK_MISMATCH"],
  ["action", "CONSENT_PROOF_ACTION_MISMATCH"],
  ["signature", "CONSENT_PROOF_SIGNATURE_INVALID"],
  ["publicKey", "CONSENT_PROOF_SIGNATURE_INVALID"],
  ["challengeId", "CONSENT_PROOF_CHALLENGE_UNAVAILABLE"],
])("rejects proof substitution: %s", async (field, code) => {
  const d = await draft(),
    id = d.policy.mandateId,
    p = await proof(id);
  const replacements: Record<string, string> = {
    accountId: "other.testnet",
    network: "mainnet",
    action: "REVOKE_CONSENT",
    signature: Buffer.alloc(64).toString("base64"),
    publicKey: `ed25519:${bs58.encode(Buffer.alloc(32))}`,
    challengeId: randomUUID(),
  };
  const response = await post(`${path(id)}/verify`, {
    ...p,
    [field]: replacements[field],
  });
  expect(response.statusCode).toBe(401);
  expect(response.json().error).toBe(code);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM mandate_challenges WHERE consumed_at IS NOT NULL",
      )
    ).rows[0].n,
  ).toBe(0);
});
it("rejects altered message terms, origin and cross-mandate proof", async () => {
  const d = await draft(),
    id = d.policy.mandateId,
    other = await draft();
  const c = await post(`${path(id)}/challenge`, { action: "APPROVE_CONSENT" });
  for (const [from, to] of [
    ["vendor.testnet", "attacker.testnet"],
    ["vault.testnet", "fake.testnet"],
    ["alice.testnet", "other.testnet"],
    ['"totalBudgetAtomic":"10"', '"totalBudgetAtomic":"99"'],
    ['"threshold":1', '"threshold":2'],
  ]) {
    const message = c.json().message.replace(from, to);
    expect(message === c.json().message).toBe(false);
    const p = {
      action: "APPROVE_CONSENT",
      challengeId: c.json().challengeId,
      network: "testnet",
      accountId: "alice.testnet",
      publicKey,
      signature: signature({ ...c.json(), message }),
    };
    expect((await post(`${path(id)}/verify`, p)).statusCode).toBe(401);
  }
  const p = await proof(id);
  expect(
    (await post(`${path(other.policy.mandateId)}/verify`, p)).statusCode,
  ).toBe(401);
  expect(
    (
      await post(`${path(id)}/verify`, p, {
        ...headers,
        origin: "https://evil.test",
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await post(`${path(id)}/verify`, p, {
        ...headers,
        "x-csrf-token": "wrong",
      })
    ).statusCode,
  ).toBe(403);
});
it("binds consent to the initiating session even for the same wallet", async () => {
  const d = await draft(),
    id = d.policy.mandateId,
    p = await proof(id),
    second = await login();
  const rejected = await post(`${path(id)}/verify`, p, second);
  expect(rejected.statusCode).toBe(401);
  expect(rejected.json().error).toBe("CONSENT_PROOF_SESSION_MISMATCH");
  expect((await post(`${path(id)}/verify`, p)).statusCode).toBe(200);
});
it.each([
  ["message", "CONSENT_PROOF_MESSAGE_MISMATCH"],
  ["origin", "CONSENT_PROOF_ORIGIN_MISMATCH"],
])(
  "diagnoses stored challenge %s mismatch without consuming it",
  async (field, code) => {
    const d = await draft(),
      id = d.policy.mandateId,
      p = await proof(id);
    await pool.query(`UPDATE mandate_challenges SET ${field}=$1 WHERE id=$2`, [
      field === "message" ? "altered stored message" : "https://other.test",
      p.challengeId,
    ]);
    const response = await post(`${path(id)}/verify`, p);
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe(code);
    expect(
      (
        await pool.query(
          "SELECT consumed_at FROM mandate_challenges WHERE id=$1",
          [p.challengeId],
        )
      ).rows[0].consumed_at,
    ).toBeNull();
  },
);
it.each(["expiry", "logout", "session-expiry", "role", "agent"])(
  "rechecks %s after finalized RPC",
  async (kind) => {
    const d = await draft(),
      id = d.policy.mandateId,
      p = await proof(id);
    hook = async () => {
      if (kind === "expiry")
        await pool.query(
          "UPDATE mandate_challenges SET created_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 second'",
        );
      if (kind === "session-expiry")
        await pool.query(
          "UPDATE auth_sessions SET created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '1 second'",
        );
      if (kind === "logout")
        await pool.query(
          "UPDATE auth_sessions SET revoked_at=clock_timestamp()",
        );
      if (kind === "role")
        await pool.query("UPDATE memberships SET role='viewer'");
      if (kind === "agent")
        await pool.query(
          "UPDATE registered_agents SET disabled_at=clock_timestamp()",
        );
    };
    expect([401, 403, 409]).toContain(
      (await post(`${path(id)}/verify`, p)).statusCode,
    );
    expect(
      (await pool.query("SELECT status FROM mandate_consents")).rows[0].status,
    ).toBe("DRAFT");
  },
);
it("checks challenge five-minute TTL and rejects expired proofs", async () => {
  const d = await draft(),
    p = await proof(d.policy.mandateId);
  const seconds = (
    await pool.query(
      "SELECT extract(epoch FROM expires_at-created_at)::float AS ttl FROM mandate_challenges",
    )
  ).rows[0].ttl;
  expect(seconds).toBeGreaterThan(299);
  expect(seconds).toBeLessThanOrEqual(300);
  await pool.query(
    "UPDATE mandate_challenges SET created_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 second'",
  );
  const response = await post(`${path(d.policy.mandateId)}/verify`, p);
  expect(response.statusCode).toBe(401);
  expect(response.json().error).toBe("CONSENT_PROOF_CHALLENGE_EXPIRED");
});
it.each([false, true])(
  "one winner under concurrent challenges, distinct=%s",
  async (distinct) => {
    const d = await draft(),
      id = d.policy.mandateId,
      p = await proof(id),
      q = distinct ? await proof(id) : p;
    let arrived = 0,
      release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    hook = async () => {
      if (++arrived === 2) release();
      await gate;
    };
    const responses = await Promise.all([
      post(`${path(id)}/verify`, p),
      post(`${path(id)}/verify`, q),
    ]);
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(
      responses.filter((r) => [401, 409].includes(r.statusCode)),
    ).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM mandate_events WHERE event='APPROVE_CONSENT'",
        )
      ).rows[0].n,
    ).toBe(1);
  },
);
it.each(["restricted", "missing", "unavailable"])(
  "rejects %s key verification without consuming nonce",
  async (kind) => {
    const d = await draft(),
      id = d.policy.mandateId,
      p = await proof(id);
    keyAllowed = false;
    unavailable = kind === "unavailable";
    const r = await post(`${path(id)}/verify`, p);
    expect(r.statusCode).toBe(unavailable ? 503 : 401);
    if (!unavailable)
      expect(r.json().error).toBe("CONSENT_PROOF_KEY_NOT_AUTHORIZED");
    expect(r.body.includes("private provider error")).toBe(false);
    expect(
      (await pool.query("SELECT consumed_at FROM mandate_challenges")).rows[0]
        .consumed_at,
    ).toBeNull();
  },
);
it("blocks cross-tenant reads/writes, role escalation and other owner consent", async () => {
  const d = await draft(),
    id = d.policy.mandateId,
    bob = await login("bob.testnet");
  expect((await app.inject({ url: path(id), headers: bob })).statusCode).toBe(
    403,
  );
  expect((await post(path(), terms(), bob)).statusCode).toBe(403);
  await pool.query(
    "INSERT INTO memberships(org_id,network,account_id,role) VALUES($1,'testnet','bob.testnet','admin')",
    [org],
  );
  expect((await post(path(), terms(), bob)).statusCode).toBe(403);
  expect(
    (await post(`${path(id)}/challenge`, { action: "APPROVE_CONSENT" }, bob))
      .statusCode,
  ).toBe(403);
  await pool.query(
    "UPDATE memberships SET role='owner' WHERE account_id='bob.testnet'",
  );
  expect(
    (await post(`${path(id)}/challenge`, { action: "REVOKE_CONSENT" }, bob))
      .statusCode,
  ).toBe(403);
  expect(
    (await post(path(), { ...terms(), ownerAccount: "bob.testnet" }))
      .statusCode,
  ).toBe(400);
});
it("rejects past policy and enforces expiry while preserving revocation", async () => {
  expect(
    (await post(path(), { ...terms(), expiresAtNs: "1" })).statusCode,
  ).toBe(400);
  const d = await draft({
      expiresAtNs: (BigInt(Date.now() + 1500) * 1000000n).toString(),
    }),
    id = d.policy.mandateId,
    p = await proof(id);
  hook = async () => {
    await new Promise((r) => setTimeout(r, 1600));
  };
  expect((await post(`${path(id)}/verify`, p)).statusCode).toBe(409);
  hook = undefined;
  const r = await post(`${path(id)}/verify`, await proof(id, "REVOKE_CONSENT"));
  expect(r.statusCode).toBe(200);
  expect(r.json().expired).toBe(true);
});
it("does not permit policy or event mutation and keeps revocation terminal", async () => {
  const d = await draft(),
    id = d.policy.mandateId;
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: path(id),
        headers,
        payload: { recipient: "attacker.testnet" },
      })
    ).statusCode,
  ).toBe(404);
  expect((await post(`${path(id)}/verify`, await proof(id))).statusCode).toBe(
    200,
  );
  await expect(
    pool.query("UPDATE mandate_policies SET owner_account='attacker.testnet'"),
  ).rejects.toThrow();
  await expect(pool.query("DELETE FROM mandate_policies")).rejects.toThrow();
  await expect(
    pool.query("UPDATE mandate_events SET actor_account='attacker.testnet'"),
  ).rejects.toThrow();
  await expect(pool.query("DELETE FROM mandate_events")).rejects.toThrow();
  await post(`${path(id)}/verify`, await proof(id, "REVOKE_CONSENT"));
  await expect(
    pool.query("UPDATE mandate_consents SET status='DRAFT'"),
  ).rejects.toThrow();
});
it("rolls back nonce, lifecycle and event on audit failure and retries safely", async () => {
  const d = await draft(),
    id = d.policy.mandateId,
    p = await proof(id);
  await pool.query(
    "CREATE FUNCTION reject_m2_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event='APPROVE_CONSENT' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_event BEFORE INSERT ON mandate_events FOR EACH ROW EXECUTE FUNCTION reject_m2_event()",
  );
  try {
    expect((await post(`${path(id)}/verify`, p)).statusCode).toBe(503);
    expect(
      (await pool.query("SELECT status FROM mandate_consents")).rows[0].status,
    ).toBe("DRAFT");
    expect(
      (await pool.query("SELECT consumed_at FROM mandate_challenges")).rows[0]
        .consumed_at,
    ).toBeNull();
  } finally {
    await pool.query(
      "DROP TRIGGER fail_event ON mandate_events; DROP FUNCTION reject_m2_event()",
    );
  }
  expect((await post(`${path(id)}/verify`, p)).statusCode).toBe(200);
});
it("concurrent approval and revocation always leave terminal revoked consent", async () => {
  const d = await draft(),
    id = d.policy.mandateId,
    p = await proof(id),
    q = await proof(id, "REVOKE_CONSENT");
  let arrived = 0,
    release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  hook = async () => {
    if (++arrived === 2) release();
    await gate;
  };
  const responses = await Promise.all([
    post(`${path(id)}/verify`, p),
    post(`${path(id)}/verify`, q),
  ]);
  expect(responses[1]?.statusCode).toBe(200);
  expect([200, 409]).toContain(responses[0]?.statusCode);
  expect(
    (await pool.query("SELECT status FROM mandate_consents")).rows[0].status,
  ).toBe("CONSENT_REVOKED_OFFCHAIN");
});
it("draft creation rolls back completely if its append-only event cannot be written", async () => {
  await pool.query(
    "CREATE FUNCTION reject_draft_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER fail_draft BEFORE INSERT ON mandate_events FOR EACH ROW EXECUTE FUNCTION reject_draft_event()",
  );
  try {
    expect((await post(path(), terms())).statusCode).toBe(503);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM mandate_policies"))
        .rows[0].n,
    ).toBe(0);
  } finally {
    await pool.query(
      "DROP TRIGGER fail_draft ON mandate_events; DROP FUNCTION reject_draft_event()",
    );
  }
});
it("revocation remains available after agent disabling and does not claim chain state", async () => {
  const d = await draft(),
    id = d.policy.mandateId;
  expect((await post(`${path(id)}/verify`, await proof(id))).statusCode).toBe(
    200,
  );
  await pool.query(
    "UPDATE registered_agents SET disabled_at=clock_timestamp()",
  );
  const r = await post(`${path(id)}/verify`, await proof(id, "REVOKE_CONSENT"));
  expect(r.statusCode).toBe(200);
  expect(r.json().agentDisabled).toBe(true);
  expect(r.json().onchainStatus).toBe("NOT_SUBMITTED");
});
it("rejects session expiry while the final consent transaction waits on its row lock", async () => {
  const d = await draft(),
    id = d.policy.mandateId,
    p = await proof(id);
  const blocker = await pool.connect();
  let entered: () => void = () => {};
  const reached = new Promise<void>((r) => {
    entered = r;
  });
  hook = async () => {
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT * FROM mandate_consents WHERE mandate_id=$1 FOR UPDATE",
      [id],
    );
    await pool.query(
      "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second'",
    );
    entered();
  };
  const request = post(`${path(id)}/verify`, p).then((r) => r.statusCode);
  try {
    await reached;
    let waiting = false;
    for (let i = 0; i < 40; i++) {
      waiting = (
        await pool.query(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%mandate_policies%') AS waiting",
          [schema],
        )
      ).rows[0].waiting;
      if (waiting) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(waiting).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    await blocker.query("COMMIT");
    expect(await request).toBe(401);
    expect(
      (await pool.query("SELECT status FROM mandate_consents")).rows[0].status,
    ).toBe("DRAFT");
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await request;
  }
});
