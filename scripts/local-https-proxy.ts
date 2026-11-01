import { readFileSync } from "node:fs";
import { type IncomingHttpHeaders, request } from "node:http";
import { createServer } from "node:https";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createLocalProxy(directory: string, upstreamPort = 3000) {
  const server = createServer(
    {
      key: readFileSync(`${directory}/server.key`),
      cert: readFileSync(`${directory}/server.crt`),
      minVersion: "TLSv1.2",
      requestTimeout: 15000,
      headersTimeout: 10000,
    },
    (incoming, outgoing) => {
      if (incoming.headers.host !== "127.0.0.1:8443") {
        outgoing.writeHead(421).end("Unexpected local host");
        return;
      }
      if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {
        outgoing.writeHead(400).end("Invalid local request");
        return;
      }
      const headers: IncomingHttpHeaders = {
        ...incoming.headers,
        host: `127.0.0.1:${upstreamPort}`,
      };
      // Fixed loopback upstream; never honor client-supplied proxy routing headers.
      for (const name of Object.keys(headers))
        if (name === "forwarded" || name.startsWith("x-forwarded-"))
          delete headers[name];
      const upstream = request(
        {
          hostname: "127.0.0.1",
          port: upstreamPort,
          path: incoming.url,
          method: incoming.method,
          headers,
          timeout: 10000,
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.on("error", () => outgoing.destroy());
          response.pipe(outgoing);
        },
      );
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => {
        if (!outgoing.headersSent)
          outgoing
            .writeHead(502, {
              "Content-Type": "text/plain",
              "Cache-Control": "no-store",
            })
            .end("Local upstream unavailable");
        else outgoing.destroy();
      });
      incoming.on("aborted", () => upstream.destroy());
      incoming.on("error", () => upstream.destroy());
      outgoing.on("close", () => upstream.destroy());
      incoming.pipe(upstream);
    },
  );
  server.on("tlsClientError", () => {}); // No raw handshake/client data in logs.
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createLocalProxy(resolve(".local/https"));
  server.listen(8443, "127.0.0.1", () =>
    console.info(
      "Private HTTPS ready at https://127.0.0.1:8443/workspace; USB reverse only, no LAN/public listener.",
    ),
  );
  server.on("error", () => {
    console.error(
      "Private HTTPS could not start; check certificates and loopback port 8443.",
    );
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => server.close());
}
