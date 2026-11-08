// Unwired transport candidate, NOT a patch to MeteorConnect or a signing entrypoint.
// Each (origin,status) route must be reviewed for the selected transport. Never infer
// trusted origins from incoming events, redirects, payload fields or localStorage.
type Status =
  | "connected"
  | "attempting_reconnect"
  | "closed_success"
  | "closed_fail"
  | "closed_window"
  | "disconnected";
const statuses = new Set<Status>([
  "connected",
  "attempting_reconnect",
  "closed_success",
  "closed_fail",
  "closed_window",
  "disconnected",
]);
export interface PopupRoute {
  readonly origin: string;
  readonly statuses: readonly Status[];
}
export function createPopupGuard(options: {
  popup: object;
  uid: string;
  routes: readonly PopupRoute[];
  now: () => number;
  onMessage: (data: Readonly<Record<string, unknown>>) => void;
}) {
  const routes = new Map<string, Set<Status>>();
  if (!options.popup || !options.uid || !options.routes.length)
    throw new Error("TRANSPORT_POLICY");
  for (const route of options.routes) {
    const url = new URL(route.origin);
    // URL.origin is 'null' for extension schemes in Node; canonicalize explicitly.
    const canonical = ["chrome-extension:", "moz-extension:"].includes(
      url.protocol,
    )
      ? `${url.protocol}//${url.host}`
      : url.origin;
    if (
      !["https:", "chrome-extension:", "moz-extension:"].includes(
        url.protocol,
      ) ||
      !url.hostname ||
      url.hostname.includes("*") ||
      url.username ||
      url.password ||
      route.origin !== canonical ||
      routes.has(route.origin) ||
      !route.statuses.length ||
      route.statuses.some((s) => !statuses.has(s))
    )
      throw new Error("TRANSPORT_POLICY");
    routes.set(route.origin, new Set(route.statuses));
  }
  const popup = options.popup,
    uid = options.uid;
  const clock = options.now,
    receive = options.onMessage;
  const started = clock();
  if (!Number.isSafeInteger(started) || started < 0)
    throw new Error("TRANSPORT_CLOCK");
  let last = started,
    closed = false;
  return Object.freeze({
    close() {
      closed = true;
    },
    accept(event: { origin: string; source: unknown; data: unknown }): boolean {
      if (closed) return false;
      let now: number;
      try {
        now = clock();
      } catch {
        closed = true;
        return false;
      }
      if (
        !Number.isSafeInteger(now) ||
        now < last ||
        now - started >= 300_000
      ) {
        closed = true;
        return false;
      }
      last = now;
      if (
        event.source !== popup ||
        !event.data ||
        typeof event.data !== "object" ||
        Array.isArray(event.data)
      )
        return false;
      const data = event.data as Record<string, unknown>;
      if (
        data.uid !== uid ||
        typeof data.status !== "string" ||
        !routes.get(event.origin)?.has(data.status as Status) ||
        ("network" in data && data.network !== "testnet") ||
        ("actionType" in data && data.actionType !== "login")
      )
        return false;
      // The inspected V1 messenger accepts terminal-first success. Provenance and
      // the separate exact-challenge signature verifier remain mandatory.
      // Stop before invoking consumer: duplicates and reentrant events cannot win.
      if (
        [
          "closed_success",
          "closed_fail",
          "closed_window",
          "disconnected",
        ].includes(data.status)
      )
        closed = true;
      try {
        receive(Object.freeze({ ...data }));
      } catch {
        closed = true;
        return false;
      }
      return true;
    },
  });
}
