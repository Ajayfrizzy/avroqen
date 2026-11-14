// No live loader, browser wiring, routes or signing entrypoint.
import type { Challenge } from "./core.js";
import {
  createPopupSession,
  nativePopupEvent,
  type PopupPorts,
  type SdkFactory,
} from "./popup-session.js";
import { createPrimaryVerifier } from "./verify.js";

export const REVIEWED_HOSTED_RESPONSE_ORIGINS: readonly string[] =
  Object.freeze([]);
export function createPrimaryPopupPreparation(
  fetcher: typeof fetch,
  ports: PopupPorts,
  sdkFactory: SdkFactory,
) {
  const verifier = createPrimaryVerifier(fetcher, ports.now);
  return Object.freeze({
    issue: verifier.issue,
    cancel: verifier.cancel,
    session: (challenge: Challenge) =>
      createPopupSession(
        { ...ports, isNativeEvent: nativePopupEvent },
        sdkFactory,
        verifier,
        challenge,
        REVIEWED_HOSTED_RESPONSE_ORIGINS,
      ),
  });
}
