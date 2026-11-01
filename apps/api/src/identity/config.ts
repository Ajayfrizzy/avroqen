import type { Network } from "./crypto.js";
export interface IdentityConfig {
  origin: string;
  network: Network;
  secure: boolean;
}
export function identityConfig(
  env: Record<string, string | undefined>,
): IdentityConfig {
  const origin = env.PUBLIC_ORIGIN ?? "http://127.0.0.1:3000";
  const url = new URL(origin);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        local &&
        env.AUTH_ALLOW_INSECURE_LOCALHOST === "true"
      ))
  )
    throw new Error("Invalid identity origin configuration");
  const network = env.NEAR_NETWORK ?? "testnet";
  if (network !== "testnet" && network !== "mainnet")
    throw new Error("Invalid identity network");
  return { origin, network, secure: url.protocol === "https:" };
}
