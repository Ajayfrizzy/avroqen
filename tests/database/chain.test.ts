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
import { NearReader } from "../../services/chain/rpc.js";
import { runOnce } from "../../services/chain/worker.js";
import {
  monitorOnce,
  sampleLocalHealth,
} from "../../services/security/monitor.js";

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
let guardian: string | null = null;
let duringDeployment: (() => Promise<void>) | undefined;
let rpcResult: unknown;
let recoveryHeadHeight: number | undefined;
let recoveryNonce = "7";
let recoveryCredit: unknown = null;
let recoveryRpcError = "outage";
class FixtureReader extends NearReader {
  override async deployment(_manifest?: unknown, at?: string) {
    if (rpcDown) throw new Error(recoveryRpcError);
    await duringDeployment?.();
    const anchor = at === bs58.encode(Buffer.alloc(32, 1));
    const height = anchor
      ? 100
      : recoveryHeadHeight !== undefined
        ? recoveryHeadHeight
        : rpcResult === undefined
          ? 100
          : 101;
    return {
      block: {
        height,
        hash: bs58.encode(Buffer.alloc(32, anchor || height === 100 ? 1 : 4)),
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
  override async view(
    _account: string,
    method: string,
    _args: Record<string, unknown>,
    _block: string,
  ) {
    if (method === "get_storage_credit") return recoveryCredit;
    const row = (
      await pool.query(
        "SELECT canonical_policy,policy_digest FROM mandate_policies WHERE id=$1",
        [mandateId],
      )
    ).rows[0];
    return {
      policy: JSON.parse(row.canonical_policy),
      policy_digest: row.policy_digest,
      guardian,
      status: "Active",
      available: "0",
      reserved: "0",
      spent: "0",
      withdrawal_pending: "0",
      withdrawn: "0",
      deposited: "0",
      pending_count: 0,
      successful_count: 0,
      proposal_count: 0,
      storage_limit: "100",
      storage_used: "0",
    };
  }
  override async query(_type: string, _account: string, block: string) {
    return {
      block_hash: block,
      keys: [
        {
          public_key: publicKey,
          access_key: {
            nonce:
              block === bs58.encode(Buffer.alloc(32, 1)) ? "7" : recoveryNonce,
            permission: "FullAccess",
          },
        },
      ],
    };
  }
  override async rpc() {
    if (rpcResult !== undefined) return rpcResult;
    throw new Error("synthetic RPC outage");
  }
}
const reader = new FixtureReader();
const chainConfig = { manifest, submissionEnabled: true, reader };
const app = buildApi(async () => {}, {
  pool,
  chain: chainConfig,
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
  guardian = null;
  duringDeployment = undefined;
  rpcResult = undefined;
  recoveryHeadHeight = undefined;
  recoveryNonce = "7";
  recoveryCredit = null;
  recoveryRpcError = "outage";
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
async function unknownStorageDeposit() {
  const prepared = await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" });
  expect(prepared.statusCode).toBe(201);
  const id = prepared.json().id as string;
  expect((await post(`/api/chain/intents/${id}/begin`, {})).statusCode).toBe(
    200,
  );
  expect(
    (
      await post(`/api/chain/intents/${id}/report`, {
        outcome: "UNKNOWN",
        hash: null,
      })
    ).statusCode,
  ).toBe(200);
  return { id, operation: prepared.json().operation };
}
async function recoveryChallenge(id: string) {
  return post(`/api/chain/intents/${id}/recovery/challenge`, {});
}
async function recoveryEligibility(id: string) {
  return app.inject({
    method: "GET",
    url: `/api/chain/intents/${id}/recovery/eligibility`,
    headers,
  });
}
async function completeRecovery(
  id: string,
  challenge: {
    challengeId: string;
    replacementIntentId: string;
    message: string;
    nonce: string;
    recipient: string;
  },
) {
  return post(`/api/chain/intents/${id}/recovery/complete`, {
    action: "AUTHORIZE_CONTROLLED_REPLACEMENT",
    replacementIntentId: challenge.replacementIntentId,
    challengeId: challenge.challengeId,
    network: "testnet",
    accountId: "alice.testnet",
    publicKey,
    signature: signature(challenge),
  });
}
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
it("blocks financial intent preparation for an unsafe historical verifier policy", async () => {
  const unsafe = mandatePolicy.parse({
    ...terms(),
    schemaVersion: 1,
    policyVersion: 1,
    mandateId: randomUUID(),
    organizationId: org,
    ownerAccount: "alice.testnet",
    network: "testnet",
    agentAccount: "agent.testnet",
    verifierPolicy: {
      ...terms().verifierPolicy,
      accounts: ["alice.testnet"],
    },
  });
  const bytes = canonicalPolicy(unsafe);
  const digest = createHash("sha256").update(bytes).digest("hex");
  await pool.query(
    "INSERT INTO mandate_policies(id,org_id,network,owner_account,agent_id,agent_account,canonical_policy,policy_digest,expires_at_ns) VALUES($1,$2,'testnet',$3,$4,$5,$6,$7,$8)",
    [
      unsafe.mandateId,
      org,
      unsafe.ownerAccount,
      unsafe.agentId,
      unsafe.agentAccount,
      bytes,
      digest,
      unsafe.expiresAtNs,
    ],
  );
  await pool.query(
    "INSERT INTO mandate_consents(mandate_id,status) VALUES($1,'CONSENT_APPROVED_OFFCHAIN')",
    [unsafe.mandateId],
  );
  let deploymentReads = 0;
  duringDeployment = async () => {
    deploymentReads++;
  };
  const operations = [
    { kind: "REGISTER", storageLimit: "100" },
    { kind: "STORAGE_DEPOSIT", amount: "1" },
    { kind: "FUND", amount: "1" },
    { kind: "WITHDRAW", amount: "1" },
    { kind: "WITHDRAW_STORAGE", amount: "1" },
    { kind: "PAUSE" },
    { kind: "RESUME" },
    { kind: "REVOKE" },
    { kind: "PROPOSE", proposalId: randomUUID() },
    { kind: "ATTEST", reviewId: randomUUID() },
    { kind: "EXECUTE", proposalId: randomUUID() },
  ];
  for (const operation of operations) {
    const response = await post(`${path(unsafe.mandateId)}/chain/intents`, {
      idempotencyKey: randomUUID(),
      operation,
    });
    expect(response.statusCode, operation.kind).toBe(409);
    expect(response.json().error, operation.kind).toBe(
      "UNSAFE_VERIFIER_POLICY",
    );
  }
  expect(deploymentReads).toBe(0);
  expect((await pool.query("SELECT * FROM chain_intents")).rowCount).toBe(0);
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
    (
      await post(`/api/chain/intents/${id}/report`, {
        outcome: "UNKNOWN",
        hash: null,
      })
    ).json().state,
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
it.each([
  ["CANCELED", "WALLET_CANCELED"],
  ["SUBMISSION_FAILED", "WALLET_SUBMISSION_FAILED"],
] as const)(
  "persists %s distinctly while preserving UNKNOWN quarantine",
  async (outcome, reason) => {
    const r = await prepare();
    const id = r.json().id;
    await post(`/api/chain/intents/${id}/begin`, {});
    const report = await post(`/api/chain/intents/${id}/report`, {
      outcome,
      hash: null,
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().state).toBe("UNKNOWN");
    expect(
      (
        await pool.query(
          "SELECT state,reason,reported_hash FROM chain_intents WHERE id=$1",
          [id],
        )
      ).rows[0],
    ).toMatchObject({ state: "UNKNOWN", reason, reported_hash: null });
    const detail = await app.inject({
      url: `${path(mandateId)}/chain`,
      headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().intents[0].wallet_outcome).toBe(reason);
    expect((await prepare()).statusCode).toBe(409);
  },
);
it("inspects an open recovery window without creating authorization state", async () => {
  const original = await unknownStorageDeposit();
  recoveryHeadHeight = 89_100;
  const result = await recoveryEligibility(original.id);
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({
    intentId: original.id,
    status: "WAITING_VALIDITY",
    thresholdBlocks: 90_000,
    anchorHeight: "100",
    currentHeight: "89100",
    elapsedBlocks: "89000",
    remainingBlocks: "1000",
    evidence: null,
  });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS challenges FROM chain_recovery_challenges",
      )
    ).rows[0].challenges,
  ).toBe(0);
  expect(
    (
      await pool.query(
        "SELECT replacement_authorized_at FROM chain_intents WHERE id=$1",
        [original.id],
      )
    ).rows[0].replacement_authorized_at,
  ).toBeNull();
});

it("returns eligible verified evidence without issuing a challenge", async () => {
  const original = await unknownStorageDeposit();
  recoveryHeadHeight = 90_100;
  const result = await recoveryEligibility(original.id);
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({
    intentId: original.id,
    status: "ELIGIBLE",
    thresholdBlocks: 90_000,
    currentHeight: "90100",
    elapsedBlocks: "90000",
    remainingBlocks: "0",
    evidence: {
      anchorHeight: "100",
      evidenceHeight: "90100",
      storageCreditAtAnchor: null,
      storageCreditAtEvidence: null,
      validityBlocks: 90_000,
    },
  });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS challenges FROM chain_recovery_challenges",
      )
    ).rows[0].challenges,
  ).toBe(0);
});

it.each([
  ["signer", { nonce: "8" }, "SIGNER_STATE_CHANGED"],
  ["storage", { credit: "1" }, "STORAGE_CREDIT_CHANGED"],
] as const)(
  "returns a readable %s mismatch without creating recovery authority",
  async (_name, change, expected) => {
    const original = await unknownStorageDeposit();
    recoveryHeadHeight = 90_100;
    if ("nonce" in change) recoveryNonce = change.nonce;
    if ("credit" in change) recoveryCredit = change.credit;
    const result = await recoveryEligibility(original.id);
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      intentId: original.id,
      status: expected,
      remainingBlocks: "0",
      evidence: null,
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS challenges FROM chain_recovery_challenges",
        )
      ).rows[0].challenges,
    ).toBe(0);
  },
);

