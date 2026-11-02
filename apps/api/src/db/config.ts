import { readFileSync } from "node:fs";
import { readApiConfig } from "../../../../packages/domain/src/index.js";
/** Managed PostgreSQL supports only full certificate verification; local Compose can disable TLS. */
export function databaseConfig(env: NodeJS.ProcessEnv) {
  const database = readApiConfig(env).database;
  const mode = env.PGSSLMODE ?? "disable";
  if (!["disable", "verify-full"].includes(mode))
    throw new Error("Database TLS must be disable locally or verify-full");
  if (mode === "disable") return { ...database, ssl: false as const };
  return {
    ...database,
    ssl: {
      rejectUnauthorized: true,
      ...(env.PGSSLROOTCERT
        ? { ca: readFileSync(env.PGSSLROOTCERT, "utf8") }
        : {}),
    },
  };
}
