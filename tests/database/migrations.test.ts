import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "../../apps/api/src/db/migrate.js";
import { readApiConfig } from "../../packages/domain/src/index.js";

const schema = `m1_test_${randomUUID().replaceAll("-", "")}`;
const settings = readApiConfig(process.env).database;
const admin = new pg.Pool(settings);
const pool = new pg.Pool({ ...settings, options: `-c search_path=${schema}` });
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
});
afterAll(async () => {
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
it("applies migrations once, including concurrent runners", async () => {
  await Promise.all([migrate(pool), migrate(pool)]);
  expect(
    (await pool.query("SELECT count(*)::int AS count FROM schema_migrations"))
      .rows[0].count,
  ).toBe(7);
});
it("rejects invalid roles and account/network mismatches at storage boundaries", async () => {
  const org = randomUUID();
  await pool.query(
    "INSERT INTO organizations (id,network,display_name) VALUES ($1,$2,$3)",
    [org, "testnet", "Organization"],
  );
  await expect(
    pool.query(
      "INSERT INTO memberships (org_id,network,account_id,role) VALUES ($1,$2,$3,$4)",
      [org, "mainnet", "alice.near", "owner"],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      "INSERT INTO memberships (org_id,network,account_id,role) VALUES ($1,$2,$3,$4)",
      [org, "testnet", "alice.testnet", "superadmin"],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      "INSERT INTO registered_agents (id,org_id,network,near_account,display_name) VALUES ($1,$2,$3,$4,$5)",
      [randomUUID(), org, "testnet", "Bad Account", "Agent"],
    ),
  ).rejects.toThrow();
});
it("binds sessions to challenge identity and prevents duplicate session issuance", async () => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auth_challenges
    (id,network,account_id,nonce,browser_hash,message,recipient,callback_url,expires_at)
    VALUES ($1,'testnet','alice.testnet',$2,$3,'fixture','localhost','http://localhost/callback',clock_timestamp()+interval '5 minutes')`,
    [id, Buffer.alloc(32, 1), "0".repeat(64)],
  );
  const insert = `INSERT INTO auth_sessions (token_hash,challenge_id,csrf_hash,network,account_id,public_key,expires_at)
    VALUES ($1,$2,$3,$4,$5,'public-key-fixture',clock_timestamp()+interval '15 minutes')`;
  await expect(
    pool.query(insert, [
      "1".repeat(64),
      id,
      "2".repeat(64),
      "mainnet",
      "alice.testnet",
    ]),
  ).rejects.toThrow();
  await expect(
    pool.query(insert, [
      "1".repeat(64),
      id,
      "2".repeat(64),
      "testnet",
      "bob.testnet",
    ]),
  ).rejects.toThrow();
  const results = await Promise.allSettled([
    pool.query(insert, [
      "3".repeat(64),
      id,
      "2".repeat(64),
      "testnet",
      "alice.testnet",
    ]),
    pool.query(insert, [
      "4".repeat(64),
      id,
      "2".repeat(64),
      "testnet",
      "alice.testnet",
    ]),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
});

it("detects edited migration history instead of silently continuing", async () => {
  await pool.query("UPDATE schema_migrations SET checksum='tampered'");
  await expect(migrate(pool)).rejects.toThrow(
    "Applied migration checksum mismatch",
  );
});
