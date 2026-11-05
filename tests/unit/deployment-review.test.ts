import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  candidate,
  inspect,
  validateCandidate,
} from "../../packages/domain/src/deployment-preview.js";

const wasm = readFileSync("docs/evidence/mandate-vault-approved.wasm");
const observation: unknown = JSON.parse(
  readFileSync(
    "docs/evidence/TESTNET_DEPLOYMENT_PREFLIGHT_ACCOUNT.json",
    "utf8",
  ),
);
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
  expect(result.minimumBackingAtomic).toBe("4002680000000000000000000");
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
  ["additional key", "keys.1", {}],
  ["missing key", "keys", []],
  ["substituted key", "keys.0.publicKey", "ed25519:other"],
  ["restricted key", "keys.0.permission", { FunctionCall: {} }],
  ["network", "network", "mainnet"],
  ["account", "accountId", "other.testnet"],
  ["existing code", "account.code_hash", "unexpected"],
  ["staking", "account.locked", "1"],
  ["balance", "account.amount", "4002679999999999999999999"],
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