it.each([
  ["RPC timeout", "RPC_TIMEOUT", "RPC_TIMEOUT"],
  ["unavailable evidence", "outage", "RECOVERY_EVIDENCE_UNAVAILABLE"],
] as const)(
  "keeps inspection read-only during %s",
  async (_name, failure, expected) => {
    const original = await unknownStorageDeposit();
    rpcDown = true;
    recoveryRpcError = failure;
    const result = await recoveryEligibility(original.id);
    expect(result.statusCode).toBe(503);
    expect(result.json().error).toBe(expected);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS challenges FROM chain_recovery_challenges",
        )
      ).rows[0].challenges,
    ).toBe(0);
  },
);
it("prepares one exact replacement while preserving the historical UNKNOWN intent", async () => {
  const original = await unknownStorageDeposit();
  recoveryHeadHeight = 90_100;
  const challenge = await recoveryChallenge(original.id);
  expect(challenge.statusCode).toBe(200);
  expect(challenge.json().message).toContain(
    "Original outcome remains UNKNOWN",
  );
  expect(challenge.json().message).toContain(
    "No transaction is signed or sent by this message",
  );

  const completed = await completeRecovery(original.id, challenge.json());
  expect(completed.statusCode).toBe(201);
  expect(completed.json()).toMatchObject({
    id: challenge.json().replacementIntentId,
    operation: original.operation,
    state: "PREPARED",
    recoveryOf: original.id,
  });
  const rows = await pool.query(
    "SELECT id,state,reason,replacement_authorized_at,canonical_operation FROM chain_intents ORDER BY created_at",
  );
  expect(rows.rows).toHaveLength(2);
  expect(rows.rows[0]).toMatchObject({
    id: original.id,
    state: "UNKNOWN",
    reason: "WALLET_OUTCOME_UNKNOWN",
  });
  expect(rows.rows[0].replacement_authorized_at).not.toBeNull();
  expect(rows.rows[1]).toMatchObject({
    id: challenge.json().replacementIntentId,
    state: "PREPARED",
    reason: "UNSIGNED",
    canonical_operation: JSON.stringify(original.operation),
  });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM chain_events WHERE intent_id=$1",
        [original.id],
      )
    ).rows[0].n,
  ).toBe(4);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM chain_recoveries"))
      .rows[0].n,
  ).toBe(1);
  expect(
    (await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" })).statusCode,
  ).toBe(409);
  expect(
    (await completeRecovery(original.id, challenge.json())).statusCode,
  ).toBe(409);
  expect(
    (
      await post(
        `/api/chain/intents/${challenge.json().replacementIntentId}/begin`,
        {},
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await pool.query("SELECT state FROM chain_intents WHERE id=$1", [
        original.id,
      ])
    ).rows[0].state,
  ).toBe("UNKNOWN");
});

