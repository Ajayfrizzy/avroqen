import { expect, it, vi } from "vitest";
import {
  createPopupSession,
  type SdkFactory,
  WALLET_BASE,
} from "../../scripts/primary-key-verification/popup-session.js";
import { proof } from "../fixtures/primary-key.js";
import { popupHarness } from "../fixtures/primary-popup.js";

function session(h: ReturnType<typeof popupHarness>, factory = h.sdkFactory) {
  return createPopupSession(h.ports, factory, h.engine, h.c, [WALLET_BASE]);
}
const handled = (promise: Promise<unknown>) => {
  void promise.catch(() => {});
  return promise;
};
function clean(h: ReturnType<typeof popupHarness>) {
  expect(h.hasListener()).toBe(false);
  expect(h.hasTimer()).toBe(false);
}
it.each(["synthetic", "wrong-source", "wrong-uid"])(
  "ignores %s; only native exact-popup/UID proof can finish",
  async (kind) => {
    const h = popupHarness(),
      s = session(h),
      result = handled(s.run());
    await h.waitForOpen();
    h.send(
      "closed_success",
      kind === "synthetic"
        ? { native: false }
        : kind === "wrong-source"
          ? { source: {} }
          : { uid: "another_uid_00000000001" },
    );
    expect(h.hasListener()).toBe(true);
    expect(h.fetcher).not.toHaveBeenCalled();
    h.send("closed_success");
    await expect(result).resolves.toBeDefined();
    clean(h);
  },
);
it.each([
  "https://evil.test",
  "https://wallet-dev.meteorwallet.app",
  "chrome-extension://fixture",
  "null",
])(
  "ends on an unreviewed response origin %s from the actual popup",
  async (origin) => {
    const h = popupHarness(),
      s = session(h),
      result = handled(s.run());
    await h.waitForOpen();
    h.send("closed_success", { origin });
    await expect(result).rejects.toThrow();
    clean(h);
    expect(h.fetcher).not.toHaveBeenCalled();
  },
);
it.each(["closed_fail", "closed_window", "disconnected", "unknown"])(
  "closes and consumes challenge on %s",
  async (status) => {
    const h = popupHarness(),
      s = session(h),
      result = handled(s.run());
    await h.waitForOpen();
    h.send(status);
    await expect(result).rejects.toThrow();
    clean(h);
    await expect(
      h.engine.verify(proof(h.c, h.policy, h.primary)),
    ).rejects.toThrow("CHALLENGE_UNAVAILABLE");
  },
);
it.each(["popup-close", "timeout", "expiry", "rollback", "cancel", "override"])(
  "cleans up on %s and cannot reopen",
  async (kind) => {
    const h = popupHarness(),
      s = session(h),
      result = handled(s.run());
    await h.waitForOpen();
    if (kind === "popup-close") h.closePopup();
    if (kind === "timeout") h.advance(120000);
    if (kind === "expiry") h.advance(300000);
    if (kind === "rollback") h.advance(-1);
    if (kind === "override") h.setOverride(WALLET_BASE);
    if (kind === "cancel") s.cancel();
    else h.tick();
    await expect(result).rejects.toThrow();
    clean(h);
    await expect(s.run()).rejects.toThrow("PRIMARY_POPUP_USED");
    expect(h.ports.open).toHaveBeenCalledTimes(1);
  },
);
it("uses remaining challenge lifetime when less than transport timeout", async () => {
  const h = popupHarness();
  h.advance(299500);
  const result = handled(session(h).run());
  await h.waitForOpen();
  h.advance(500);
  h.tick();
  await expect(result).rejects.toThrow();
  clean(h);
});
it.each([
  "override",
  "closed-popup",
  "blocked-popup",
  "expired",
  "challenge-substitution",
])("rejects %s before sending inputs", async (kind) => {
  const h = popupHarness();
  if (kind === "override") h.setOverride("https://evil.test");
  if (kind === "closed-popup") h.closePopup();
  if (kind === "blocked-popup") vi.mocked(h.ports.open).mockReturnValue(null);
  if (kind === "expired") h.advance(300000);
  const c =
    kind === "challenge-substitution"
      ? { ...h.c, message: "different purpose" }
      : h.c;
  const s = createPopupSession(h.ports, h.sdkFactory, h.engine, c, [
    WALLET_BASE,
  ]);
  await expect(s.run()).rejects.toThrow();
  expect(h.messages).toHaveLength(0);
  clean(h);
});
it.each([
  "nonce",
  "recipient",
  "callback",
  "purpose",
  "extension",
  "wrong-action",
])("rejects modified SDK request %s before opening", async (kind) => {
  const h = popupHarness();
  const factory: SdkFactory = (messenger) =>
    h.sdkFactory({
      connectAndWaitForResponse: async (value) => {
        const r = value as {
          inputs: { messageParams: Record<string, unknown> };
          forceExecutionTargetConfig: { executionTarget: string };
          actionType: string;
        };
        if (kind === "nonce") r.inputs.messageParams.nonce = new Uint8Array(32);
        if (kind === "recipient")
          r.inputs.messageParams.recipient = "https://evil.test";
        if (kind === "callback")
          r.inputs.messageParams.callbackUrl = "https://evil.test";
        if (kind === "purpose")
          r.inputs.messageParams.message = "Authorize something else";
        if (kind === "extension")
          r.forceExecutionTargetConfig = { executionTarget: "v1_ext" };
        if (kind === "wrong-action") r.actionType = "sign_message";
        return messenger.connectAndWaitForResponse(r);
      },
    });
  await expect(session(h, factory).run()).rejects.toThrow();
  expect(h.ports.open).not.toHaveBeenCalled();
  clean(h);
});
it("rejects stale RPC after a correctly signed popup proof", async () => {
  const h = popupHarness();
  const original = h.fetcher.getMockImplementation();
  h.fetcher.mockImplementation(async (url, options) => {
    const response = await original?.(url, options);
    const body = await response?.json();
    if (body.result.header)
      body.result.header.timestamp_nanosec = String(
        BigInt(h.now() - 120001) * 1_000_000n,
      );
    return Response.json(body);
  });
  const result = handled(session(h).run());
  await h.waitForOpen();
  h.send("closed_success");
  await expect(result).rejects.toThrow();
  clean(h);
});
it("keeps dedicated SDK copies, UIDs and popup listeners isolated across simultaneous proofs", async () => {
  const a = popupHarness(),
    b = popupHarness();
  const ar = handled(session(a).run()),
    br = handled(session(b).run());
  await Promise.all([a.waitForOpen(), b.waitForOpen()]);
  a.send("closed_success", { source: b.popup });
  expect(a.fetcher).not.toHaveBeenCalled();
  b.send("closed_success");
  await expect(br).resolves.toBeDefined();
  expect(a.hasListener()).toBe(true);
  a.send("closed_success");
  await expect(ar).resolves.toBeDefined();
  clean(a);
  clean(b);
});
it("rejects replay even if a new popup session is constructed around the old challenge", async () => {
  const h = popupHarness(),
    result = handled(session(h).run());
  await h.waitForOpen();
  h.send("closed_success");
  await result;
  await expect(session(h).run()).rejects.toThrow();
  expect(h.ports.open).toHaveBeenCalledTimes(1);
  clean(h);
});
it("rejects wrong wire operation metadata from the correct popup", async () => {
  const h = popupHarness(),
    result = handled(session(h).run());
  await h.waitForOpen();
  h.send("closed_success", { actionType: "sign_message" });
  await expect(result).rejects.toThrow();
  clean(h);
});

