import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { request } from "node:https";

const origin = "https://127.0.0.1:8443";
const ca = readFileSync(".local/https/root-ca.crt");
function check(path: string, body?: object, requestOrigin = origin) {
  return new Promise<{ status: number; cookies: string[]; body: string }>(
    (resolve, reject) => {
      const data = body ? JSON.stringify(body) : undefined;
      const req = request(
        `${origin}${path}`,
        {
          ca,
          method: data ? "POST" : "GET",
          headers: data
            ? {
                Origin: requestOrigin,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data),
              }
            : {},
          timeout: 10000,
        },
        (res) => {
          let text = "";
          res.on("data", (chunk) => {
            if (path === "/api/auth/config") text += chunk;
          });
          res.on("error", () => reject(new Error("HTTPS response failed")));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              cookies: res.headers["set-cookie"] ?? [],
              body: text,
            }),
          );
        },
      );
      req.on("timeout", () => req.destroy());
      req.on("error", () =>
        reject(new Error("Trusted local HTTPS unavailable")),
      );
      req.end(data);
    },
  );
}
const config = await check("/api/auth/config");
assert.equal(config.status, 200);
assert.equal(JSON.parse(config.body).origin, origin);
assert.equal(JSON.parse(config.body).network, "testnet");
assert.equal((await check("/workspace")).status, 200);
assert.equal((await check("/api/auth/session")).status, 401);
const challenge = await check("/api/auth/challenge", {
  accountId: "acceptance-check.testnet",
  network: "testnet",
});
assert.equal(challenge.status, 200);
// Never print cookie values or retain challenge bodies. No proof is signed or verified.
const cookie = challenge.cookies.find((value) =>
  value.startsWith("__Host-avroqen_login="),
);
assert.equal(Boolean(cookie), true);
for (const attribute of [
  "Secure",
  "HttpOnly",
  "SameSite=Strict",
  "Path=/",
  "Max-Age=300",
])
  assert.equal(cookie?.split("; ").includes(attribute), true);
assert.equal(/;\s*Domain=/i.test(cookie ?? ""), false);
assert.equal(
  (
    await check(
      "/api/auth/challenge",
      { accountId: "acceptance-check.testnet", network: "testnet" },
      "http://127.0.0.1:3000",
    )
  ).status,
  403,
);
console.info(
  "PASS: CA-verified TLS, workspace/config, signed-out session, Secure/HttpOnly/SameSite/__Host challenge cookie attributes and wrong-origin rejection. No wallet/session issued; This host check does not assert device-browser trust.",
);
