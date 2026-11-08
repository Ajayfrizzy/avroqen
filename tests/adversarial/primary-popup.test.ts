import { expect, it, vi } from "vitest";
import { createPopupGuard } from "../../scripts/primary-key-verification/popup-guard.js";

function setup() {
  const popup = {},
    receive = vi.fn();
  let time = 1000;
  const routes = [
    {
      origin: "https://wallet.meteorwallet.app",
      statuses: [
        "connected",
        "closed_success",
        "closed_fail",
        "closed_window",
      ] as const,
    },
    // Synthetic reviewed extension popup route: not a real or approved extension ID.
    {
      origin: "chrome-extension://fixture-extension",
      statuses: ["connected", "closed_success"] as const,
    },
  ] as const;
  const guard = createPopupGuard({
    popup,
    uid: "fixture-uid",
    routes,
    now: () => time,
    onMessage: receive,
  });
  const event = (status = "connected", origin: string = routes[0].origin) => ({
    source: popup,
    origin,
    data: { uid: "fixture-uid", status },
  });
  return {
    guard,
    popup,
    receive,
    event,
    routes,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
it.each([
  "https://wallet.meteorwallet.app",
  "chrome-extension://fixture-extension",
])(
  "accepts only explicit reviewed route from same popup (%s), closes before duplicate success",
  (origin) => {
    const h = setup();
    expect(h.guard.accept(h.event("connected", origin))).toBe(true);
    expect(h.guard.accept(h.event("closed_success", origin))).toBe(true);
    expect(h.guard.accept(h.event("closed_success", origin))).toBe(false);
    expect(h.receive).toHaveBeenCalledTimes(2);
  },
);
it.each([
  "https://evil.test",
  "https://wallet.meteorwallet.app.evil.test",
  "https://wallet-dev.meteorwallet.app",
  "null",
  "",
  "chrome-extension://unknown",
  "https://wallet.meteorwallet.app:444",
])("rejects spoof origin %s even with correct UID and popup", (origin) => {
  const h = setup();
  expect(h.guard.accept(h.event("connected", origin))).toBe(false);
  expect(h.receive).not.toHaveBeenCalled();
});
it("requires actual popup source, correct UID, shape, network and operation", () => {
  const h = setup();
  for (const event of [
    { ...h.event(), source: {} },
    { ...h.event(), source: null },
    { ...h.event(), data: null },
    { ...h.event(), data: [] },
    { ...h.event(), data: { uid: "wrong", status: "connected" } },
    {
      ...h.event(),
      data: { uid: "fixture-uid", status: "connected", network: "mainnet" },
    },
    {
      ...h.event(),
      data: {
        uid: "fixture-uid",
        status: "connected",
        actionType: "sign_transactions",
      },
    },
    h.event("unknown"),
  ])
    expect(h.guard.accept(event)).toBe(false);
  expect(h.receive).not.toHaveBeenCalled();
});
it("does not widen trust when the same popup redirects to another origin", () => {
  const h = setup();
  h.guard.accept(h.event());
  expect(h.guard.accept(h.event("closed_success", "https://evil.test"))).toBe(
    false,
  );
  expect(h.guard.accept(h.event("closed_success"))).toBe(true);
});
it("origin routes may be restricted to handshake instead of trusting every status", () => {
  const h = setup();
  const guard = createPopupGuard({
    popup: h.popup,
    uid: "fixture-uid",
    routes: [{ origin: h.routes[0].origin, statuses: ["connected"] }],
    now: () => 1000,
    onMessage: h.receive,
  });
  expect(guard.accept(h.event())).toBe(true);
  expect(guard.accept(h.event("closed_success"))).toBe(false);
});
it.each([300000, -1])("rejects expired or backwards clock %s", (ms) => {
  const h = setup();
  h.advance(ms);
  expect(h.guard.accept(h.event())).toBe(false);
});
it.each(["closed_fail", "closed_window"])(
  "closes on cancellation/error %s",
  (status) => {
    const h = setup();
    expect(h.guard.accept(h.event(status))).toBe(true);
    expect(h.guard.accept(h.event())).toBe(false);
  },
);
it("supports explicit close and isolates consumer failure", () => {
  const h = setup();
  h.guard.close();
  expect(h.guard.accept(h.event())).toBe(false);
  const guard = createPopupGuard({
    popup: h.popup,
    uid: "fixture-uid",
    routes: h.routes,
    now: () => 1000,
    onMessage: () => {
      throw new Error("secret");
    },
  });
  expect(guard.accept(h.event())).toBe(false);
  expect(guard.accept(h.event())).toBe(false);
});
it.each([
  "http://wallet.meteorwallet.app",
  "https://wallet.meteorwallet.app/",
  "https://user:pass@wallet.meteorwallet.app",
  "https://*.meteorwallet.app",
  "null",
])("rejects noncanonical/unsafe route %s", (origin) => {
  const h = setup();
  expect(() =>
    createPopupGuard({
      popup: h.popup,
      uid: "x",
      routes: [{ origin, statuses: ["connected"] }],
      now: () => 1000,
      onMessage: h.receive,
    }),
  ).toThrow();
});

it("permits a specifically reviewed two-origin handshake without trusting arbitrary redirects", () => {
  const h = setup();
  const guard = createPopupGuard({
    popup: h.popup,
    uid: "fixture-uid",
    routes: [
      { origin: "https://wallet.meteorwallet.app", statuses: ["connected"] },
      {
        origin: "chrome-extension://fixture-extension",
        statuses: ["closed_success"],
      },
    ],
    now: () => 1000,
    onMessage: h.receive,
  });
  expect(guard.accept(h.event())).toBe(true);
  expect(guard.accept(h.event("closed_success"))).toBe(false);
  expect(
    guard.accept(
      h.event("closed_success", "chrome-extension://fixture-extension"),
    ),
  ).toBe(true);
});
it("closes before a reentrant terminal consumer can accept a duplicate", () => {
  const h = setup();
  let reentrant: boolean | undefined;
  const guard = createPopupGuard({
    popup: h.popup,
    uid: "fixture-uid",
    routes: h.routes,
    now: () => 1000,
    onMessage: (data) => {
      if (data.status === "closed_success")
        reentrant = guard.accept(h.event("closed_success"));
    },
  });
  guard.accept(h.event());
  guard.accept(h.event("closed_success"));
  expect(reentrant).toBe(false);
});

it("closes on clock exceptions without delivering a response", () => {
  const h = setup();
  let broken = false;
  const guard = createPopupGuard({
    popup: h.popup,
    uid: "fixture-uid",
    routes: h.routes,
    now: () => {
      if (broken) throw new Error("untrusted clock detail");
      return 1000;
    },
    onMessage: h.receive,
  });
  broken = true;
  expect(guard.accept(h.event())).toBe(false);
  broken = false;
  expect(guard.accept(h.event())).toBe(false);
  expect(h.receive).not.toHaveBeenCalled();
});
