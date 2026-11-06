import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  candidate,
  inspect as liveInspect,
  PRIMARY_KEY,
  PUBLIC_KEY,
  validateCandidate,
  validateKeyPhase,
} from "../../packages/domain/src/deployment-preview.js";

const wasm = readFileSync("docs/evidence/mandate-vault-approved.wasm");
const observation: unknown = JSON.parse(
  readFileSync("docs/evidence/DEPLOYMENT_KEY_GATE_ACCOUNT.json", "utf8"),
);
const inspect = (tx: unknown, o: unknown) => liveInspect(tx, o, "HISTORICAL");
// Deliberately mutate untrusted objects without pretending they meet the schema.
function change(value: unknown, path: string, replacement: unknown) {
  const fields = path.split(".");
  const last = fields.pop();
  let current = value;
  for (const field of fields)
    current = (current as Record<string, unknown>)[field];
  if (last === undefined) throw new Error("empty path");
  (current as Record<string, unknown>)[last] = replacement;
}
it("inspects the exact approved batch without a nonce, signature or authorization", () => {
  const result = inspect(candidate(wasm), observation);
  expect(result.actions.map((a) => a.type)).toEqual([
    "DeployContract",
    "FunctionCall",
  ]);
  expect(result.minimumBackingAtomic).toBe("4003500000000000000000000");
  expect(result.authorization).toBe("NONE_PREVIEW_ONLY");
});
it.each([
  ["action order", "actions", candidate(wasm).actions.reverse()],
  [
    "extra action",
    "actions",
    [
      ...candidate(wasm).actions,
      { type: "Transfer", params: { deposit: "1" } },
    ],
  ],
  ["deposit", "actions.1.params.deposit", "1"],
  ["receiver", "receiverId", "other.testnet"],
  ["signer", "signerId", "other.testnet"],
  ["Primary signer", "publicKey", PRIMARY_KEY],
  ["unknown signer", "publicKey", "ed25519:other"],
  ["revocation phase cannot deploy", "phase", "POST_REVOCATION"],
  ["network", "network", "mainnet"],
  ["method", "actions.1.params.methodName", "init"],
  ["gas", "actions.1.params.gas", "300000000000000"],
  ["malformed init", "actions.1.params.args", "{}"],
  [
    "extra init field",
    "actions.1.params.args",
    '{"network":"testnet","owner":"other.testnet"}',
  ],
  ["extra top-level field", "callbackUrl", "https://example.com"],
  ["substituted Wasm", "actions.0.params.code", new Uint8Array(wasm.length)],
  ["truncated Wasm", "actions.0.params.code", wasm.subarray(1)],
] satisfies Array<[string, string, unknown]>)(
  "rejects %s",
  (_name, path, value) => {
    const tx = candidate(wasm);
    change(tx, path, value);
    expect(() => validateCandidate(tx)).toThrow();
  },
);
it.each([
  ["additional key", "keys.2", {}],
  ["missing key", "keys", []],
  ["substituted key", "keys.0.publicKey", "ed25519:other"],
  ["restricted key", "keys.0.permission", { FunctionCall: {} }],
  ["network", "network", "mainnet"],
  ["account", "accountId", "other.testnet"],
  ["existing code", "account.code_hash", "unexpected"],
  ["staking", "account.locked", "1"],
  ["balance", "account.amount", "4003499999999999999999999"],
  ["negative balance", "account.amount", "-1"],
  ["overflow balance", "account.amount", (1n << 128n).toString()],
  ["unfinalized", "finality", "optimistic"],
  ["unbound block", "account.block_hash", "other"],
  ["changed gas price", "gasPrice", "100000001"],
  ["changed protocol", "protocolVersion", 89],
  ["changed storage price", "storageAmountPerByte", "10000000000000000001"],
] satisfies Array<[string, string, unknown]>)(
  "fails closed on %s observation",
  (_name, path, value) => {
    const o = structuredClone(observation);
    change(o, path, value);
    expect(() => inspect(candidate(wasm), o)).toThrow();
  },
);

