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