it.each([
  ["validity window", { height: 90_099 }, "RECOVERY_VALIDITY_WINDOW_OPEN"],
  [
    "signer nonce",
    { height: 90_100, nonce: "8" },
    "RECOVERY_SIGNER_NONCE_CHANGED",
  ],
  [
    "storage credit",
    { height: 90_100, credit: "1" },
    "RECOVERY_STORAGE_CREDIT_CHANGED",
  ],
] as const)(
  "keeps UNKNOWN quarantined when recovery %s evidence is insufficient",
  async (_name, evidence, code) => {
    const original = await unknownStorageDeposit();
    recoveryHeadHeight = evidence.height;
    if ("nonce" in evidence) recoveryNonce = evidence.nonce;
    if ("credit" in evidence) recoveryCredit = evidence.credit;
    const result = await recoveryChallenge(original.id);
    expect(result.statusCode).toBe(409);
    expect(result.json().error).toBe(code);
    expect(
      (
        await pool.query(
          "SELECT state,replacement_authorized_at FROM chain_intents WHERE id=$1",
          [original.id],
        )
      ).rows[0],
    ).toMatchObject({ state: "UNKNOWN", replacement_authorized_at: null });
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM chain_recoveries"))
        .rows[0].n,
    ).toBe(0);
  },
);

