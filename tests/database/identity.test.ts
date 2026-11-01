import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { serialize } from "borsh";
import bs58 from "bs58";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { buildApi } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/db/migrate.js";
import { fullAccessVerifier } from "../../apps/api/src/identity/crypto.js";
import { normalizeWalletProof } from "../../apps/web/app/workspace/wallet-proof.js";
import { readApiConfig } from "../../packages/domain/src/index.js";

const schema = `m1_api_${randomUUID().replaceAll("-", "")}`;
const settings = readApiConfig(process.env).database;
const admin = new pg.Pool(settings);
const pool = new pg.Pool({
  ...settings,
  options: `-c search_path=${schema}`,
  application_name: schema,
});
const origin = "https://app.example.test";
let keyAllowed = true;
let keyUnavailable = false;
let beforeKeyCheck: (() => Promise<void>) | undefined;
const authConfig = { origin, network: "testnet" as const, secure: true };
const app = buildApi(async () => {}, {
  pool,
  config: authConfig,
  verifyKey: async () => {
    await beforeKeyCheck?.();
    if (keyUnavailable) throw new Error("provider secret must never escape");
    return keyAllowed;
  },
});
const pair = generateKeyPairSync("ed25519");
const publicKey = `ed25519:${bs58.encode(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32))}`;
const cookie = (
  response: { cookies: { name: string; value: string }[] },
  name: string,
) => {
  const found = response.cookies.find((c) => c.name === name);
  return `${name}=${found?.value}`;
};
async function proof(accountId = "alice.testnet") {
  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/challenge",
    headers: { origin },
    payload: { accountId, network: "testnet" },
  });
  expect(challenge.statusCode).toBe(200);
  const value = challenge.json();
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
      message: value.message,
      nonce: [...Buffer.from(value.nonce, "base64")],
      recipient: value.recipient,
      callback: null,
    },
  );
  const signature = sign(
    null,
    createHash("sha256").update(bytes).digest(),
    pair.privateKey,
  ).toString("base64");
  return {
    payload: {
      challengeId: value.challengeId,
      accountId,
      network: "testnet",
      publicKey,
      signature,
    },
    headers: { origin, cookie: cookie(challenge, "__Host-avroqen_login") },
  };
}
async function login(accountId = "alice.testnet") {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    ...(await proof(accountId)),
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers["set-cookie"]?.toString()).toContain(
    "HttpOnly; Secure; SameSite=Strict",
  );
  return {
    origin,
    cookie: cookie(response, "__Host-avroqen_session"),
    "x-csrf-token": response.json().csrfToken as string,
  };
}
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await app.ready();
});
beforeEach(async () => {
  authConfig.origin = origin;
  keyAllowed = true;
  keyUnavailable = false;
  beforeKeyCheck = undefined;
  await pool.query(
    "TRUNCATE request_limits,security_audit_records,registered_agents,memberships,organizations,auth_sessions,auth_challenges CASCADE",
  );
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

it("accepts a real Ed25519 proof once and denies replay", async () => {
  const input = await proof();
  const first = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    ...input,
  });
  expect(first.statusCode).toBe(200);
  expect(
    (await app.inject({ method: "POST", url: "/api/auth/verify", ...input }))
      .statusCode,
  ).toBe(401);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
      .n,
  ).toBe(1);
});
it("allows only one concurrent nonce consumer", async () => {
  const input = await proof();
  let arrived = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeKeyCheck = async () => {
    if (++arrived === 6) release();
    await gate;
  };
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      app.inject({ method: "POST", url: "/api/auth/verify", ...input }),
    ),
  );
  expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1);
  expect(responses.filter((r) => r.statusCode === 401)).toHaveLength(5);
  expect(arrived).toBe(6);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
      .n,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM auth_challenges WHERE consumed_at IS NOT NULL",
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM security_audit_records WHERE event='login_succeeded'",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("rejects forged, account/network-substituted and browser-substituted proofs", async () => {
  const input = await proof();
  for (const [payload, expected] of [
    [{ ...input.payload, signature: Buffer.alloc(64).toString("base64") }, 401],
    [{ ...input.payload, accountId: "bob.testnet" }, 401],
    [{ ...input.payload, network: "mainnet" }, 401],
    [{ ...input.payload, role: "owner" }, 400],
  ] as const) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/verify",
          headers: input.headers,
          payload,
        })
      ).statusCode,
    ).toBe(expected);
  }
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        ...input,
        headers: { origin },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        ...input,
        headers: {
          ...input.headers,
          cookie: `__Host-avroqen_login=${"a".repeat(64)}`,
        },
      })
    ).statusCode,
  ).toBe(401);
});
it("rejects expiration and changed signed message/recipient/nonce/callback", async () => {
  for (const column of [
    "message",
    "recipient",
    "callback_url",
    "nonce",
    "expiry",
  ]) {
    const input = await proof();
    if (column === "expiry")
      await pool.query(
        "UPDATE auth_challenges SET created_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",
        [input.payload.challengeId],
      );
    else if (column === "nonce")
      await pool.query("UPDATE auth_challenges SET nonce=$2 WHERE id=$1", [
        input.payload.challengeId,
        Buffer.alloc(32, 42),
      ]);
    else
      await pool.query(
        `UPDATE auth_challenges SET ${column}='changed' WHERE id=$1`,
        [input.payload.challengeId],
      );
    expect(
      (await app.inject({ method: "POST", url: "/api/auth/verify", ...input }))
        .statusCode,
    ).toBe(401);
  }
});
it("rejects non-full-access/revoked keys and fails closed on RPC outages without consuming nonce", async () => {
  const input = await proof();
  keyAllowed = false;
  expect(
    (await app.inject({ method: "POST", url: "/api/auth/verify", ...input }))
      .statusCode,
  ).toBe(401);
  keyUnavailable = true;
  const unavailable = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    ...input,
  });
  expect(unavailable.statusCode).toBe(503);
  expect(unavailable.body).not.toContain("secret");
  expect(
    (
      await pool.query("SELECT consumed_at FROM auth_challenges WHERE id=$1", [
        input.payload.challengeId,
      ])
    ).rows[0].consumed_at,
  ).toBeNull();
});
it("enforces exact origin, CSRF, session expiry and server-side logout", async () => {
  const headers = await login();
  expect(
    (await app.inject({ url: "/api/auth/session", headers })).statusCode,
  ).toBe(200);
  for (const altered of [
    { ...headers, origin: "https://evil.test" },
    { cookie: headers.cookie, origin },
    { ...headers, "x-csrf-token": "incorrect-csrf-fixture" },
    { cookie: headers.cookie, "x-csrf-token": headers["x-csrf-token"] },
  ]) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: altered,
        })
      ).statusCode,
    ).toBe(403);
  }
  expect(
    (await app.inject({ method: "POST", url: "/api/auth/logout", headers }))
      .statusCode,
  ).toBe(200);
  expect(
    (await app.inject({ url: "/api/auth/session", headers })).statusCode,
  ).toBe(401);
  const next = await login();
  await pool.query(
    "UPDATE auth_sessions SET created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '1 minute'",
  );
  expect(
    (await app.inject({ url: "/api/auth/session", headers: next })).statusCode,
  ).toBe(401);
});
it("enforces tenant isolation, role permissions, strict role input and agent disabling", async () => {
  const alice = await login(),
    bob = await login("bob.testnet");
  const create = (headers: typeof alice, payload: unknown) =>
    app.inject({
      method: "POST",
      url: "/api/organizations",
      headers,
      payload: payload as object,
    });
  expect(
    (await create(alice, { name: "Test", role: "admin" })).statusCode,
  ).toBe(400);
  const org = (await create(alice, { name: "Alice" })).json().id;
  const other = (await create(bob, { name: "Bob" })).json().id;
  const url = `/api/organizations/${org}/agents`;
  expect((await app.inject({ url, headers: bob })).statusCode).toBe(403);
  expect(
    (await app.inject({ url: "/api/organizations", headers: bob }))
      .json()
      .organizations.map((o: { id: string }) => o.id),
  ).toEqual([other]);
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        headers: alice,
        payload: { name: "Agent", accountId: "agent.testnet", owner: true },
      })
    ).statusCode,
  ).toBe(400);
  const registered = await app.inject({
    method: "POST",
    url,
    headers: alice,
    payload: { name: "Agent", accountId: "agent.testnet" },
  });
  expect(registered.statusCode).toBe(201);
  const agent = registered.json().id;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/organizations/${other}/agents/${agent}/disable`,
        headers: bob,
      })
    ).statusCode,
  ).toBe(404);
  await pool.query(
    "INSERT INTO memberships (org_id,network,account_id,role) VALUES ($1,'testnet','bob.testnet','viewer')",
    [org],
  );
  for (const role of ["viewer", "member", "admin", "owner"]) {
    await pool.query(
      "UPDATE memberships SET role=$1 WHERE org_id=$2 AND account_id='bob.testnet'",
      [role, org],
    );
    expect((await app.inject({ url, headers: bob })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${url}/${agent}/disable`,
          headers: bob,
        })
      ).statusCode,
    ).toBe(["owner", "admin"].includes(role) ? 200 : 403);
  }
  const disabled = (await app.inject({ url, headers: alice })).json().agents[0];
  expect(disabled.disabledAt).toBeTruthy();
  await pool.query(
    "UPDATE memberships SET status='disabled' WHERE org_id=$1 AND account_id='bob.testnet'",
    [org],
  );
  expect((await app.inject({ url, headers: bob })).statusCode).toBe(403);
  expect((await app.inject({ url })).statusCode).toBe(401);
});
it("rate limits authentication and keeps security audit free of proof secrets", async () => {
  const input = await proof();
  for (let i = 0; i < 31; i++)
    await app.inject({ method: "POST", url: "/api/auth/verify", ...input });
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/challenge",
    headers: { origin },
    payload: { accountId: "alice.testnet", network: "testnet" },
  });
  expect(response.statusCode).toBe(429);
  const audit = JSON.stringify(
    (await pool.query("SELECT * FROM security_audit_records")).rows,
  );
  expect(audit).toContain("rate_limited");
  expect(audit).not.toContain(input.payload.signature);
  expect(audit).not.toContain(input.headers.cookie);
});

