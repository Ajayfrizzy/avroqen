import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const ready = await fetch("http://127.0.0.1:3001/ready", {
  signal: AbortSignal.timeout(10000),
});
assert.equal(ready.status, 503);
assert.deepEqual(await ready.json(), { status: "unavailable" });
const health = await fetch("http://127.0.0.1:3001/health", {
  signal: AbortSignal.timeout(5000),
});
assert.equal(health.status, 200);
console.info(
  "Database outage correctly returns unavailable readiness and live process.",
);

execFileSync(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "worker",
    "node",
    "-e",
    "Promise.all([fetch('http://127.0.0.1:3002/ready'),fetch('http://127.0.0.1:3002/health')]).then(([r,h])=>process.exit(r.status===503&&h.status===200?0:1)).catch(()=>process.exit(1))",
  ],
  { stdio: "inherit" },
);
console.info(
  "Worker readiness also fails during database outage while liveness remains available.",
);
