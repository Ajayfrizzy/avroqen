import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bytes = readFileSync(
  "target/wasm32-unknown-unknown/release/mandate_vault.wasm",
);
const module = await WebAssembly.compile(bytes);
const methods = WebAssembly.Module.exports(module)
  .filter((e) => e.kind === "function")
  .map((e) => e.name)
  .sort();
assert.deepEqual(
  methods,
  [
    "new",
    "payments_enabled",
    "contract_source_metadata",
    "storage_deposit",
    "register_mandate",
    "fund_mandate",
    "pause_mandate",
    "resume_mandate",
    "revoke_mandate",
    "submit_proposal",
    "attest_proposal",
    "authorize_and_execute",
    "on_settlement_result",
    "withdraw_available",
    "withdraw_storage_credit",
    "on_withdrawal_result",
    "get_mandate",
    "get_proposal",
    "get_execution",
    "get_withdrawal",
    "get_storage_credit",
    "get_accounting",
  ].sort(),
  "Unexpected M3 callable surface",
);
const imports = WebAssembly.Module.imports(module).map((e) => e.name);
assert.ok(
  imports.includes("promise_batch_action_transfer"),
  "Native transfer implementation missing",
);
for (const required of [
  "sha256",
  "panic_utf8",
  "promise_then",
  "promise_result",
]) {
  assert.ok(
    imports.includes(required),
    `Required NEAR host capability missing: ${required}`,
  );
}
for (const forbidden of [
  "deploy_contract",
  "delete_account",
  "add_key",
  "delete_key",
  "stake",
  "create_account",
]) {
  assert.ok(
    !imports.some(
      (name) =>
        name.startsWith("promise_batch_action_") && name.includes(forbidden),
    ),
    `Forbidden host capability: ${forbidden}`,
  );
}
console.info(
  "M3 Wasm method allowlist and forbidden administrative capabilities passed. Execution verified separately by sandbox tests.",
);
