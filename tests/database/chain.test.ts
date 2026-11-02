import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { serialize } from "borsh";
import bs58 from "bs58";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { buildApi } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/db/migrate.js";
import {
  type ConsentAction,
  readApiConfig,
} from "../../packages/domain/src/index.js";
import { NearReader } from "../../services/chain/rpc.js";
import { runOnce } from "../../services/chain/worker.js";

const schema = `m6_${randomUUID().replaceAll("-", "")}`;
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
const manifest = {
  account: "vault.testnet",
  network: "testnet" as const,
  wasmSha256: "a".repeat(64),
  keyFingerprints: ["b".repeat(64)],
  authorization: "test-only-authorization",
};
let rpcDown = false;
let rpcResult: unknown;
class FixtureReader extends NearReader {
  override async deployment(_manifest?: unknown, at?: string) {
    if (rpcDown) throw new Error("outage");
    return {
      block: {
        height:
          at === bs58.encode(Buffer.alloc(32, 1)) || rpcResult === undefined
            ? 100
            : 101,
        hash: bs58.encode(
          Buffer.alloc(
            32,
            at === bs58.encode(Buffer.alloc(32, 1)) || rpcResult === undefined
              ? 1
              : 4,
          ),
        ),
        prev_hash: bs58.encode(Buffer.alloc(32, 2)),
        timestamp_nanosec: "1",
      },
      account: {
        block_hash: bs58.encode(Buffer.alloc(32, 1)),
        code_hash: bs58.encode(Buffer.alloc(32, 3)),
        amount: "1",
        storage_usage: 1,
      },
      accounting: { network: "testnet" as const, vault: "vault.testnet" },
    };
  }
  override async block(id?: string | number) {
    const d = await this.deployment(
      undefined,
      id === 100
        ? bs58.encode(Buffer.alloc(32, 1))
        : typeof id === "string"
          ? id
          : undefined,
    );
    return { header: d.block, chunks: [] };
  }
  override async rpc() {
    if (rpcResult !== undefined) return rpcResult;
    throw new Error("synthetic RPC outage");
  }
}
const reader = new FixtureReader();
const app = buildApi(async () => {}, {
  pool,
  chain: { manifest, reader },
  config: { origin, network: "testnet", secure: true },
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

let mandateId: string;
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
  rpcDown = false;
  rpcResult = undefined;
  hook = undefined;
  keyAllowed = true;
  unavailable = false;
  await pool.query(
    "TRUNCATE request_limits,security_audit_records,organizations,auth_sessions,auth_challenges CASCADE",
  );
  headers = await login();
  org = (await post("/api/organizations", { name: "Chain org" })).json().id;
  agentId = (
    await post(`/api/organizations/${org}/agents`, {
      name: "Agent",
      accountId: "agent.testnet",
    })
  ).json().id;
  const d = await draft();
  mandateId = d.policy.mandateId;
  expect(
    (await post(`${path(mandateId)}/verify`, await proof(mandateId)))
      .statusCode,
  ).toBe(200);
  await pool.query("TRUNCATE request_limits");
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
const prepare = (
  operation: object = { kind: "FUND", amount: "1" },
  key = randomUUID(),
  h = headers,
) =>
  post(
    `${path(mandateId)}/chain/intents`,
    { idempotencyKey: key, operation },
    h,
  );
it("persists exact immutable operation and atomically records preparation", async () => {
  const r = await prepare();
  expect(r.statusCode).toBe(201);
  expect(r.json().operation.deposit).toBe("1");
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM chain_events")).rows[0].n,
  ).toBe(1);
  await expect(
    pool.query(
      "UPDATE chain_intents SET canonical_operation='{}' WHERE id=$1",
      [r.json().id],
    ),
  ).rejects.toThrow();
  await expect(pool.query("DELETE FROM chain_events")).rejects.toThrow();
});
it("serializes duplicate and concurrent preparations without duplicate financial intents", async () => {
  const key = randomUUID();
  const r = await Promise.all([
    prepare(undefined, key),
    prepare(undefined, key),
  ]);
  expect(r.map((x) => x.statusCode)).toEqual([201, 201]);
  expect(required(r[0]).json().id).toBe(required(r[1]).json().id);
  expect((await prepare()).statusCode).toBe(409);
});
it("rejects conflicting idempotency terms", async () => {
  const key = randomUUID();
  await prepare(undefined, key);
  expect((await prepare({ kind: "FUND", amount: "2" }, key)).statusCode).toBe(
    409,
  );
});
it("requires origin, session, CSRF and original owner", async () => {
  expect(
    (
      await prepare(undefined, randomUUID(), {
        ...headers,
        "x-csrf-token": "wrong",
      })
    ).statusCode,
  ).toBe(403);
  const attacker = await login("attacker.testnet");
  expect((await prepare(undefined, randomUUID(), attacker)).statusCode).toBe(
    403,
  );
  expect(
    (
      await prepare(undefined, randomUUID(), {
        ...headers,
        origin: "https://evil.test",
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM chain_intents")).rows[0]
      .n,
  ).toBe(0);
});
it("denies role escalation even for a different organization owner", async () => {
  const h = await login("other.testnet");
  await post("/api/organizations", { name: "Other" }, h);
  expect((await prepare(undefined, randomUUID(), h)).statusCode).toBe(403);
});
it("keeps funds/execute blocked after consent revoke but permits safe withdrawal preparation", async () => {
  await post(
    `${path(mandateId)}/verify`,
    await proof(mandateId, "REVOKE_CONSENT"),
  );
  expect((await prepare()).statusCode).toBe(409);
  expect((await prepare({ kind: "WITHDRAW", amount: "1" })).statusCode).toBe(
    201,
  );
});
it("blocks disabled agents and revoked session at prompt opening", async () => {
  const r = await prepare();
  await post(`/api/organizations/${org}/agents/${agentId}/disable`, {});
  expect(
    (await post(`/api/chain/intents/${r.json().id}/begin`, {})).statusCode,
  ).toBe(409);
  await post("/api/auth/logout", {});
  expect(
    (await post(`/api/chain/intents/${r.json().id}/begin`, {})).statusCode,
  ).toBe(401);
});
it("never opens the same intent twice; missing wallet result stays quarantined across worker restarts", async () => {
  const r = await prepare();
  const id = r.json().id;
  expect((await post(`/api/chain/intents/${id}/begin`, {})).statusCode).toBe(
    200,
  );
  expect((await post(`/api/chain/intents/${id}/begin`, {})).statusCode).toBe(
    409,
  );
  expect(
    (await post(`/api/chain/intents/${id}/report`, { hash: null })).json()
      .state,
  ).toBe("UNKNOWN");
  await Promise.all([runOnce(pool, reader), runOnce(pool, reader)]);
  const row = (
    await pool.query("SELECT * FROM chain_intents WHERE id=$1", [id])
  ).rows[0];
  expect(row.state).toBe("UNKNOWN");
  expect(row.verified_hash).toBeNull();
  expect((await prepare()).statusCode).toBe(409);
  await pool.query(
    "UPDATE chain_intents SET next_check=clock_timestamp() WHERE id=$1",
    [id],
  );
  await runOnce(pool, new FixtureReader());
  expect(
    (await pool.query("SELECT state FROM chain_intents WHERE id=$1", [id]))
      .rows[0].state,
  ).toBe("UNKNOWN");
});
it("rolls back the intent when audit persistence fails", async () => {
  await pool.query(
    "CREATE FUNCTION reject_chain_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_audit BEFORE INSERT ON chain_events FOR EACH ROW EXECUTE FUNCTION reject_chain_audit()",
  );
  try {
    expect((await prepare()).statusCode).toBe(503);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM chain_intents")).rows[0]
        .n,
    ).toBe(0);
  } finally {
    await pool.query(
      "DROP TRIGGER reject_audit ON chain_events; DROP FUNCTION reject_chain_audit()",
    );
  }
});
it("RPC outage prevents preparation without fabricating deployment status", async () => {
  rpcDown = true;
  expect((await prepare()).statusCode).toBe(503);
  const r = await app.inject({ url: "/api/chain/status", headers });
  expect(r.json().submissionEnabled).toBe(false);
});
it("untrusted wallet hash is not an explorer link or success", async () => {
  const r = await prepare();
  await post(`/api/chain/intents/${r.json().id}/begin`, {});
  await post(`/api/chain/intents/${r.json().id}/report`, {
    hash: bs58.encode(Buffer.alloc(32, 5)),
  });
  const v = await app.inject({ url: `${path(mandateId)}/chain`, headers });
  expect(v.statusCode).toBe(200);
  expect(v.json().intents[0].explorerUrl).toBeNull();
  expect(v.json().intents[0].state).toBe("BROADCAST_REPORTED");
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Required evidence missing");
  return value;
}

function finalizedFixture(operation: Record<string, unknown>, failure = false) {
  const txHash = bs58.encode(Buffer.alloc(32, 5)),
    receipt = bs58.encode(Buffer.alloc(32, 6)),
    block = bs58.encode(Buffer.alloc(32, 4));
  const actions = [
    {
      FunctionCall: {
        method_name: operation.methodName,
        args: Buffer.from(JSON.stringify(operation.args)).toString("base64"),
        gas: operation.gas,
        deposit: operation.deposit,
      },
    },
  ];
  return {
    final_execution_status: "FINAL",
    transaction: {
      hash: txHash,
      signer_id: operation.signerId,
      receiver_id: operation.receiverId,
      actions,
    },
    transaction_outcome: {
      id: txHash,
      block_hash: block,
      outcome: {
        executor_id: operation.signerId,
        receipt_ids: [receipt],
        status: { SuccessReceiptId: receipt },
      },
    },
    receipts_outcome: [
      {
        id: receipt,
        block_hash: block,
        outcome: {
          executor_id: operation.receiverId,
          receipt_ids: [],
          status: failure ? { Failure: {} } : { SuccessValue: "" },
        },
      },
    ],
    receipts: [
      {
        receipt_id: receipt,
        predecessor_id: operation.signerId,
        receiver_id: operation.receiverId,
        receipt: {
          Action: { actions, input_data_ids: [], output_data_receivers: [] },
        },
      },
    ],
  };
}
it.each([false, true])(
  "reconciles definitive receipt outcome and is terminal/idempotent (failure=%s)",
  async (failure) => {
    const r = await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" });
    expect(r.statusCode).toBe(201);
    const id = r.json().id;
    await post(`/api/chain/intents/${id}/begin`, {});
    await post(`/api/chain/intents/${id}/report`, {
      hash: bs58.encode(Buffer.alloc(32, 5)),
    });
    rpcResult = finalizedFixture(r.json().operation, failure);
    await runOnce(pool, reader);
    const row = (
      await pool.query("SELECT * FROM chain_intents WHERE id=$1", [id])
    ).rows[0];
    expect(row.state).toBe(failure ? "CONFIRMED_FAILED" : "CONFIRMED_SUCCESS");
    const events = (
      await pool.query("SELECT count(*)::int AS n FROM chain_events")
    ).rows[0].n;
    expect(await runOnce(pool, reader)).toBe(false);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM chain_events")).rows[0]
        .n,
    ).toBe(events);
    await expect(
      pool.query("UPDATE chain_intents SET state='UNKNOWN' WHERE id=$1", [id]),
    ).rejects.toThrow();
  },
);
it("quarantines a transaction receipt mismatch without manufacturing settlement", async () => {
  const r = await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" });
  const id = r.json().id;
  await post(`/api/chain/intents/${id}/begin`, {});
  await post(`/api/chain/intents/${id}/report`, {
    hash: bs58.encode(Buffer.alloc(32, 5)),
  });
  const raw = finalizedFixture(r.json().operation);
  raw.transaction.receiver_id = "attacker.testnet";
  rpcResult = raw;
  await runOnce(pool, reader);
  const row = (
    await pool.query(
      "SELECT state,verified_hash FROM chain_intents WHERE id=$1",
      [id],
    )
  ).rows[0];
  expect(row.state).toBe("UNKNOWN");
  expect(row.verified_hash).toBeNull();
});
it("does not let stale workers advance a finalized block projection", async () => {
  const r = await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" });
  const id = r.json().id;
  await post(`/api/chain/intents/${id}/begin`, {});
  await pool.query(
    "UPDATE chain_intents SET last_height=101,last_block_hash=$2 WHERE id=$1",
    [id, bs58.encode(Buffer.alloc(32, 9))],
  );
  await runOnce(pool, reader);
  expect(
    (
      await pool.query(
        "SELECT state,last_height FROM chain_intents WHERE id=$1",
        [id],
      )
    ).rows[0],
  ).toMatchObject({ state: "UNKNOWN", last_height: "101" });
});

it("revoked membership cannot prepare or open owner operations", async () => {
  const r = await prepare();
  await pool.query(
    "UPDATE memberships SET status='disabled' WHERE org_id=$1 AND account_id='alice.testnet'",
    [org],
  );
  expect(
    (await post(`/api/chain/intents/${r.json().id}/begin`, {})).statusCode,
  ).toBe(403);
  expect((await prepare()).statusCode).toBe(403);
});

it("historical finalized success cannot settle a new intent or release its lock", async () => {
  const r = await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" });
  const id = r.json().id;
  await post(`/api/chain/intents/${id}/begin`, {});
  await post(`/api/chain/intents/${id}/report`, {
    hash: bs58.encode(Buffer.alloc(32, 5)),
  });
  const raw = finalizedFixture(r.json().operation);
  raw.transaction_outcome.block_hash = bs58.encode(Buffer.alloc(32, 1));
  for (const receipt of raw.receipts_outcome)
    receipt.block_hash = bs58.encode(Buffer.alloc(32, 1));
  rpcResult = raw;
  await runOnce(pool, reader);
  expect(
    (
      await pool.query(
        "SELECT state,reason,verified_hash FROM chain_intents WHERE id=$1",
        [id],
      )
    ).rows[0],
  ).toMatchObject({
    state: "UNKNOWN",
    reason: "TRANSACTION_PREDATES_INTENT",
    verified_hash: null,
  });
  expect(
    (await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" })).statusCode,
  ).toBe(409);
});
