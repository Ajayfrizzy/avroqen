import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { request, type Server as SecureServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createLocalProxy } from "../../scripts/local-https-proxy.js";
import { setupCertificates } from "../../scripts/setup-local-https.js";

const root = mkdtempSync(join(tmpdir(), "avroqen-https-test-"));
const directory = join(root, "certificates");
let upstream: Server;
let proxy: SecureServer;
let port: number;
const listen = (server: Server | SecureServer) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as AddressInfo).port),
    );
  });
const close = (server: Server | SecureServer) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
function get(trust: boolean, host = "127.0.0.1:8443", path = "/workspace") {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        // Keep TLS identity bound to the loopback IP while varying HTTP Host.
        servername: "",
        path,
        headers: {
          host,
          origin: "https://127.0.0.1:8443",
          "x-forwarded-host": "evil.test",
        },
        ...(trust ? { ca: readFileSync(`${directory}/root-ca.crt`) } : {}),
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", () => reject(new Error("TLS verification failed")));
    req.end();
  });
}
beforeAll(async () => {
  setupCertificates(directory);
  upstream = createServer((req, res) =>
    res.end(
      JSON.stringify({
        origin: req.headers.origin,
        forwarded: req.headers["x-forwarded-host"] ?? null,
      }),
    ),
  );
  const upstreamPort = await listen(upstream);
  proxy = createLocalProxy(directory, upstreamPort);
  port = await listen(proxy);
});
afterAll(async () => {
  if (proxy) await close(proxy);
  if (upstream) await close(upstream);
  rmSync(root, { recursive: true, force: true });
});
it("requires explicit CA trust and preserves Origin while removing spoofed proxy headers", async () => {
  await expect(get(false)).rejects.toThrow("TLS verification failed");
  const response = await get(true);
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({
    origin: "https://127.0.0.1:8443",
    forwarded: null,
  });
});
it("rejects unintended Host and absolute/open-proxy request targets", async () => {
  expect((await get(true, "evil.test")).status).toBe(421);
  expect((await get(true, "127.0.0.1:8443", "https://evil.test/")).status).toBe(
    400,
  );
  expect((await get(true, "127.0.0.1:8443", "//evil.test/")).status).toBe(400);
});
it("returns a sanitized failure when the fixed local upstream is unavailable", async () => {
  await close(upstream);
  const response = await get(true);
  expect(response).toEqual({ status: 502, body: "Local upstream unavailable" });
});