it("blocks a prepared replacement if the original independently advances", async () => {
  const original = await unknownStorageDeposit();
  recoveryHeadHeight = 90_100;
  const challenge = await recoveryChallenge(original.id);
  const completed = await completeRecovery(original.id, challenge.json());
  expect(completed.statusCode).toBe(201);
  await pool.query(
    "UPDATE chain_intents SET state='SUBMITTED',reason='WAITING_FINALITY' WHERE id=$1",
    [original.id],
  );
  const begin = await post(
    `/api/chain/intents/${challenge.json().replacementIntentId}/begin`,
    {},
  );
  expect(begin.statusCode).toBe(409);
  expect(begin.json().error).toBe("RECOVERY_NOT_ELIGIBLE");
  expect(
    (
      await pool.query("SELECT state FROM chain_intents WHERE id=$1", [
        challenge.json().replacementIntentId,
      ])
    ).rows[0].state,
  ).toBe("PREPARED");
});

it("rejects forged recovery markers and concurrent challenge issuance", async () => {
  const original = await unknownStorageDeposit();
  await expect(
    pool.query(
      "UPDATE chain_intents SET replacement_authorized_at=clock_timestamp() WHERE id=$1",
      [original.id],
    ),
  ).rejects.toThrow("recovery evidence required");
  recoveryHeadHeight = 90_100;
  const results = await Promise.all([
    recoveryChallenge(original.id),
    recoveryChallenge(original.id),
  ]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM chain_recovery_challenges WHERE original_intent_id=$1",
        [original.id],
      )
    ).rows[0].n,
  ).toBe(1);
});
it("rejects inconsistent wallet outcome and hash reports", async () => {
  const r = await prepare();
  const id = r.json().id;
  await post(`/api/chain/intents/${id}/begin`, {});
  expect(
    (
      await post(`/api/chain/intents/${id}/report`, {
        outcome: "BROADCAST",
        hash: null,
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await post(`/api/chain/intents/${id}/report`, {
        outcome: "CANCELED",
        hash: bs58.encode(Buffer.alloc(32, 5)),
      })
    ).statusCode,
  ).toBe(400);
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
it("verifies deployment read-only while disabled and rejects all preparation", async () => {
  chainConfig.submissionEnabled = false;
  try {
    const status = await app.inject({ url: "/api/chain/status", headers });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      status: "VERIFIED",
      deploymentConfigured: true,
      deploymentVerified: true,
      submissionEnabled: false,
      account: manifest.account,
    });
    expect(JSON.stringify(status.json())).not.toContain(manifest.authorization);
    expect(JSON.stringify(status.json())).not.toContain(
      manifest.keyFingerprints[0],
    );
    expect((await prepare()).statusCode).toBe(503);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM chain_intents")).rows[0]
        .n,
    ).toBe(0);
  } finally {
    chainConfig.submissionEnabled = true;
  }
});
it("cannot advance a prepared intent after financial submission is disabled", async () => {
  const prepared = await prepare();
  expect(prepared.statusCode).toBe(201);
  const id = prepared.json().id as string;
  chainConfig.submissionEnabled = false;
  try {
    const begin = await post(`/api/chain/intents/${id}/begin`, {});
    expect(begin.statusCode).toBe(503);
    expect(begin.json()).toMatchObject({
      error: "DEPLOYMENT_NOT_AUTHORIZED",
    });
    expect(
      (
        await pool.query(
          "SELECT state,reason,reported_hash,verified_hash FROM chain_intents WHERE id=$1",
          [id],
        )
      ).rows[0],
    ).toMatchObject({
      state: "PREPARED",
      reason: "UNSIGNED",
      reported_hash: null,
      verified_hash: null,
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM chain_events WHERE intent_id=$1 AND state='AWAITING_WALLET'",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    chainConfig.submissionEnabled = true;
  }
});
it("untrusted wallet hash is not an explorer link or success", async () => {
  const r = await prepare();
  await post(`/api/chain/intents/${r.json().id}/begin`, {});
  await post(`/api/chain/intents/${r.json().id}/report`, {
    outcome: "BROADCAST",
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
      outcome: "BROADCAST",
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
    outcome: "BROADCAST",
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
    outcome: "BROADCAST",
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

it("only the finalized guardian with active organization access can prepare pause; never resume or revoke", async () => {
  guardian = "guardian.testnet";
  const g = await login("guardian.testnet");
  await pool.query(
    "INSERT INTO memberships(org_id,network,account_id,role) VALUES($1,'testnet','guardian.testnet','viewer')",
    [org],
  );
  const route = `${path(mandateId)}/chain/intents`;
  for (const kind of ["RESUME", "REVOKE", "WITHDRAW_STORAGE"]) {
    const operation =
      kind === "WITHDRAW_STORAGE" ? { kind, amount: "1" } : { kind };
    expect(
      (await post(route, { idempotencyKey: randomUUID(), operation }, g))
        .statusCode,
    ).toBe(403);
  }
  const r = await post(
    route,
    { idempotencyKey: randomUUID(), operation: { kind: "PAUSE" } },
    g,
  );
  expect(r.statusCode).toBe(201);
  expect(r.json().operation.signerId).toBe("guardian.testnet");
  guardian = "different.testnet";
  expect(
    (await post(`/api/chain/intents/${r.json().id}/begin`, {}, g)).statusCode,
  ).toBe(403);
});
it("unassigned members and unavailable deployment cannot prepare a guardian pause", async () => {
  const g = await login("guardian.testnet");
  await pool.query(
    "INSERT INTO memberships(org_id,network,account_id,role) VALUES($1,'testnet','guardian.testnet','viewer')",
    [org],
  );
  const body = { idempotencyKey: randomUUID(), operation: { kind: "PAUSE" } };
  expect(
    (await post(`${path(mandateId)}/chain/intents`, body, g)).statusCode,
  ).toBe(403);
  guardian = "guardian.testnet";
  rpcDown = true;
  expect(
    (await post(`${path(mandateId)}/chain/intents`, body, g)).statusCode,
  ).toBe(503);
});

it("warns on aged attempted outcomes but never releases unresolved locks", async () => {
  const r = await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" }),
    id = r.json().id;
  await post(`/api/chain/intents/${id}/begin`, {});
  await pool.query(
    "INSERT INTO chain_events(intent_id,state,reason,occurred_at) VALUES($1,'AWAITING_WALLET','WALLET_PROMPT_OPENING',clock_timestamp()-interval '11 minutes')",
    [id],
  );
  await sampleLocalHealth(pool);
  await monitorOnce(pool);
  expect(
    (
      await pool.query(
        "SELECT * FROM security_alerts WHERE rule='SETTLEMENT_DELAY' AND mandate_id=$1",
        [mandateId],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    (await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" })).statusCode,
  ).toBe(409);
});
it("keeps reconciliation operating when monitoring projection fails", async () => {
  const r = await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" }),
    id = r.json().id;
  await post(`/api/chain/intents/${id}/begin`, {});
  await post(`/api/chain/intents/${id}/report`, {
    outcome: "BROADCAST",
    hash: bs58.encode(Buffer.alloc(32, 5)),
  });
  await pool.query(
    "ALTER TABLE security_events RENAME TO unavailable_security_events",
  );
  try {
    await expect(monitorOnce(pool)).rejects.toThrow();
    rpcResult = finalizedFixture(r.json().operation);
    await runOnce(pool, reader);
    expect(
      (await pool.query("SELECT state FROM chain_intents WHERE id=$1", [id]))
        .rows[0].state,
    ).toBe("CONFIRMED_SUCCESS");
  } finally {
    await pool.query(
      "ALTER TABLE unavailable_security_events RENAME TO security_events",
    );
  }
  await monitorOnce(pool);
});
it("projects receipt mismatch as unverified evidence without financial success", async () => {
  const r = await prepare({ kind: "STORAGE_DEPOSIT", amount: "1" }),
    id = r.json().id;
  await post(`/api/chain/intents/${id}/begin`, {});
  await post(`/api/chain/intents/${id}/report`, {
    outcome: "BROADCAST",
    hash: bs58.encode(Buffer.alloc(32, 5)),
  });
  const raw = finalizedFixture(r.json().operation);
  raw.transaction.receiver_id = "other.testnet";
  rpcResult = raw;
  await runOnce(pool, reader);
  await monitorOnce(pool);
  expect(
    (
      await pool.query(
        "SELECT classification FROM security_alerts WHERE rule='CHAIN_INCONSISTENCY' AND mandate_id=$1",
        [mandateId],
      )
    ).rows[0].classification,
  ).toBe("UNVERIFIED_OBSERVATION");
  expect(
    (await pool.query("SELECT state FROM chain_intents WHERE id=$1", [id]))
      .rows[0].state,
  ).toBe("UNKNOWN");
});

it("guardian RPC never holds authorization locks and membership is rechecked afterward", async () => {
  guardian = "guardian.testnet";
  const g = await login("guardian.testnet");
  await pool.query(
    "INSERT INTO memberships(org_id,network,account_id,role) VALUES($1,'testnet','guardian.testnet','viewer')",
    [org],
  );
  duringDeployment = async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout='200ms'");
      await c.query(
        "UPDATE memberships SET status='disabled' WHERE org_id=$1 AND account_id='guardian.testnet'",
        [org],
      );
      await c.query("COMMIT");
    } finally {
      c.release();
    }
  };
  expect(
    (
      await post(
        `${path(mandateId)}/chain/intents`,
        { idempotencyKey: randomUUID(), operation: { kind: "PAUSE" } },
        g,
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM chain_intents")).rows[0]
      .n,
  ).toBe(0);
});