it("rotates existing sessions and denies a different signing key", async () => {
  const original = await login();
  const input = await proof();
  const other = generateKeyPairSync("ed25519");
  const wrongKey = `ed25519:${bs58.encode(other.publicKey.export({ format: "der", type: "spki" }).subarray(-32))}`;
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        ...input,
        payload: { ...input.payload, publicKey: wrongKey },
      })
    ).statusCode,
  ).toBe(401);
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    ...input,
    headers: {
      ...input.headers,
      cookie: `${input.headers.cookie}; ${original.cookie}`,
    },
  });
  expect(response.statusCode).toBe(200);
  expect(
    (await app.inject({ url: "/api/auth/session", headers: original }))
      .statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        url: "/api/auth/session",
        headers: { cookie: cookie(response, "__Host-avroqen_session") },
      })
    ).statusCode,
  ).toBe(200);
});

it("invalidates challenges and sessions issued for a previous configured origin", async () => {
  const headers = await login();
  const input = await proof();
  authConfig.origin = "https://app.example.test:8443";
  const changedHeaders = { ...input.headers, origin: authConfig.origin };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        ...input,
        headers: changedHeaders,
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await app.inject({ url: "/api/auth/session", headers })).statusCode,
  ).toBe(401);
  expect(
    (
      await pool.query("SELECT consumed_at FROM auth_challenges WHERE id=$1", [
        input.payload.challengeId,
      ])
    ).rows[0].consumed_at,
  ).toBeNull();
});

