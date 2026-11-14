import pg from "pg";
import { databaseConfig } from "./config.js";
import { migrate } from "./migrate.js";

export async function migrateAtStartup(
  env: NodeJS.ProcessEnv,
  suppliedPool?: pg.Pool,
) {
  const pool =
    suppliedPool ??
    new pg.Pool({
      ...databaseConfig(env),
      max: 1,
      connectionTimeoutMillis: 5000,
    });
  try {
    await migrate(pool);
  } finally {
    if (!suppliedPool) await pool.end();
  }
}
