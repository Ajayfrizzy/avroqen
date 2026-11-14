import { readApiConfig } from "@avroqen/domain";
import pg from "pg";
import {
  financialSubmissionEnabled,
  NearReader,
  readOnlyDeploymentConfig,
} from "../../../services/chain/rpc.js";
import { buildApi } from "./app.js";
import { databaseConfig } from "./db/config.js";
import { migrateAtStartup } from "./db/startup.js";
import { identityConfig } from "./identity/config.js";
import { fullAccessVerifier } from "./identity/crypto.js";

async function main() {
  const config = readApiConfig(process.env);
  await migrateAtStartup(process.env);
  const pool = new pg.Pool({
    ...databaseConfig(process.env),
    max: 4,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    idleTimeoutMillis: 10000,
  });
  pool.on("error", () => {
    console.error("Database connection unavailable");
  });
  const auth = identityConfig(process.env);
  const manifest = readOnlyDeploymentConfig(process.env);
  const submissionEnabled = financialSubmissionEnabled(process.env);
  if (submissionEnabled && !manifest)
    throw new Error("DEPLOYMENT_MANIFEST_REQUIRED");
  const app = buildApi(
    async () => {
      await pool.query("SELECT 1 FROM auth_sessions LIMIT 0");
    },
    {
      pool,
      config: auth,
      verifyKey: fullAccessVerifier(auth.network),
      chain: {
        manifest,
        submissionEnabled,
        reader: new NearReader(),
      },
    },
  );
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