it("rejects SDK-native JSON then verifies normalized Meteor proof without weakening key or replay checks", async () => {
  const input = await proof();
  const native = {
    accountId: input.payload.accountId,
    publicKey: { toString: () => input.payload.publicKey },
    signature: Buffer.from(input.payload.signature, "base64"),
  };
  const malformed = JSON.parse(JSON.stringify({ ...input.payload, ...native }));
  const rejected = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    headers: input.headers,
    payload: malformed,
  });
  expect(rejected.statusCode).toBe(400);
  expect(rejected.json().error).toBe("INVALID_REQUEST");
  expect(rejected.json().issues).toEqual([
    { field: "publicKey", category: "TYPE" },
    { field: "signature", category: "TYPE" },
  ]);
  const normalized = normalizeWalletProof(native);
  const payload = { ...input.payload, ...normalized };
  keyAllowed = false;
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers: input.headers,
        payload,
      })
    ).statusCode,
  ).toBe(401);
  keyAllowed = true;
  const tamperedBytes = new Uint8Array(native.signature);
  tamperedBytes[0] = (tamperedBytes[0] ?? 0) ^ 1;
  const tampered = normalizeWalletProof({
    ...native,
    signature: tamperedBytes,
  });
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers: input.headers,
        payload: { ...input.payload, ...tampered },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers: input.headers,
        payload,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers: input.headers,
        payload,
      })
    ).statusCode,
  ).toBe(401);
});

