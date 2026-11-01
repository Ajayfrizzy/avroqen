import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { serialize } from "borsh";
import bs58 from "bs58";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { buildApi } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/db/migrate.js";
import { readApiConfig } from "../../packages/domain/src/index.js";

const schema = `m1_api_${randomUUID().replaceAll("-", "")}`;
const settings = readApiConfig(process.env).database;
const admin = new pg.Pool(settings);
const pool = new pg.Pool({ ...settings, options: `-c search_path=${schema}` });
const origin = "https://app.example.test";
let keyAllowed = true;
let keyUnavailable = false;
const app = buildApi(async () => {}, {
  pool,
  config: { origin, network: "testnet", secure: true },
  verifyKey: async () => {
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
  keyAllowed = true;
  keyUnavailable = false;
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
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      app.inject({ method: "POST", url: "/api/auth/verify", ...input }),
    ),
  );
  expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1);
  expect(responses.filter((r) => r.statusCode === 401)).toHaveLength(5);
});
it("rejects forged, account/network-substituted and browser-substituted proofs", async () => {
  const input = await proof();
  for (const payload of [
    { ...input.payload, signature: Buffer.alloc(64).toString("base64") },
    { ...input.payload, accountId: "bob.testnet" },
    { ...input.payload, network: "mainnet" },
    { ...input.payload, role: "owner" },
  ]) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/verify",
          headers: input.headers,
          payload,
        })
      ).statusCode,
    ).toBeGreaterThanOrEqual(400);
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
