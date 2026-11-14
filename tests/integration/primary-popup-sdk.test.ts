import { expect, it, vi } from "vitest";
import {
  createPrimaryPopupPreparation,
  REVIEWED_HOSTED_RESPONSE_ORIGINS,
} from "../../scripts/primary-key-verification/popup-preparation.js";
import {
  createPopupSession,
  nativePopupEvent,
  type SdkFactory,
  WALLET_BASE,
} from "../../scripts/primary-key-verification/popup-session.js";
import { prepareSdkFactory } from "../../scripts/primary-key-verification/sdk-preparation.js";
import { proof } from "../fixtures/primary-key.js";
import { popupHarness, sdkSource } from "../fixtures/primary-popup.js";

it.each([false, true])(
  "actual isolated SDK uses popup login; terminal-first=%s",
  async (terminalFirst) => {
    const h = popupHarness();
    const session = createPopupSession(h.ports, h.sdkFactory, h.engine, h.c, [
      WALLET_BASE,
    ]);
    const result = session.run();
    result.catch(() => {});
    await h.waitForOpen();
    expect(h.ports.open).toHaveBeenCalledTimes(1);
    const url = new URL(
      String(
        (h.ports.open as ReturnType<typeof import("vitest").vi.fn>).mock
          .calls[0]?.[0],
      ),
    );
    expect(url.origin).toBe(WALLET_BASE);
    expect(url.pathname).toBe("/connect/testnet/login");
    expect(h.messages[0]).toMatchObject({
      actionType: "login",
      status: "initializing",
      network: "testnet",
    });
    if (!terminalFirst) h.send("connected");
    h.send("closed_success");
    h.send("closed_success");
    await expect(result).resolves.toMatchObject({
      status: "PRIMARY_KEY_CONTROL_VERIFIED_AT_FINALIZED_BLOCK",
    });
    expect(h.hasListener()).toBe(false);
    expect(h.hasTimer()).toBe(false);
    expect(h.ports.unlisten).toHaveBeenCalledTimes(1);
    await expect(session.run()).rejects.toThrow("PRIMARY_POPUP_USED");
  },
);
it("removes original messenger source entirely and refuses changed SDK bytes", () => {
  const source = prepareSdkFactory(sdkSource);
  for (const text of [
    "var ComWindow =",
    "var MeteorPostMessenger =",
    'window.addEventListener("message"',
    "window.meteorCom.addMessageDataListener(listener)",
  ])
    expect(source).not.toContain(text);
  expect(source).toContain('action.execute("v1_web")');
  expect(() => prepareSdkFactory(`${sdkSource}\n`)).toThrow(
    "SDK_SOURCE_CHANGED",
  );
});
it("default facade is blocked before opening, SDK evaluation or RPC", async () => {
  const h = popupHarness(),
    // Fail immediately if the SDK boundary is reached; never transform/evaluate it.
    sdkFactory = vi.fn<SdkFactory>(() => {
      throw new Error("SDK_MUST_NOT_BE_EVALUATED");
    }),
    preparation = createPrimaryPopupPreparation(h.fetcher, h.ports, sdkFactory);
  expect(REVIEWED_HOSTED_RESPONSE_ORIGINS).toEqual([]);
  expect(Object.isFrozen(REVIEWED_HOSTED_RESPONSE_ORIGINS)).toBe(true);
  // Fixture clock/ports only. The same-instance challenge passes the independent
  // ownership gate: removing the origin guard would reach the factory spy and fail.
  const challenge = preparation.issue();
  await expect(preparation.session(challenge).run()).rejects.toThrow(
    "PRIMARY_POPUP_VERIFICATION_FAILED",
  );
  expect(sdkFactory).not.toHaveBeenCalled();
  expect(h.ports.open).not.toHaveBeenCalled();
  expect(h.ports.listen).not.toHaveBeenCalled();
  expect(h.hasTimer()).toBe(false);
  expect(h.fetcher).not.toHaveBeenCalled();
});
it("rejects synthetic native MessageEvents", () => {
  expect(nativePopupEvent({ isTrusted: true, type: "message" })).toBe(false);
  expect(nativePopupEvent(new MessageEvent("message"))).toBe(false);
});
it("reconnect sends initialization again without replacing listener or popup", async () => {
  const h = popupHarness(),
    s = createPopupSession(h.ports, h.sdkFactory, h.engine, h.c, [WALLET_BASE]);
  const result = s.run();
  result.catch(() => {});
  await h.waitForOpen();
  h.send("connected");
  h.send("attempting_reconnect");
  expect(h.messages.at(-1)).toMatchObject({
    status: "initializing",
    actionType: "login",
  });
  expect(h.ports.open).toHaveBeenCalledTimes(1);
  expect(h.ports.listen).toHaveBeenCalledTimes(1);
  h.send("closed_success");
  await expect(result).resolves.toBeDefined();
});
it("rejects valid Testing fixture signature after actual SDK normalization", async () => {
  const h = popupHarness(),
    s = createPopupSession(h.ports, h.sdkFactory, h.engine, h.c, [WALLET_BASE]);
  const result = s.run();
  result.catch(() => {});
  await h.waitForOpen();
  const p = proof(h.c, h.policy, h.testing);
  h.send("closed_success", {
    payload: {
      accountId: h.policy.account,
      signedMessage: { publicKey: p.publicKey, signature: p.signature },
    },
  });
  await expect(result).rejects.toThrow();
  expect(h.fetcher).not.toHaveBeenCalled();
  expect(h.hasListener()).toBe(false);
  expect(h.hasTimer()).toBe(false);
});

it("fails closed without the VM-provided Buffer; fixture success is not browser compatibility", async () => {
  const h = popupHarness({ provideBuffer: false });
  const session = createPopupSession(h.ports, h.sdkFactory, h.engine, h.c, [
    WALLET_BASE,
  ]);
  await expect(session.run()).rejects.toThrow(
    "PRIMARY_POPUP_VERIFICATION_FAILED",
  );
  expect(h.ports.open).not.toHaveBeenCalled();
  expect(h.fetcher).not.toHaveBeenCalled();
  expect(h.hasListener()).toBe(false);
  expect(h.hasTimer()).toBe(false);
  expect(() => h.engine.getChallenge(h.c.challengeId)).toThrow(
    "CHALLENGE_UNAVAILABLE",
  );
});