it("issues five-minute challenges and absolute fifteen-minute sessions without refresh extension", async () => {
  const input = await proof();
  const challenge = (
    await pool.query(
      "SELECT extract(epoch FROM expires_at-created_at)::float8 AS ttl FROM auth_challenges WHERE id=$1",
      [input.payload.challengeId],
    )
  ).rows[0];
  expect(challenge.ttl).toBeGreaterThan(295);
  expect(challenge.ttl).toBeLessThanOrEqual(300);
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    ...input,
  });
  expect(response.statusCode).toBe(200);
  const headers = {
    origin,
    cookie: cookie(response, "__Host-avroqen_session"),
    "x-csrf-token": response.json().csrfToken,
  };
  const session = (
    await pool.query(
      "SELECT extract(epoch FROM expires_at-created_at)::float8 AS ttl FROM auth_sessions",
    )
  ).rows[0];
  expect(session.ttl).toBeGreaterThan(895);
  expect(session.ttl).toBeLessThan(901);
  for (let i = 0; i < 2; i++) {
    const refreshed = await app.inject({ url: "/api/auth/session", headers });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().expiresAt).toBe(response.json().expiresAt);
  }
  await pool.query(
    "UPDATE auth_sessions SET created_at=clock_timestamp()-interval '16 minutes', expires_at=clock_timestamp()-interval '1 second'",
  );
  expect(
    (await app.inject({ url: "/api/auth/session", headers })).statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/organizations",
        headers,
        payload: { name: "Expired" },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM organizations")).rows[0]
      .n,
  ).toBe(0);
});

it("rechecks challenge expiration after RPC verification before consuming it", async () => {
  const input = await proof();
  beforeKeyCheck = async () => {
    await pool.query(
      "UPDATE auth_challenges SET created_at=clock_timestamp()-interval '6 minutes', expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [input.payload.challengeId],
    );
  };
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    ...input,
  });
  expect(response.statusCode).toBe(401);
  expect(
    (
      await pool.query("SELECT consumed_at FROM auth_challenges WHERE id=$1", [
        input.payload.challengeId,
      ])
    ).rows[0].consumed_at,
  ).toBeNull();
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
      .n,
  ).toBe(0);
});

it("revokes the stored session on logout and rejects retained cookies for reads and mutations", async () => {
  const headers = await login();
  const org = (
    await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers,
      payload: { name: "Existing" },
    })
  ).json().id;
  const url = `/api/organizations/${org}/agents`;
  const agent = (
    await app.inject({
      method: "POST",
      url,
      headers,
      payload: { name: "Existing", accountId: "agent.testnet" },
    })
  ).json().id;
  expect(
    (await app.inject({ method: "POST", url: "/api/auth/logout", headers }))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await pool.query(
        "SELECT revoked_at IS NOT NULL AS revoked FROM auth_sessions",
      )
    ).rows[0].revoked,
  ).toBe(true);
  for (const path of ["/api/auth/session", "/api/organizations", url])
    expect((await app.inject({ url: path, headers })).statusCode).toBe(401);
  for (const [path, payload] of [
    ["/api/organizations", { name: "Forbidden" }],
    [url, { name: "Forbidden", accountId: "other.testnet" }],
    [`${url}/${agent}/disable`, {}],
  ] as const)
    expect(
      (await app.inject({ method: "POST", url: path, headers, payload }))
        .statusCode,
    ).toBe(401);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM organizations")).rows[0]
      .n,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM registered_agents WHERE disabled_at IS NULL",
      )
    ).rows[0].n,
  ).toBe(1);
});

