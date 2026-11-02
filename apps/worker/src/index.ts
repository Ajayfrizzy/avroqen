import { createServer } from "node:http";
import pg from "pg";
import { runOnce } from "../../../services/chain/worker.js";
import {
  heartbeat,
  monitorOnce,
  observeInternal,
  sampleLocalHealth,
} from "../../../services/security/monitor.js";
import {
  monitoringManifest,
  probeDeployment,
} from "../../../services/security/probe.js";
import { databaseConfig } from "../../api/src/db/config.js";

const pool = new pg.Pool({
  ...databaseConfig(process.env),
  max: 3,
  connectionTimeoutMillis: 2000,
  query_timeout: 5000,
});
pool.on("error", () => console.error("Worker database unavailable"));
const monitoringPool = new pg.Pool({
  ...databaseConfig(process.env),
  max: 2,
  connectionTimeoutMillis: 2000,
  query_timeout: 5000,
});
monitoringPool.on("error", () =>
  console.error("Monitoring database unavailable"),
);
let lastMonitoring = 0;
let stopping = false,
  lastCycle = 0;
const enabled = true; // Read-only reconciliation continues even when new submissions are disabled.
const server = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "alive", enabled }));
    return;
  }
  if (req.url === "/ready") {
    try {
      await pool.query("SELECT 1 FROM chain_intents LIMIT 0");
      if (
        enabled &&
        (Date.now() - lastCycle > 360000 ||
          Date.now() - lastMonitoring > 360000)
      )
        throw new Error("stalled");
      res.writeHead(200);
      res.end("ready");
    } catch {
      res.writeHead(503);
      res.end("unavailable");
    }
    return;
  }
  res.writeHead(404);
  res.end();
});
server.listen(
  Number(process.env.WORKER_PORT ?? 3002),
  process.env.HOST ?? "127.0.0.1",
);
async function loop() {
  while (!stopping) {
    try {
      await runOnce(pool);
      lastCycle = Date.now();
      // A monitoring heartbeat write must not gate financial reconciliation.
      try {
        await heartbeat(pool, "reconciliation");
      } catch {}
    } catch {
      console.error(
        "Reconciliation unavailable; obligations remain unresolved",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await pool.end();
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    stopping = true;
    server.close();
  });
void loop().catch(() => {
  console.error("Worker stopped");
  process.exitCode = 1;
  server.close();
});

async function monitoringLoop() {
  let nextProbe = 0;
  while (!stopping) {
    try {
      await sampleLocalHealth(monitoringPool);
      await monitorOnce(monitoringPool);
      lastMonitoring = Date.now();
    } catch {
      console.error("Security monitoring unavailable");
    }
    if (Date.now() >= nextProbe) {
      nextProbe = Date.now() + 60000;
      try {
        await probeDeployment(monitoringPool, monitoringManifest(process.env));
      } catch {
        console.error("Deployment monitoring unavailable");
        try {
          await observeInternal(monitoringPool, {
            id: `probe-unavailable:${Math.floor(Date.now() / 300000)}`,
            subject: "deployment",
            type: "DEPLOYMENT_OBSERVATION",
            reason: "CONTRACT_UNAVAILABLE",
          });
        } catch {
          /* Database outage remains visible through readiness. */
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  await monitoringPool.end();
}
void monitoringLoop().catch(() => {
  console.error("Monitoring stopped; reconciliation continues");
});
