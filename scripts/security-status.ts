import pg from "pg";
import { databaseConfig } from "../apps/api/src/db/config.js";

const pool = new pg.Pool({
  ...databaseConfig(process.env),
  connectionTimeoutMillis: 2000,
  query_timeout: 5000,
});
try {
  const health = await pool.query(
    "SELECT worker,last_success,last_success>clock_timestamp()-interval '1 minute' AS healthy FROM security_worker_health ORDER BY worker",
  );
  const alerts = await pool.query(
    "SELECT rule,severity,classification,count(*)::int AS open_incidents FROM security_alerts WHERE org_id IS NULL AND state NOT IN ('RESOLVED','DISMISSED') GROUP BY rule,severity,classification ORDER BY severity,rule",
  );
  console.info(
    JSON.stringify(
      {
        scope:
          "Unscoped operational indicators only; no tenant records or credentials",
        health: health.rows,
        alerts: alerts.rows,
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "Security status unavailable; check database and worker readiness.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