it("enforces Origin on challenge and verification without consuming a valid proof", async () => {
  const input = await proof();
  for (const supplied of [
    undefined,
    "null",
    "https://evil.test",
    `${origin}:8443`,
  ]) {
    const headers = {
      cookie: input.headers.cookie,
      ...(supplied === undefined ? {} : { origin: supplied }),
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/challenge",
          headers,
          payload: { accountId: "alice.testnet", network: "testnet" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/verify",
          headers,
          payload: input.payload,
        })
      ).statusCode,
    ).toBe(403);
  }
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
      .n,
  ).toBe(0);
  expect(
    (await app.inject({ method: "POST", url: "/api/auth/verify", ...input }))
      .statusCode,
  ).toBe(200);
});

it("rejects restricted and missing keys through finalized RPC parsing with real PostgreSQL", async () => {
  let envelope: object = {};
  const verifier = fullAccessVerifier("testnet", async (url, options) => {
    expect(url).toBe("https://rpc.testnet.near.org");
    const request = JSON.parse(String(options?.body));
    expect(request.params.finality).toBe("final");
    expect(request.params.request_type).toBe("view_access_key");
    expect(request.params.account_id).toBe("alice.testnet");
    expect(request.params.public_key === publicKey).toBe(true);
    return new Response(JSON.stringify({ id: "m1-key", ...envelope }));
  });
  const rpcApp = buildApi(async () => {}, {
    pool,
    config: authConfig,
    verifyKey: verifier,
  });
  try {
    const input = await proof();
    for (const result of [
      {
        result: {
          permission: {
            FunctionCall: { receiver_id: "agent.testnet", method_names: [] },
          },
        },
      },
      { error: { cause: { name: "UNKNOWN_ACCESS_KEY" } } },
      { error: { cause: { name: "UNKNOWN_ACCOUNT" } } },
    ]) {
      envelope = result;
      const rejected = await rpcApp.inject({
        method: "POST",
        url: "/api/auth/verify",
        ...input,
      });
      expect(rejected.statusCode).toBe(401);
      expect(
        rejected.cookies.some(
          (entry) => entry.name === "__Host-avroqen_session",
        ),
      ).toBe(false);
    }
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
        .n,
    ).toBe(0);
    envelope = { result: { permission: "FullAccess" } };
    expect(
      (
        await rpcApp.inject({
          method: "POST",
          url: "/api/auth/verify",
          ...input,
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await rpcApp.close();
  }
});

it("persists disabling across login and rechecks membership on every mutation without granting agent authority", async () => {
  let alice = await login();
  const bob = await login("bob.testnet");
  const org = (
    await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: alice,
      payload: { name: "Persistent" },
    })
  ).json().id;
  const url = `/api/organizations/${org}/agents`;
  const payload = { name: "Agent", accountId: "agent.testnet" };
  expect(
    (await app.inject({ method: "POST", url, headers: bob, payload }))
      .statusCode,
  ).toBe(403);
  const agent = (
    await app.inject({ method: "POST", url, headers: alice, payload })
  ).json().id;
  const disableUrl = `${url}/${agent}/disable`;
  const first = await app.inject({
    method: "POST",
    url: disableUrl,
    headers: alice,
  });
  expect(first.statusCode).toBe(200);
  const second = await app.inject({
    method: "POST",
    url: disableUrl,
    headers: alice,
  });
  expect(second.statusCode).toBe(200);
  expect(second.json().disabledAt).toBe(first.json().disabledAt);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: alice,
      })
    ).statusCode,
  ).toBe(200);
  alice = await login();
  const restored = await app.inject({ url, headers: alice });
  expect(restored.statusCode).toBe(200);
  expect(restored.json().agents[0].disabledAt).toBe(first.json().disabledAt);
  // Registering an account creates neither a membership nor execution authority.
  const agentWallet = await login("agent.testnet");
  expect((await app.inject({ url, headers: agentWallet })).statusCode).toBe(
    403,
  );
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM memberships WHERE account_id='agent.testnet'",
      )
    ).rows[0].n,
  ).toBe(0);
  for (const role of ["viewer", "member"]) {
    await pool.query("UPDATE memberships SET role=$1 WHERE org_id=$2", [
      role,
      org,
    ]);
    expect((await app.inject({ url, headers: alice })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: alice,
          payload: { name: "Forbidden", accountId: "other.testnet" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "POST", url: disableUrl, headers: alice }))
        .statusCode,
    ).toBe(403);
  }
  await pool.query(
    "UPDATE memberships SET role='owner', status='disabled' WHERE org_id=$1",
    [org],
  );
  expect((await app.inject({ url, headers: alice })).statusCode).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        headers: alice,
        payload: { name: "Forbidden", accountId: "other.testnet" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await app.inject({ method: "POST", url: disableUrl, headers: alice }))
      .statusCode,
  ).toBe(403);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM registered_agents"))
      .rows[0].n,
  ).toBe(1);
});

