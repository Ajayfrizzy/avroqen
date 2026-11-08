import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { compileFunction, createContext } from "node:vm";
import { vi } from "vitest";
import type {
  PopupEvent,
  PopupHandle,
  PopupPorts,
  SdkFactory,
} from "../../scripts/primary-key-verification/popup-session.js";
import { prepareSdkFactory } from "../../scripts/primary-key-verification/sdk-preparation.js";
import { harness, proof } from "./primary-key.js";

const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
export const sdkPath = webRequire.resolve("@meteorwallet/sdk");
export const sdkSource = readFileSync(sdkPath, "utf8");
const sdkRequire = createRequire(join(dirname(sdkPath), "package.json"));
export function popupHarness(options: { provideBuffer?: boolean } = {}) {
  const h = harness();
  let listener: ((event: unknown) => void) | undefined;
  let tick: (() => void) | undefined;
  const brands = new WeakSet<object>();
  const messages: Record<string, unknown>[] = [];
  let closed = false,
    override: string | null = null;
  const popup: PopupHandle = {
    get closed() {
      return closed;
    },
    postMessage: vi.fn((value, origin) => {
      if (origin !== "https://wallet.meteorwallet.app")
        throw new Error("Wrong target origin");
      messages.push(value as Record<string, unknown>);
    }),
    close: vi.fn(() => {
      closed = true;
    }),
  };
  const ports: PopupPorts = {
    now: h.now,
    uid: () => "fixture_uid_00000000001",
    walletOverride: () => override,
    open: vi.fn(() => popup),
    isNativeEvent: (e): e is PopupEvent =>
      typeof e === "object" && e !== null && brands.has(e),
    listen: vi.fn((cb) => {
      if (listener) throw new Error("Second listener");
      listener = cb;
    }),
    unlisten: vi.fn((cb) => {
      if (listener !== cb) throw new Error("Wrong listener");
      listener = undefined;
    }),
    interval: vi.fn((cb) => {
      tick = cb;
      return 1;
    }),
    clearInterval: vi.fn(() => {
      tick = undefined;
    }),
  };
  // Actual transformed SDK, fresh VM/module per proof, no shared SDK messenger.
  const sdkFactory: SdkFactory = (messenger) => {
    const context = createContext({
      crypto: globalThis.crypto,
      ...(options.provideBuffer === false ? {} : { Buffer }),
      Uint8Array,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      console,
      window: {
        localStorage: { getItem: () => override },
        // Never read or call extension APIs in the isolated source path.
        get meteorCom() {
          throw new Error("Extension touched");
        },
        get meteorComV2() {
          throw new Error("Extension touched");
        },
        addEventListener: () => {
          throw new Error("Unguarded SDK listener");
        },
      },
      customElements: { get: () => undefined, define: () => {} },
      process: { env: { NODE_ENV: "development" } },
    });
    const factory = compileFunction(
      prepareSdkFactory(sdkSource),
      ["require", "exports", "guardedMessenger"],
      { parsingContext: context },
    );
    const fixtureRequire = (id: string) => {
      if (id === "lit/decorators.js")
        return {
          ...sdkRequire(id),
          // UI is not executed. Each fixture realm has a separate element registry.
          customElement: () => (target: unknown) => target,
        };
      return sdkRequire(id);
    };
    return factory(fixtureRequire, {}, messenger);
  };
  const c = h.engine.issue();
  const send = (
    status: string,
    options: {
      origin?: string;
      source?: unknown;
      uid?: string;
      native?: boolean;
      actionType?: string;
      payload?: unknown;
    } = {},
  ) => {
    const p = proof(c, h.policy, h.primary);
    const event = {
      origin: options.origin ?? "https://wallet.meteorwallet.app",
      source: options.source ?? popup,
      data: {
        uid: options.uid ?? "fixture_uid_00000000001",
        status,
        actionType: options.actionType ?? "login",
        network: "testnet",
        payload: options.payload ?? {
          accountId: h.policy.account,
          signedMessage: { publicKey: p.publicKey, signature: p.signature },
        },
      },
    };
    if (options.native !== false) brands.add(event);
    listener?.(event);
  };
  return {
    ...h,
    c,
    ports,
    popup,
    sdkFactory,
    messages,
    send,
    tick: () => tick?.(),
    setOverride: (value: string | null) => {
      override = value;
    },
    closePopup: () => {
      closed = true;
    },
    hasListener: () => listener !== undefined,
    hasTimer: () => tick !== undefined,
    waitForOpen: async () => {
      for (let i = 0; i < 200 && !listener; i++)
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      if (!listener) throw new Error("Fixture SDK did not open popup");
    },
  };
}
