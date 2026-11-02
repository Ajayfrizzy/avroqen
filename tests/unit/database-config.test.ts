import { expect, it } from "vitest";
import { databaseConfig } from "../../apps/api/src/db/config.js";

const env = {
  PGHOST: "database",
  PGUSER: "fixture",
  PGPASSWORD: "fixture-not-a-credential",
  PGDATABASE: "fixture",
};
it("uses explicit local no-TLS configuration only when selected", () => {
  expect(databaseConfig(env).ssl).toBe(false);
});
it("requires certificate verification for managed PostgreSQL", () => {
  expect(databaseConfig({ ...env, PGSSLMODE: "verify-full" }).ssl).toEqual({
    rejectUnauthorized: true,
  });
});
it.each(["require", "prefer", "verify-ca"])(
  "rejects incomplete database TLS mode %s",
  (PGSSLMODE) => {
    expect(() => databaseConfig({ ...env, PGSSLMODE })).toThrow();
  },
);
