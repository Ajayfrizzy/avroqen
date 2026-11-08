// Preparation module only: no CLI, server, UI, wallet import or default network call.
import { createEngine } from "./core.js";
export const PRIMARY_POLICY = Object.freeze({
  account: "avroqen-vault.testnet",
  primary: "ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz",
  testing: "ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G",
});
export function createPrimaryVerifier(fetcher: typeof fetch, clock = Date.now) {
  return createEngine(PRIMARY_POLICY, fetcher, clock);
}

// Canonical inferred contract includes the same-instance read-only challenge lookup.
export type PrimaryVerifier = ReturnType<typeof createPrimaryVerifier>;
