import { readApiConfig } from "@avroqen/domain";
import pg from "pg";
import { buildApi } from "./app.js";

async function main() {
  const config = readApiConfig(process.env);
  const pool = new pg.Pool({
    ...config.database,
    max: 4,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    idleTimeoutMillis: 10000,
  });
  pool.on("error", () => {
    console.error("Database connection unavailable");
  });
  const app = buildApi(async () => {
    await pool.query("SELECT 1");
  });
  app.addHook("onClose", async () => {
    await pool.end();
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app.close();
    });
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch {
    await app.close();
    throw new Error("API startup failed");
  }
}
main().catch(() => {
  console.error(
    "API startup failed; check configuration and local dependencies",
  );
  process.exitCode = 1;
});
