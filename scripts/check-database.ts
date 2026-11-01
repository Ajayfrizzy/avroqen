import assert from "node:assert/strict";
import pg from "pg";
import { readApiConfig } from "../packages/domain/src/index.js";

const config = readApiConfig(process.env);
const pool = new pg.Pool({
  ...config.database,
  connectionTimeoutMillis: 2000,
  query_timeout: 2000,
});
try {
  const result = await pool.query("SELECT 1 AS healthy");
  assert.equal(result.rows[0].healthy, 1);
  console.info("PostgreSQL connectivity check passed");
} catch {
  console.error("PostgreSQL connectivity check failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
