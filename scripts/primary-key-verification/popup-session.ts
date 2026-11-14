// Internal preparation engine. All I/O is injected; there is no browser/SDK loader.
import { normalizeWalletProof } from "../../apps/web/app/workspace/wallet-proof.js";
import type { Challenge } from "./core.js";
import { createPopupGuard } from "./popup-guard.js";
import type { PrimaryVerifier } from "./verify.js";
export const WALLET_BASE = "https://wallet.meteorwallet.app";
export interface PopupHandle {
  readonly closed: boolean;
  postMessage(data: unknown, origin: string): void;
  close(): void;
}
export interface PopupEvent {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
}
export interface PopupPorts {
  now(): number;
  uid(): string;
  walletOverride(): string | null;
  open(url: string): PopupHandle | null;
  isNativeEvent(event: unknown): event is PopupEvent;
  listen(listener: (event: unknown) => void): void;
  unlisten(listener: (event: unknown) => void): void;
  interval(callback: () => void, milliseconds: number): unknown;
  clearInterval(timer: unknown): void;
}
export type ProofVerifier = Pick<
  PrimaryVerifier,
  "getChallenge" | "verify" | "cancel"
>;
export type SdkFactory = (messenger: {
  connectAndWaitForResponse(request: unknown): Promise<unknown>;
}) => (challenge: Challenge) => Promise<unknown>;
// A real browser adapter must call this predicate at the native event ingress.
// Tests use a fixture event brand; synthetic browser MessageEvents never pass here.
export function nativePopupEvent(event: unknown): event is MessageEvent {
  return (
    typeof MessageEvent !== "undefined" &&
    event instanceof MessageEvent &&
    event.type === "message" &&
    event.isTrusted
  );
}
const record = (x: unknown): Record<string, unknown> => {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("PRIMARY_POPUP_INVALID");
  return x as Record<string, unknown>;
};
export function createPopupSession(
  ports: PopupPorts,
  sdkFactory: SdkFactory,
  verifier: ProofVerifier,
  challengeInput: Challenge,
  // Explicit fixture-only review seam. The public preparation policy has NO routes.
  reviewedResponseOrigins: readonly string[],
) {
  const challenge = Object.freeze({ ...challengeInput });
  const origins = [...reviewedResponseOrigins];
  let used = false;
  let stop: (() => void) | undefined;
  return Object.freeze({
    cancel() {
      verifier.cancel(challenge.challengeId);
      stop?.();
      used = true;
    },
    async run(): Promise<unknown> {
      if (used) throw new Error("PRIMARY_POPUP_USED");
      used = true;
      let popup: PopupHandle | null = null;
      let timer: unknown;
      let listening = false;
      let listener: (event: unknown) => void = () => {};
      let closeGuard = () => {};
      let settled = false;
      let cleanupFailed = false;
      const cleanup = () => {
        closeGuard();
        if (listening) {
          listening = false;
          try {
            ports.unlisten(listener);
          } catch {
            cleanupFailed = true;
          }
        }
        if (timer !== undefined) {
          try {
            ports.clearInterval(timer);
          } catch {
            cleanupFailed = true;
          }
          timer = undefined;
        }
        if (popup) {
          try {
            popup.close();
          } catch {
            cleanupFailed = true;
          }
          popup = null;
        }
      };
      try {
        if (
          origins.length !== 1 ||
          origins[0] !== WALLET_BASE ||
          ports.walletOverride() !== null
        )
          throw new Error("PRIMARY_POPUP_REVIEW_REQUIRED");
        const stored = verifier.getChallenge(challenge.challengeId);
        const fields: readonly (keyof Challenge)[] = [
          "challengeId",
          "message",
          "nonce",
          "recipient",
          "callback_url",
          "issuedAt",
          "expiresAt",
        ];
        if (
          challengeInput !== stored ||
          !Object.isFrozen(stored) ||
          Reflect.ownKeys(challenge).length !== fields.length ||
          fields.some((field) => challenge[field] !== stored[field])
        )
          throw new Error("PRIMARY_POPUP_CHALLENGE");
        const started = ports.now();
        const issued = Date.parse(challenge.issuedAt),
          expiry = Date.parse(challenge.expiresAt);
        if (
          !Number.isSafeInteger(started) ||
          !Number.isSafeInteger(issued) ||
          expiry - issued !== 300_000 ||
          started < issued ||
          started >= expiry
        )
          throw new Error("PRIMARY_POPUP_EXPIRED");
        const deadline = Math.min(expiry, started + 120_000);
        let last = started;
        const check = () => {
          const now = ports.now();
          if (
            !Number.isSafeInteger(now) ||
            now < last ||
            now >= deadline ||
            ports.walletOverride() !== null
          )
            throw new Error("PRIMARY_POPUP_EXPIRED");
          last = now;
        };
        const uid = ports.uid();
        if (!/^[A-Za-z0-9_-]{21,64}$/.test(uid))
          throw new Error("PRIMARY_POPUP_UID");
        let requested = false;
        const messenger = {
          connectAndWaitForResponse(requestInput: unknown): Promise<unknown> {
            if (requested)
              return Promise.reject(new Error("PRIMARY_POPUP_USED"));
            requested = true;
            return new Promise((resolve, reject) => {
              const fail = () => {
                if (settled) return;
                settled = true;
                cleanup();
                verifier.cancel(challenge.challengeId);
                reject(new Error("PRIMARY_POPUP_FAILED"));
              };
              stop = fail;
              try {
                check();
                const request = record(requestInput);
                const target = record(request.forceExecutionTargetConfig);
                const inputs = record(request.inputs);
                const params = record(inputs.messageParams);
                if (
                  request.actionType !== "login" ||
                  request.network !== "testnet" ||
                  target.executionTarget !== "v1_web" ||
                  Object.keys(target).length !== 1 ||
                  inputs.public_key !== undefined ||
                  inputs.contract_id !== undefined ||
                  !Array.isArray(inputs.methods) ||
                  inputs.methods.length !== 0 ||
                  Object.keys(inputs).sort().join(",") !==
                    "contract_id,messageParams,methods,public_key" ||
                  Object.keys(params).sort().join(",") !==
                    "message,nonce,recipient,state" ||
                  params.message !== challenge.message ||
                  params.recipient !== challenge.recipient ||
                  params.state !== challenge.challengeId ||
                  !(params.nonce instanceof Uint8Array) ||
                  Buffer.from(params.nonce).toString("base64") !==
                    challenge.nonce ||
                  challenge.callback_url !== ""
                )
                  throw new Error("PRIMARY_POPUP_REQUEST");
                const url = new URL(`${WALLET_BASE}/connect/testnet/login`);
                url.searchParams.set("source", "wpm");
                url.searchParams.set("connectionUid", uid);
                // Fixed recipient rather than a potentially secret-bearing current page URL.
                url.searchParams.set(
                  "pageUri",
                  encodeURIComponent(challenge.recipient),
                );
                popup = ports.open(url.href);
                if (!popup || popup.closed)
                  throw new Error("PRIMARY_POPUP_CLOSED");
                let status = "initializing";
                const send = () => {
                  check();
                  if (!popup || popup.closed)
                    throw new Error("PRIMARY_POPUP_CLOSED");
                  popup.postMessage(
                    {
                      uid,
                      actionType: "login",
                      network: "testnet",
                      status,
                      endTags: [],
                      ...(status === "initializing"
                        ? {
                            inputs: {
                              public_key: undefined,
                              methods: [],
                              contract_id: undefined,
                              messageParams: {
                                message: challenge.message,
                                recipient: challenge.recipient,
                                nonce: Uint8Array.from(
                                  Buffer.from(challenge.nonce, "base64"),
                                ),
                                state: challenge.challengeId,
                              },
                            },
                          }
                        : {}),
                    },
                    WALLET_BASE,
                  );
                };
                const guard = createPopupGuard({
                  popup,
                  uid,
                  routes: [
                    {
                      origin: WALLET_BASE,
                      statuses: [
                        "connected",
                        "attempting_reconnect",
                        "closed_success",
                        "closed_fail",
                        "closed_window",
                        "disconnected",
                      ],
                    },
                  ],
                  now: ports.now,
                  onMessage(data) {
                    check();
                    if (data.status === "closed_success") {
                      settled = true;
                      cleanup();
                      if (cleanupFailed) {
                        reject(new Error("PRIMARY_POPUP_CLEANUP"));
                        return;
                      }
                      resolve({
                        success: true,
                        endTags: [],
                        payload: data.payload,
                      });
                    } else if (
                      ["closed_fail", "closed_window", "disconnected"].includes(
                        String(data.status),
                      )
                    )
                      fail();
                    else {
                      status =
                        data.status === "attempting_reconnect"
                          ? "initializing"
                          : "connected";
                      send();
                    }
                  },
                });
                closeGuard = guard.close;
                listener = (event) => {
                  if (settled) return;
                  try {
                    check();
                    if (!ports.isNativeEvent(event)) return;
                    // Unrelated windows cannot cancel this proof, even with malformed data.
                    if (event.source !== popup) return;
                    if (event.origin !== WALLET_BASE) {
                      fail();
                      return;
                    }
                    const data = record(event.data);
                    if (data.uid !== uid) return;
                    if (!guard.accept(event)) fail();
                  } catch {
                    fail();
                  }
                };
                ports.listen(listener);
                listening = true;
                timer = ports.interval(() => {
                  if (!settled)
                    try {
                      send();
                    } catch {
                      fail();
                    }
                }, 500);
                send();
              } catch {
                fail();
              }
            });
          },
        };
        const sign = sdkFactory(messenger);
        const result = normalizeWalletProof(await sign(challenge));
        check();
        const evidence = await verifier.verify({
          ...result,
          challengeId: challenge.challengeId,
          network: "testnet",
        });
        check();
        if (cleanupFailed) throw new Error("PRIMARY_POPUP_CLEANUP");
        return evidence;
      } catch {
        verifier.cancel(challenge.challengeId);
        throw new Error("PRIMARY_POPUP_VERIFICATION_FAILED");
      } finally {
        cleanup();
        stop = undefined;
      }
    },
  });
}