it("rolls back session issuance and nonce consumption if the success audit fails", async () => {
  const input = await proof();
  await pool.query(`CREATE FUNCTION reject_success_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.event='login_succeeded' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_success_audit BEFORE INSERT ON security_audit_records FOR EACH ROW EXECUTE FUNCTION reject_success_audit()`);
  try {
    const rejected = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      ...input,
    });
    expect(rejected.statusCode).toBe(503);
    expect(rejected.json()).toEqual({ error: "SERVICE_UNAVAILABLE" });
    expect(
      rejected.cookies.some((entry) => entry.name === "__Host-avroqen_session"),
    ).toBe(false);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
        .n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT consumed_at FROM auth_challenges WHERE id=$1",
          [input.payload.challengeId],
        )
      ).rows[0].consumed_at,
    ).toBeNull();
  } finally {
    await pool.query(
      "DROP TRIGGER reject_success_audit ON security_audit_records; DROP FUNCTION reject_success_audit()",
    );
  }
  expect(
    (await app.inject({ method: "POST", url: "/api/auth/verify", ...input }))
      .statusCode,
  ).toBe(200);
});

it("rejects valid-browser substitution and cross-challenge signature reuse without consuming either challenge", async () => {
  const a = await proof();
  const b = await proof();
  for (const input of [
    { payload: a.payload, headers: b.headers },
    {
      payload: { ...b.payload, signature: a.payload.signature },
      headers: b.headers,
    },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      ...input,
    });
    expect(response.statusCode).toBe(401);
    expect(
      response.cookies.some((entry) => entry.name === "__Host-avroqen_session"),
    ).toBe(false);
  }
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
      .n,
  ).toBe(0);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM auth_challenges WHERE consumed_at IS NOT NULL",
      )
    ).rows[0].n,
  ).toBe(0);
  for (const input of [a, b]) {
    expect(
      (await app.inject({ method: "POST", url: "/api/auth/verify", ...input }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "POST", url: "/api/auth/verify", ...input }))
        .statusCode,
    ).toBe(401);
  }
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
      .n,
  ).toBe(2);
});

