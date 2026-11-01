import { nearAccount } from "@avroqen/domain";

export interface WalletProof {
  accountId: string;
  publicKey: string;
  signature: string;
}

// MeteorConnect hydrates the wallet wire response into a PublicKey object and
// Uint8Array/Buffer. Convert explicitly before JSON serialization; never send
// object-shaped keys/signatures or guess alternate cryptographic encodings.
export function normalizeWalletProof(value: unknown): WalletProof {
  try {
    if (!value || typeof value !== "object") throw new Error();
    const proof = value as Record<string, unknown>;
    const accountId = nearAccount.parse(proof.accountId);
    const key = proof.publicKey;
    if (!key || typeof key !== "object" || typeof key.toString !== "function")
      throw new Error();
    const publicKey = key.toString();
    if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(publicKey))
      throw new Error();
    if (
      !(proof.signature instanceof Uint8Array) ||
      proof.signature.length !== 64
    )
      throw new Error();
    const signature = btoa(String.fromCharCode(...proof.signature));
    return { accountId, publicKey, signature };
  } catch {
    // Never propagate SDK data, proof material or untrusted exception messages.
    throw new Error("Invalid wallet message response");
  }
}
