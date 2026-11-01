import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalPolicy,
  vaultAvailability,
} from "../../packages/domain/src/index";

describe("M3 integration boundary", () => {
  it("preserves the shared Rust/TypeScript canonical bytes including Unicode", () => {
    const fixture = readFileSync(
      "tests/fixtures/m3-policy.canonical.txt",
      "utf8",
    );
    expect(canonicalPolicy(JSON.parse(fixture))).toBe(fixture);
  });
  it("does not claim an onchain deployment or usable payment adapter", () => {
    expect(vaultAvailability.status).toBe("NOT_DEPLOYED");
    expect(vaultAvailability.message).toContain("unavailable");
  });
});
