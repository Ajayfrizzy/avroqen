import pg from "pg";
import { databaseConfig } from "../apps/api/src/db/config.js";
import { migrate } from "../apps/api/src/db/migrate.js";

const pool = new pg.Pool({
  ...databaseConfig(process.env),
  connectionTimeoutMillis: 2000,
});
try {
  await migrate(pool);
  console.info("Database migrations applied");
} catch {
  console.error(
    "Migration failed; inspect schema and migration history without exposing credentials",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
