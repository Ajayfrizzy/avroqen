import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "../../apps/api/src/db/migrate.js";
import { migrateAtStartup } from "../../apps/api/src/db/startup.js";
import {
  canonicalPolicy,
  mandatePolicy,
  readApiConfig,
} from "../../packages/domain/src/index.js";

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
  ).toBe(9);
});
it("installs operation-scoped intent and wallet-prompt constraints", async () => {
  const indexes = await pool.query(
    "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename='chain_intents' ORDER BY indexname",
  );
  const definitions = Object.fromEntries(
    indexes.rows.map((row) => [row.indexname, row.indexdef]),
  );
  expect(definitions.chain_one_unresolved).toBeUndefined();
  expect(definitions.chain_one_unresolved_mandate).toContain(
    "actor_account, vault_account, mandate_id",
  );
  expect(definitions.chain_one_unresolved_storage_resource).toContain(
    "STORAGE_DEPOSIT",
  );
  expect(definitions.chain_one_active_wallet_prompt).toContain(
    "state = 'AWAITING_WALLET'",
  );
});
it("upgrades the historical wallet-wide index without changing UNKNOWN intents", async () => {
  const upgradeSchema = `upgrade_${randomUUID().replaceAll("-", "")}`;
  const legacyDirectory = await mkdtemp(join(tmpdir(), "avroqen-migrations-"));
  const upgradePool = new pg.Pool({
    ...settings,
    options: `-c search_path=${upgradeSchema}`,
  });
  await admin.query(`CREATE SCHEMA ${upgradeSchema}`);
  try {
    const migrationDirectory = new URL("../../db/migrations/", import.meta.url);
    for (const name of (await readdir(migrationDirectory))
      .filter((value) => /^00[1-8]_.*\.sql$/.test(value))
      .sort())
      await cp(new URL(name, migrationDirectory), join(legacyDirectory, name));
    await migrate(upgradePool, pathToFileURL(`${legacyDirectory}/`));

    const organizationId = randomUUID();
    const agentId = randomUUID();
    const mandateIds = [randomUUID(), randomUUID()];
    await upgradePool.query(
      "INSERT INTO organizations(id,network,display_name) VALUES($1,'testnet','Upgrade test')",
      [organizationId],
    );
    await upgradePool.query(
      "INSERT INTO registered_agents(id,org_id,network,near_account,display_name) VALUES($1,$2,'testnet','agent.testnet','Agent')",
      [agentId, organizationId],
    );
    const operations: string[] = [];
    for (const [index, mandateId] of mandateIds.entries()) {
      const policy = mandatePolicy.parse({
        schemaVersion: 1,
        policyVersion: 1,
        mandateId,
        organizationId,
        ownerAccount: "owner.testnet",
        network: "testnet",
        agentAccount: "agent.testnet",
        vaultAccount: "vault.testnet",
        agentId,
        recipient: `vendor-${index}.testnet`,
        asset: "NativeNear",
        taskReference: `Upgrade mandate ${index}`,
        maxPerPaymentAtomic: "1",
        totalBudgetAtomic: "10",
        expiresAtNs: "1795183440000000000",
        maxExecutions: 1,
        verifierPolicy: {
          version: 1,
          accounts: [`verifier-${index}.testnet`],
          threshold: 1,
          requiredClaims: ["SERVICE_CONFIRMED"],
          requireOwnerApproval: true,
        },
      });
      const canonical = canonicalPolicy(policy);
      const digest = createHash("sha256").update(canonical).digest("hex");
      await upgradePool.query(
        `INSERT INTO mandate_policies(id,org_id,network,owner_account,agent_id,agent_account,canonical_policy,policy_digest,expires_at_ns)
         VALUES($1,$2,'testnet','owner.testnet',$3,'agent.testnet',$4,$5,$6)`,
        [
          mandateId,
          organizationId,
          agentId,
          canonical,
          digest,
          policy.expiresAtNs,
        ],
      );
      operations.push(
        JSON.stringify({
          network: "testnet",
          signerId: "owner.testnet",
          receiverId: "vault.testnet",
          methodName: "register_mandate",
          args: {
            canonical_policy: canonical,
            expected_digest: digest,
            guardian: null,
            storage_limit: "100",
          },
          gas: "100000000000000",
          deposit: "1",
          mandateId,
          policyDigest: digest,
          kind: "REGISTER",
        }),
      );
    }
    const insertIntent = (index: number) =>
      upgradePool.query(
        `INSERT INTO chain_intents(id,org_id,mandate_id,actor_account,network,vault_account,idempotency_key,canonical_operation,state,manifest,anchor_height,anchor_hash,scan_height,scan_hash,reason)
         VALUES($1,$2,$3,'owner.testnet','testnet','vault.testnet',$4,$5,'UNKNOWN','{}',100,$6,100,$6,'HASH_NOT_RECOVERED')`,
        [
          randomUUID(),
          organizationId,
          mandateIds[index],
          randomUUID(),
          operations[index],
          "11111111111111111111111111111111",
        ],
      );
    await insertIntent(0);
    await expect(insertIntent(1)).rejects.toThrow();

    await migrateAtStartup(process.env, upgradePool);
    const preserved = await upgradePool.query(
      "SELECT state,reason,reported_hash,verified_hash FROM chain_intents",
    );
    expect(preserved.rows).toEqual([
      {
        state: "UNKNOWN",
        reason: "HASH_NOT_RECOVERED",
        reported_hash: null,
        verified_hash: null,
      },
    ]);
    await expect(insertIntent(1)).resolves.toMatchObject({ rowCount: 1 });
    await expect(insertIntent(0)).rejects.toThrow();
    const indexes = await upgradePool.query(
      "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename='chain_intents' ORDER BY indexname",
    );
    expect(
      indexes.rows.some((row) => row.indexname === "chain_one_unresolved"),
    ).toBe(false);
    expect(
      indexes.rows.find(
        (row) => row.indexname === "chain_one_unresolved_mandate",
      )?.indexdef,
    ).toContain("actor_account, vault_account, mandate_id");
  } finally {
    await upgradePool.end();
    await admin.query(`DROP SCHEMA ${upgradeSchema} CASCADE`);
    await rm(legacyDirectory, { recursive: true, force: true });
  }
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
