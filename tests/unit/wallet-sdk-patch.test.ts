import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

it("installs the pinned SDK patch removing unconditional login payload logs in both entrypoints", () => {
  const require = createRequire(
    new URL("../../apps/web/package.json", import.meta.url),
  );
  const root = dirname(require.resolve("@meteorwallet/sdk/package.json"));
  const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  expect(metadata.version).toBe("3.24.1");
  for (const entry of ["index.js", "index.cjs"]) {
    const source = readFileSync(join(root, "dist", entry), "utf8");
    // Check the installed artifact, so an unapplied patch/frozen-install regression fails CI.
    expect(
      source.includes('console.log("Ending success with data", data)'),
    ).toBe(false);
    expect(
      source.includes(
        'console.log("Starting execution for V1", newConnection)',
      ),
    ).toBe(false);
    expect(source.includes("currentConnection.resolve({")).toBe(true);
    expect(source.includes("payload: data.payload")).toBe(true);
  }
});

it("pins Meteor's wallet broadcast flow and execution outcome result contract", () => {
  const require = createRequire(
    new URL("../../apps/web/package.json", import.meta.url),
  );
  const root = dirname(require.resolve("@meteorwallet/sdk/package.json"));
  const types = readFileSync(join(root, "dist", "index.d.ts"), "utf8");
  const source = readFileSync(join(root, "dist", "index.js"), "utf8");
  expect(types).toContain(
    '"near::sign_transactions": {\n    readonly input: IMCA_Near_SignTransactions_Input;',
  );
  expect(types).toContain(
    "readonly output: _near_js_types0.FinalExecutionOutcome[];",
  );
  expect(source).toContain("actionType: EExternalActionType.sign");
  expect(source).toContain("return response.payload.executionOutcomes");
});