function fresh() {
  const o = JSON.parse(JSON.stringify(observation));
  o.observedAtUtc = new Date().toISOString();
  o.block.timestampNanosec = (BigInt(Date.now()) * 1000000n).toString();
  return o;
}
it("accepts exactly two deployment keys in either order, never enables financial operations", () => {
  const o = fresh();
  for (const keys of [o.keys, [...o.keys].reverse()]) {
    const result = liveInspect(candidate(wasm), { ...o, keys });
    expect(result.publicKey).toBe(PUBLIC_KEY);
    expect(result.phase).toBe("DEPLOYMENT");
    expect(result.financialOperationsEnabled).toBe(false);
  }
});
it("post-revocation accepts only Primary and does not permit another deployment", () => {
  const o = fresh();
  o.keys = [{ publicKey: PRIMARY_KEY, permission: "FullAccess" }];
  expect(validateKeyPhase(o, "POST_REVOCATION")).toBeDefined();
  expect(() => liveInspect(candidate(wasm), o)).toThrow("KEY_PHASE_MISMATCH");
  expect(() => validateKeyPhase(fresh(), "POST_REVOCATION")).toThrow();
});
for (const phase of ["DEPLOYMENT", "POST_REVOCATION"] as const) {
  it.each([
    "missing",
    "duplicate",
    "third",
    "restricted",
    "wrong-account",
    "wrong-network",
    "stale-block",
    "future-block",
    "stale-observed",
    "block-mismatch",
    "testing-only",
  ])(`${phase} rejects %s`, (fault) => {
    const o = fresh();
    if (phase === "POST_REVOCATION")
      o.keys = [{ publicKey: PRIMARY_KEY, permission: "FullAccess" }];
    if (fault === "missing") o.keys = [];
    if (fault === "duplicate") o.keys = [o.keys[0], o.keys[0]];
    if (fault === "third")
      o.keys.push({ publicKey: "ed25519:unknown", permission: "FullAccess" });
    if (fault === "restricted") o.keys[0].permission = { FunctionCall: {} };
    if (fault === "wrong-account") o.accountId = "other.testnet";
    if (fault === "wrong-network") o.network = "mainnet";
    if (fault === "stale-block")
      o.block.timestampNanosec = (
        (BigInt(Date.now()) - 120001n) *
        1000000n
      ).toString();
    if (fault === "future-block")
      o.block.timestampNanosec = (
        (BigInt(Date.now()) + 60000n) *
        1000000n
      ).toString();
    if (fault === "stale-observed")
      o.observedAtUtc = new Date(Date.now() - 120001).toISOString();
    if (fault === "block-mismatch") o.account.block_hash = "other";
    if (fault === "testing-only")
      o.keys = [{ publicKey: PUBLIC_KEY, permission: "FullAccess" }];
    expect(() => validateKeyPhase(o, phase)).toThrow();
  });
}
it("historical preview never passes as live readiness", () => {
  const o = fresh();
  o.observedAtUtc = new Date(Date.now() - 3600000).toISOString();
  o.block.timestampNanosec = (
    (BigInt(Date.now()) - 3600000n) *
    1000000n
  ).toString();
  expect(liveInspect(candidate(wasm), o, "HISTORICAL").observationMode).toBe(
    "HISTORICAL",
  );
  expect(() => liveInspect(candidate(wasm), o)).toThrow("STALE_OBSERVATION");
});

it("accepts the exact backing threshold and rejects one yoctoNEAR less", () => {
  const o = fresh();
  o.account.amount = "4003500000000000000000000";
  expect(liveInspect(candidate(wasm), o).headroomAfterMarginAtomic).toBe("0");
  o.account.amount = "4003499999999999999999999";
  expect(() => liveInspect(candidate(wasm), o)).toThrow("INSUFFICIENT_BACKING");
});
it("rejects restricted permission on either deployment key", () => {
  for (const index of [0, 1]) {
    const o = fresh();
    o.keys[index].permission = { FunctionCall: {} };
    expect(() => validateKeyPhase(o, "DEPLOYMENT")).toThrow();
  }
});
