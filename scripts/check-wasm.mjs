import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bytes = readFileSync(
  "target/wasm32-unknown-unknown/release/mandate_vault.wasm",
);
const module = await WebAssembly.compile(bytes);
const methods = WebAssembly.Module.exports(module)
  .filter((entry) => entry.kind === "function")
  .map((entry) => entry.name);
assert.ok(methods.includes("payments_enabled"));
for (const method of methods) {
  assert.ok(
    ["payments_enabled", "contract_source_metadata"].includes(method),
    `Unexpected callable method: ${method}`,
  );
}
const imports = WebAssembly.Module.imports(module).map((entry) => entry.name);
assert.ok(
  !imports.includes("promise_batch_action_transfer"),
  "Foundation must not include a transfer host call",
);
assert.ok(
  !imports.includes("promise_batch_action_deploy_contract"),
  "Foundation must not include an upgrade host call",
);
console.info(
  "Compiled Wasm exposes only foundation views and no transfer/upgrade host calls.",
);

// Exercise the generated Wasm/JSON boundary with an explicitly simulated empty
// storage host. This is not a NEAR sandbox, transaction or settlement receipt.
let returned;
let instance;
instance = await WebAssembly.instantiate(module, {
  env: {
    storage_read: () => 0n,
    register_len: () => {
      throw new Error("Unexpected register access");
    },
    read_register: () => {
      throw new Error("Unexpected register access");
    },
    value_return: (length, pointer) => {
      returned = new TextDecoder().decode(
        new Uint8Array(
          instance.exports.memory.buffer,
          Number(pointer),
          Number(length),
        ),
      );
    },
  },
});
instance.exports.payments_enabled();
assert.equal(JSON.parse(returned), false);
console.info(
  "Generated Wasm view returns JSON false against simulated empty storage.",
);
