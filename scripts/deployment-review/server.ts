import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import {
  ACCOUNT,
  candidate,
  inspect,
} from "../../packages/domain/src/deployment-preview.js";

const root = new URL("../../", import.meta.url);
const endpoint = "https://rpc.testnet.near.org";
// Closed, read-only RPC surface. No caller-supplied URL/method/params or env file.
export async function observe(fetcher: typeof fetch = fetch) {
  async function rpc(method: string, params: unknown) {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "deployment-preview-read-only",
        method,
        params,
      }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("RPC_UNAVAILABLE");
    const data = await response.json();
    if (data.error || !data.result) throw new Error("RPC_UNAVAILABLE");
    return data.result;
  }
  const status = await rpc("status", []);
  if (status.chain_id !== "testnet") throw new Error("NETWORK_MISMATCH");
  const block = await rpc("block", { finality: "final" });
  const hash = block.header.hash;
  const [account, keys, protocol, gas] = await Promise.all([
    rpc("query", {
      request_type: "view_account",
      account_id: ACCOUNT,
      block_id: hash,
    }),
    rpc("query", {
      request_type: "view_access_key_list",
      account_id: ACCOUNT,
      block_id: hash,
    }),
    rpc("EXPERIMENTAL_protocol_config", { block_id: hash }),
    rpc("gas_price", [hash]),
  ]);
  if (keys.block_hash !== hash || keys.block_height !== block.header.height)
    throw new Error("BLOCK_MISMATCH");
  const age =
    Date.now() - Number(BigInt(block.header.timestamp_nanosec) / 1000000n);
  if (!Number.isFinite(age) || age < -5000 || age > 120000)
    throw new Error("STALE_FINALIZED_BLOCK");
  return {
    observedAtUtc: new Date().toISOString(),
    network: status.chain_id,
    accountId: ACCOUNT,
    finality: "final",
    block: {
      hash,
      height: block.header.height,
      timestampNanosec: block.header.timestamp_nanosec,
    },
    account,
    keys: keys.keys.map(
      (k: { public_key: string; access_key: { permission: unknown } }) => ({
        publicKey: k.public_key,
        permission: k.access_key.permission,
      }),
    ),
    protocolVersion: protocol.protocol_version,
    storageAmountPerByte: protocol.runtime_config.storage_amount_per_byte,
    gasPrice: gas.gas_price,
  };
}
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
const css = `body{font:17px/1.6 system-ui,sans-serif;background:#0d1725;color:#eff4fc;margin:0}main{max-width:900px;margin:auto;padding:24px}h1{line-height:1.2}h2{font-size:1.25rem}section{background:#18283b;padding:20px;border-radius:12px;margin:20px 0}pre,code{overflow-wrap:anywhere;white-space:pre-wrap}a{color:#9dd9ff}a:focus-visible{outline:3px solid #ffe393;outline-offset:4px}.warning{border-left:5px solid #ffe393}dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:12px}dd{margin:0;overflow-wrap:anywhere}@media(max-width:500px){main{padding:14px}dl{display:block}dt{font-weight:bold}dd{margin-bottom:12px}}`;
export function createReviewer(
  live = false,
  observationProvider: () => Promise<unknown> = observe,
) {
  let pending: Promise<string> | undefined;
  async function inspection() {
    const wasm = await readFile(
      new URL("docs/evidence/mandate-vault-approved.wasm", root),
    );
    const observation = live
      ? await observationProvider()
      : JSON.parse(
          await readFile(
            new URL("docs/evidence/DEPLOYMENT_KEY_GATE_ACCOUNT.json", root),
            "utf8",
          ),
        );
    return JSON.stringify(
      {
        mode: live
          ? "LIVE_READ_ONLY_OBSERVATION"
          : "OFFLINE_HISTORICAL_PREVIEW",
        ...inspect(candidate(wasm), observation, live ? "LIVE" : "HISTORICAL"),
      },
      null,
      2,
    );
  }
  return createServer(async (req, res) => {
    const host = req.headers.host;
    const origin = host ? `http://${host}` : "";
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; script-src 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (
      !host ||
      host !== `127.0.0.1:${(req.socket.address() as { port: number }).port}` ||
      (req.headers.origin && req.headers.origin !== origin) ||
      (req.headers["sec-fetch-site"] &&
        !["same-origin", "none"].includes(
          String(req.headers["sec-fetch-site"]),
        ))
    ) {
      res.writeHead(403);
      res.end("LOCAL_ORIGIN_REQUIRED");
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end("READ_ONLY");
      return;
    }
    if (req.url === "/style.css") {
      res.writeHead(200, { "Content-Type": "text/css" });
      res.end(css);
      return;
    }
    if (!["/", "/inspection.json"].includes(req.url ?? "")) {
      res.writeHead(404);
      res.end("NOT_FOUND");
      return;
    }
    try {
      // Coalesce simultaneous page requests, but never cache a successful preflight.
      pending ??= inspection();
      const json = await pending;
      if (req.url === "/inspection.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(json);
        return;
      }
      const result = JSON.parse(json);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Avroqen deployment preview</title><link rel="stylesheet" href="/style.css"></head><body><main>
<h1>MandateVault deployment preview</h1>
<section class="warning"><h2>Preview only — wallet invocation unavailable</h2><p>This page cannot sign, broadcast, connect a wallet or change keys. No deployment is authorized.</p><p><strong>${live ? "Read-only Testnet observation" : "Offline historical preview — not current chain readiness"}</strong>. The observation is point-in-time only; reload for another check. It never authorizes a later transaction.</p></section>
<section><h2>Exact proposed transaction</h2><dl><dt>Network</dt><dd>NEAR Testnet</dd><dt>Signer and receiver</dt><dd>${ACCOUNT}</dd><dt>Action 1</dt><dd>DeployContract — 366,735 approved bytes</dd><dt>Action 2</dt><dd>FunctionCall new({"network":"testnet"})</dd><dt>Initialization gas</dt><dd>100 Tgas (100000000000000 gas)</dd><dt>Attached deposit</dt><dd>0 yoctoNEAR</dd></dl><p>One atomic transaction in this order. No other actions. A nonce and signing block hash have not been prepared.</p></section>
<section class="warning"><h2>Wallet compatibility remains blocked</h2><p>SDK serialization is testable offline. Meteor's actual large-payload transport and transparent review have not been verified. There is no wallet button on this page.</p><p>The retained FullAccess key permits contract replacement and transfers outside MandateVault restrictions. Keep the key inside Meteor; never export it here.</p></section>
<section><h2>Exact inspection evidence</h2><p>Amounts below are integer yoctoNEAR. Storage, reserve, gas ceiling and safety margin are separate. Historical observations are not deployment receipts.</p><pre>${escapeHtml(json)}</pre></section>
<p><a href="/">Refresh read-only inspection</a> · <a href="/inspection.json">View public inspection JSON</a></p><p>Observed: ${escapeHtml(result.observation.observedAtUtc)}. No signature or signed transaction exists in this preview.</p>
</main></body></html>`);
    } catch {
      res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<!doctype html><html lang="en"><title>Preview blocked</title><h1>Preview blocked</h1><p>Artifact, account, network, key, backing or RPC checks failed. No wallet action is available. Inspect the documented stop conditions; do not bypass validation.</p></html>',
      );
    } finally {
      pending = undefined;
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--live-read-only"))
    throw new Error(
      "Use no arguments for offline preview, or --live-read-only",
    );
  createReviewer(args[0] === "--live-read-only").listen(3456, "127.0.0.1", () =>
    console.log(
      "Preview only: http://127.0.0.1:3456 — no wallet invocation available",
    ),
  );
}