it("issues and clears host-only secure challenge/session cookies without Domain", async () => {
  // Inspect metadata only: assertion failures must not dump cookie values.
  function metadata(
    headers: string | string[] | number | undefined,
    name: string,
  ) {
    const values = Array.isArray(headers)
      ? headers
      : typeof headers === "string"
        ? [headers]
        : [];
    const value = values.find((entry) => entry.startsWith(`${name}=`));
    expect(Boolean(value)).toBe(true);
    const attributes =
      value
        ?.split(";")
        .slice(1)
        .map((entry) => entry.trim().toLowerCase()) ?? [];
    return {
      secure: attributes.includes("secure"),
      httpOnly: attributes.includes("httponly"),
      sameSiteStrict: attributes.includes("samesite=strict"),
      rootPath: attributes.includes("path=/"),
      hasDomain: attributes.some((entry) => /^domain\s*=/.test(entry)),
      maxAge: attributes
        .find((entry) => entry.startsWith("max-age="))
        ?.slice(8),
      cleared: value?.startsWith(`${name}=;`) ?? false,
    };
  }
  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/challenge",
    headers: { origin },
    payload: { accountId: "alice.testnet", network: "testnet" },
  });
  expect(challenge.statusCode).toBe(200);
  const loginCookie = metadata(
    challenge.headers["set-cookie"],
    "__Host-avroqen_login",
  );
  const protections = {
    secure: true,
    httpOnly: true,
    sameSiteStrict: true,
    rootPath: true,
    hasDomain: false,
  };
  expect(loginCookie).toEqual({
    ...protections,
    maxAge: "300",
    cleared: false,
  });
  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    ...(await proof()),
  });
  expect(verified.statusCode).toBe(200);
  expect(
    metadata(verified.headers["set-cookie"], "__Host-avroqen_login"),
  ).toMatchObject({ ...protections, cleared: true });
  expect(
    metadata(verified.headers["set-cookie"], "__Host-avroqen_session"),
  ).toEqual({ ...protections, maxAge: "900", cleared: false });
  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: {
      origin,
      cookie: cookie(verified, "__Host-avroqen_session"),
      "x-csrf-token": verified.json().csrfToken,
    },
  });
  expect(logout.statusCode).toBe(200);
  expect(
    metadata(logout.headers["set-cookie"], "__Host-avroqen_session"),
  ).toMatchObject({ ...protections, cleared: true });
});

it.each(["session", "membership"])(
  "denies a mutation waiting behind committed %s revocation",
  async (boundary) => {
    const headers = await login();
    const created = await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers,
      payload: { name: "Contention fixture" },
    });
    expect(created.statusCode).toBe(201);
    const org = created.json().id;
    const blocker = await pool.connect();
    let pending: Promise<{ statusCode: number }> | undefined;
    try {
      await blocker.query("BEGIN");
      if (boundary === "session")
        await blocker.query(
          "UPDATE auth_sessions SET revoked_at=clock_timestamp()",
        );
      else
        await blocker.query(
          "UPDATE memberships SET status='disabled' WHERE org_id=$1",
          [org],
        );
      pending = app.inject({
        method: "POST",
        url: `/api/organizations/${org}/agents`,
        headers,
        payload: { name: "Denied", accountId: "agent.testnet" },
      });
      // Start the thenable request before observing the actual PostgreSQL lock wait.
      const completed = Promise.resolve(pending);
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting =
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
              [schema],
            )
          ).rows[0].n > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await blocker.query("COMMIT");
      expect((await completed).statusCode).toBe(
        boundary === "session" ? 401 : 403,
      );
      expect(
        (await pool.query("SELECT count(*)::int AS n FROM registered_agents"))
          .rows[0].n,
      ).toBe(0);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      if (pending) await pending;
    }
  },
);

it("distinguishes active and disabled duplicates without reactivation or duplicate audit", async () => {
  const headers = await login();
  const org = (
    await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers,
      payload: { name: "Duplicates" },
    })
  ).json().id;
  const url = `/api/organizations/${org}/agents`,
    payload = { name: "Agent", accountId: "agent.testnet" };
  const results = await Promise.all([
    app.inject({ method: "POST", url, headers, payload }),
    app.inject({ method: "POST", url, headers, payload }),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  expect(results.find((r) => r.statusCode === 409)?.json().error).toBe(
    "AGENT_ALREADY_REGISTERED",
  );
  const id = results.find((r) => r.statusCode === 201)?.json().id;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `${url}/${id}/disable`,
        headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(200);
  const disabled = await app.inject({ method: "POST", url, headers, payload });
  expect(disabled.statusCode).toBe(409);
  expect(disabled.json()).toEqual({ error: "AGENT_PREVIOUSLY_DISABLED" });
  const rows = (await pool.query("SELECT disabled_at FROM registered_agents"))
    .rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].disabled_at).not.toBeNull();
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM security_audit_records WHERE event='agent_registered'",
      )
    ).rows[0].n,
  ).toBe(1);
});