it("rejects concurrent consumption of the same proof without a second success", async () => {
  const h = popupHarness(),
    s = session(h),
    result = handled(s.run());
  await h.waitForOpen();
  // The verifier's same immutable challenge can be consumed only once.
  await h.engine.verify(proof(h.c, h.policy, h.primary));
  h.send("closed_success");
  await expect(result).rejects.toThrow();
  clean(h);
});
it("cannot return success if listener cleanup fails", async () => {
  const h = popupHarness();
  const remove = h.ports.unlisten;
  h.ports.unlisten = (listener) => {
    remove(listener);
    throw new Error("fixture cleanup failure");
  };
  const result = handled(session(h).run());
  await h.waitForOpen();
  h.send("closed_success");
  await expect(result).rejects.toThrow();
  clean(h);
  expect(h.fetcher).not.toHaveBeenCalled();
});

it("rejects a challenge object with a deceptive JSON serializer before SDK execution", async () => {
  const h = popupHarness();
  const bad = {
    ...h.c,
    message: "Authorize another purpose",
    toJSON: () => h.c,
  };
  await expect(
    createPopupSession(h.ports, h.sdkFactory, h.engine, bad, [
      WALLET_BASE,
    ]).run(),
  ).rejects.toThrow();
  expect(h.ports.open).not.toHaveBeenCalled();
});

it("rebuilds repeated handshake inputs from the stored challenge if the SDK request object changes", async () => {
  const h = popupHarness();
  let params: Record<string, unknown> | undefined;
  const factory: SdkFactory = (messenger) =>
    h.sdkFactory({
      connectAndWaitForResponse(value) {
        params = (
          value as { inputs: { messageParams: Record<string, unknown> } }
        ).inputs.messageParams;
        return messenger.connectAndWaitForResponse(value);
      },
    });
  const result = handled(session(h, factory).run());
  await h.waitForOpen();
  if (!params) throw new Error("Missing fixture request");
  params.message = "changed by SDK";
  params.nonce = new Uint8Array(32);
  h.tick();
  const inputs = h.messages.at(-1)?.inputs as {
    messageParams: { message: string; nonce: Uint8Array };
  };
  expect(inputs.messageParams.message).toBe(h.c.message);
  expect(Buffer.from(inputs.messageParams.nonce).toString("base64")).toBe(
    h.c.nonce,
  );
  h.send("closed_success");
  await expect(result).resolves.toBeDefined();
  clean(h);
});

it.each(["clone", "foreign", "nonce", "expiry", "callback", "recipient"])(
  "rejects caller-created/modified challenge %s before SDK or popup",
  async (kind) => {
    const h = popupHarness();
    let challenge = { ...h.c };
    if (kind === "foreign") {
      const other = popupHarness();
      challenge = other.c;
    }
    if (kind === "nonce")
      challenge = {
        ...challenge,
        nonce: Buffer.alloc(32, 1).toString("base64"),
      };
    if (kind === "expiry")
      challenge = {
        ...challenge,
        expiresAt: new Date(h.now() + 600000).toISOString(),
      };
    if (kind === "callback")
      challenge = { ...challenge, callback_url: "https://evil.test" as "" };
    if (kind === "recipient")
      challenge = {
        ...challenge,
        recipient: "https://evil.test" as typeof h.c.recipient,
      };
    const factory = vi.fn(h.sdkFactory);
    await expect(
      createPopupSession(h.ports, factory, h.engine, challenge, [
        WALLET_BASE,
      ]).run(),
    ).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
    expect(h.ports.open).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
    clean(h);
  },
);
