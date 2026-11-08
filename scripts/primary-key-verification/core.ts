// Internal testable engine. Production consumers must use verify.ts's fixed policy.
import { randomBytes, randomUUID } from "node:crypto";
import {
  messageDigest,
  verifyMessage,
} from "../../apps/api/src/identity/crypto.js";
import { freshBlock, observe, type Policy } from "./rpc.js";

export const RECIPIENT = "https://127.0.0.1:8443";
export const TEST_ID = "4c2d686b-ca7f-4fc2-98c2-aeb73e51c552";
export const LIFETIME = 300_000;
export interface Challenge {
  readonly challengeId: string;
  readonly message: string;
  readonly nonce: string;
  readonly recipient: typeof RECIPIENT;
  readonly callback_url: "";
  readonly issuedAt: string;
  readonly expiresAt: string;
}
export function render(
  policy: Policy,
  id: string,
  nonce: string,
  issued: string,
  expires: string,
) {
  return `Avroqen Primary-key control verification v1 — OFF-CHAIN TEST ONLY.
This message proves signing control only. It grants no login session, transaction, transfer, deployment, access-key change, policy authorization, mandate, attestation, or financial authority.
Account: ${policy.account}
Network: testnet
Expected signing key: ${policy.primary}
Recipient: ${RECIPIENT}
Test ID: ${TEST_ID}
Challenge ID: ${id}
Nonce (base64, 32 random bytes): ${nonce}
Issued at: ${issued}
Expires at: ${expires}
Purpose: Verify this exact Primary key has FullAccess on this Testnet account at a fresh finalized block. Do not submit this message or signature as a transaction.`;
}
export class PrimaryVerificationFailure extends Error {
  constructor(
    readonly signatureValid: boolean,
    readonly permissionValid: boolean,
  ) {
    super("PRIMARY_VERIFICATION_FAILED");
    this.name = "PrimaryVerificationFailure";
  }
}
interface Entry {
  challenge: Readonly<Challenge>;
  issued: number;
  status: "issued" | "verifying" | "closed";
}
// Single-process memory only: no disk, login/session APIs, signer, SDK or contract calls.
export function createEngine(
  policyInput: Policy,
  fetcher: typeof fetch,
  clock: () => number,
) {
  const policy = Object.freeze({ ...policyInput });
  const entries = new Map<string, Entry>();
  const nonces = new Set<string>();
  let lastTime = 0;
  function now() {
    const t = clock();
    if (!Number.isSafeInteger(t) || t < lastTime || t < 0) {
      for (const entry of entries.values()) entry.status = "closed";
      throw new Error("CLOCK_INVALID");
    }
    lastTime = t;
    return t;
  }
  function fresh(entry: Entry) {
    if (now() - entry.issued >= LIFETIME) throw new Error("CHALLENGE_EXPIRED");
  }
  return Object.freeze({
    issue(): Readonly<Challenge> {
      // Bounded state; never evict a tombstone and accidentally permit replay.
      if (entries.size >= 128) throw new Error("STATE_FULL");
      const issued = now();
      const id = randomUUID();
      const nonce = randomBytes(32).toString("base64");
      if (entries.has(id) || nonces.has(nonce))
        throw new Error("RANDOM_COLLISION");
      const issuedAt = new Date(issued).toISOString();
      const expiresAt = new Date(issued + LIFETIME).toISOString();
      const challenge = Object.freeze({
        challengeId: id,
        nonce,
        issuedAt,
        expiresAt,
        recipient: RECIPIENT,
        callback_url: "" as const,
        message: render(policy, id, nonce, issuedAt, expiresAt),
      });
      nonces.add(nonce);
      entries.set(id, { challenge, issued, status: "issued" });
      return challenge;
    },
    getChallenge(id: string): Readonly<Challenge> {
      const entry = entries.get(id);
      if (entry?.status !== "issued") throw new Error("CHALLENGE_UNAVAILABLE");
      fresh(entry);
      return entry.challenge;
    },
    cancel(id: string) {
      const entry = entries.get(id);
      if (entry) entry.status = "closed";
    },
    async verify(input: unknown) {
      // First synchronously claim the ID. No await before the one-time transition.
      const proof =
        input && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {};
      const entry =
        typeof proof.challengeId === "string"
          ? entries.get(proof.challengeId)
          : undefined;
      if (entry?.status !== "issued") throw new Error("CHALLENGE_UNAVAILABLE");
      entry.status = "verifying";
      let signatureValid = false;
      let permissionValid = false;
      try {
        fresh(entry);
        if (
          Object.keys(proof).sort().join(",") !==
            "accountId,challengeId,network,publicKey,signature" ||
          proof.accountId !== policy.account ||
          proof.network !== "testnet" ||
          proof.publicKey !== policy.primary ||
          typeof proof.signature !== "string"
        )
          throw new Error("PROOF_INVALID");
        const c = entry.challenge;
        const nonce = Buffer.from(c.nonce, "base64");
        if (
          nonce.length !== 32 ||
          nonce.toString("base64") !== c.nonce ||
          !verifyMessage(
            {
              message: c.message,
              nonce,
              recipient: c.recipient,
              callback_url: "",
            },
            policy.primary,
            proof.signature,
          )
        )
          throw new Error("SIGNATURE_INVALID");
        signatureValid = true;
        const observation = await observe(policy, fetcher, now);
        const finished = now();
        if (finished - entry.issued >= LIFETIME)
          throw new Error("CHALLENGE_EXPIRED");
        freshBlock(observation.timestampNanosec, finished);
        permissionValid = true;
        if (entry.status !== "verifying")
          throw new Error("CHALLENGE_UNAVAILABLE");
        return Object.freeze({
          status: "PRIMARY_KEY_CONTROL_VERIFIED_AT_FINALIZED_BLOCK" as const,
          accountId: policy.account,
          publicKey: policy.primary,
          network: "testnet" as const,
          challengeId: c.challengeId,
          challengeDigest: messageDigest({
            message: c.message,
            nonce,
            recipient: c.recipient,
            callback_url: "",
          }).toString("hex"),
          verifiedAt: new Date(finished).toISOString(),
          ...observation,
        });
      } catch {
        // Never propagate wallet material, RPC payloads, signatures or provider errors.
        throw new PrimaryVerificationFailure(signatureValid, permissionValid);
      } finally {
        entry.status = "closed";
      }
    },
  });
}
