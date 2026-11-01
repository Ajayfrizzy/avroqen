import assert from "node:assert/strict";

const web = await fetch("http://127.0.0.1:3000", {
  signal: AbortSignal.timeout(5000),
});
assert.equal(web.status, 200);
assert.match(await web.text(), /Payments are not enabled/);
const health = await fetch("http://127.0.0.1:3001/health", {
  signal: AbortSignal.timeout(5000),
});
assert.equal(health.status, 200);
assert.equal((await health.json()).paymentsEnabled, false);
const ready = await fetch("http://127.0.0.1:3001/ready", {
  signal: AbortSignal.timeout(5000),
});
assert.equal(ready.status, 200);
console.info(
  "Real web/API/database readiness smoke passed; no financial operations performed.",
);
