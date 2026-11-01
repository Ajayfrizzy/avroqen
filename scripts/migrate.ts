import pg from "pg";
import { migrate } from "../apps/api/src/db/migrate.js";
import { readApiConfig } from "../packages/domain/src/index.js";

const pool = new pg.Pool({
  ...readApiConfig(process.env).database,
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
