import assert from "node:assert/strict";

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
