import { describe, expect, it } from "vitest";
import {
  atomicAmount,
  readApiConfig,
} from "../../packages/domain/src/index.js";

describe("atomic units", () => {
  it("accepts canonical integers through u128 maximum without precision loss", () => {
    for (const value of [
      "0",
      "9007199254740993",
      "340282366920938463463374607431768211455",
    ]) {
      expect(atomicAmount.parse(value)).toBe(value);
    }
  });
  it.each([
    "-1",
    "1.0",
    "1e3",
    "01",
    "",
    " 1",
    "340282366920938463463374607431768211456",
    1,
    null,
  ])("rejects %s", (value) => {
    expect(atomicAmount.safeParse(value).success).toBe(false);
  });
});

describe("configuration", () => {
  it("selects only service configuration from the environment", () => {
    const config = readApiConfig({
      PGHOST: "localhost",
      PGUSER: "dev",
      PGDATABASE: "dev",
      PGPASSWORD: "test-only",
      OWNER_PRIVATE_KEY: "must-not-propagate",
    });
    expect(config).not.toHaveProperty("OWNER_PRIVATE_KEY");
    expect(config.host).toBe("127.0.0.1");
  });
  it("fails closed without echoing credentials", () => {
    expect(() => readApiConfig({ PGPASSWORD: "do-not-log" })).toThrow(
      "Invalid API configuration",
    );
    try {
      readApiConfig({ PGPASSWORD: "do-not-log" });
    } catch (error) {
      expect(String(error)).not.toContain("do-not-log");
    }
  });
});

it("rejects the shipped password placeholder", () => {
  expect(() =>
    readApiConfig({
      PGHOST: "localhost",
      PGUSER: "dev",
      PGDATABASE: "dev",
      PGPASSWORD: "REPLACE_WITH_LOCAL_ONLY_PASSWORD",
    }),
  ).toThrow("Invalid API configuration");
});
