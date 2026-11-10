import { execFileSync } from "node:child_process";
import { randomBytes, X509Certificate } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  renewLeafCertificate,
  resolveLeafPaths,
  setupCertificates,
} from "../../scripts/setup-local-https.js";

const roots: string[] = [];
const stopped = async () => {};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "avroqen-leaf-test-"));
  roots.push(root);
  const directory = join(root, "https");
  setupCertificates(directory);
  return directory;
}
function openssl(args: string[]) {
  execFileSync("openssl", args, { stdio: "ignore" });
}
function expireLeaf(directory: string) {
  const csr = join(directory, "expired.csr");
  const database = join(directory, "expired-index.txt");
  const newCertificates = join(directory, "expired-certificates");
  const serial = join(directory, "expired-serial");
  const config = join(directory, "expired-ca.cnf");
  const format = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:T]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  mkdirSync(newCertificates, { mode: 0o700 });
  writeFileSync(database, "", { mode: 0o600 });
  writeFileSync(serial, "1000\n", { mode: 0o600 });
  writeFileSync(
    config,
    `[ca]\ndefault_ca=local\n[local]\ndatabase=${database}\nnew_certs_dir=${newCertificates}\ncertificate=${join(directory, "root-ca.crt")}\nprivate_key=${join(directory, "root-ca.key")}\nserial=${serial}\ndefault_md=sha256\npolicy=policy\nx509_extensions=server\nunique_subject=no\n[policy]\ncommonName=supplied\n[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1\nauthorityKeyIdentifier=keyid,issuer\n`,
    { mode: 0o600 },
  );
  openssl([
    "req",
    "-new",
    "-key",
    join(directory, "server.key"),
    "-subj",
    "/CN=127.0.0.1",
    "-out",
    csr,
  ]);
  openssl([
    "ca",
    "-batch",
    "-config",
    config,
    "-startdate",
    format(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
    "-enddate",
    format(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    "-in",
    csr,
    "-out",
    join(directory, "server.crt"),
    "-notext",
  ]);
  chmodSync(join(directory, "server.crt"), 0o644);
  unlinkSync(csr);
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it("reuses an existing valid leaf without changing any trust material", () => {
  const directory = fixture();
  const before = ["root-ca.crt", "root-ca.key", "server.crt", "server.key"].map(
    (name) => readFileSync(join(directory, name)),
  );
  setupCertificates(directory);
  expect(
    ["root-ca.crt", "root-ca.key", "server.crt", "server.key"].map((name) =>
      readFileSync(join(directory, name)),
    ),
  ).toEqual(before);
});

it("renews an expired leaf and preserves the CA byte-for-byte", async () => {
  const directory = fixture();
  expireLeaf(directory);
  const ca = ["root-ca.crt", "root-ca.key"].map((name) =>
    readFileSync(join(directory, name)),
  );
  const oldLeaf = readFileSync(join(directory, "server.crt"));
  const selected = await renewLeafCertificate(directory, {
    ensureProxyStopped: stopped,
  });
  expect(selected.version).toMatch(/^leaf-/);
  expect(readFileSync(selected.certificate)).not.toEqual(oldLeaf);
  expect(
    ["root-ca.crt", "root-ca.key"].map((name) =>
      readFileSync(join(directory, name)),
    ),
  ).toEqual(ca);
});

it("rejects a mismatched CA private key", async () => {
  const directory = fixture();
  const other = fixture();
  copyFileSync(join(other, "root-ca.key"), join(directory, "root-ca.key"));
  chmodSync(join(directory, "root-ca.key"), 0o600);
  await expect(
    renewLeafCertificate(directory, { ensureProxyStopped: stopped }),
  ).rejects.toThrow("do not match");
  expect(resolveLeafPaths(directory).version).toBeNull();
});

it.each([
  ["expired", 1],
  ["near-expiry", -(7 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000)],
] as const)("rejects an %s CA", async (_label, offset) => {
  const directory = fixture();
  const ca = new X509Certificate(readFileSync(join(directory, "root-ca.crt")));
  const now = new Date(Date.parse(ca.validTo) + offset);
  await expect(
    renewLeafCertificate(directory, { ensureProxyStopped: stopped, now }),
  ).rejects.toThrow("expired or too near expiry");
  expect(resolveLeafPaths(directory).version).toBeNull();
});

it("rejects a candidate without the required SAN and TLS extensions", async () => {
  const directory = fixture();
  await expect(
    renewLeafCertificate(directory, {
      ensureProxyStopped: stopped,
      candidateMutator(paths) {
        const csr = join(directory, "bad.csr");
        const config = join(directory, "bad-leaf.cnf");
        writeFileSync(
          config,
          `[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\nauthorityKeyIdentifier=keyid,issuer\n`,
          { mode: 0o600 },
        );
        openssl([
          "req",
          "-new",
          "-key",
          paths.key,
          "-subj",
          "/CN=127.0.0.1",
          "-out",
          csr,
        ]);
        openssl([
          "x509",
          "-req",
          "-in",
          csr,
          "-CA",
          join(directory, "root-ca.crt"),
          "-CAkey",
          join(directory, "root-ca.key"),
          "-set_serial",
          `0x${randomBytes(16).toString("hex")}`,
          "-days",
          "7",
          "-sha256",
          "-extfile",
          config,
          "-extensions",
          "server",
          "-out",
          paths.certificate,
        ]);
        chmodSync(paths.certificate, 0o644);
        unlinkSync(csr);
        unlinkSync(config);
      },
    }),
  ).rejects.toThrow("extensions");
  expect(resolveLeafPaths(directory).version).toBeNull();
});

it("rejects unsafe private-key permissions", async () => {
  const directory = fixture();
  chmodSync(join(directory, "root-ca.key"), 0o644);
  await expect(
    renewLeafCertificate(directory, { ensureProxyStopped: stopped }),
  ).rejects.toThrow("Unsafe local TLS file state");
});

it("rejects missing CA material", async () => {
  const directory = fixture();
  unlinkSync(join(directory, "root-ca.key"));
  await expect(
    renewLeafCertificate(directory, { ensureProxyStopped: stopped }),
  ).rejects.toThrow();
  expect(resolveLeafPaths(directory).version).toBeNull();
});

it("refuses renewal unless the proxy-stopped precondition passes", async () => {
  const directory = fixture();
  await expect(
    renewLeafCertificate(directory, {
      ensureProxyStopped: async () => {
        throw new Error("proxy running");
      },
    }),
  ).rejects.toThrow("proxy running");
  expect(resolveLeafPaths(directory).version).toBeNull();
});

it("rejects symlinked leaf material", async () => {
  const directory = fixture();
  const certificate = join(directory, "server.crt");
  const saved = join(directory, "saved-server.crt");
  copyFileSync(certificate, saved);
  unlinkSync(certificate);
  symlinkSync(saved, certificate);
  await expect(
    renewLeafCertificate(directory, { ensureProxyStopped: stopped }),
  ).rejects.toThrow("Unsafe local TLS file state");
});

it("leaves the previous pair active after failure before publication", async () => {
  const directory = fixture();
  const previous = resolveLeafPaths(directory);
  await expect(
    renewLeafCertificate(directory, {
      ensureProxyStopped: stopped,
      failAt: "before-publication",
    }),
  ).rejects.toThrow("pre-publication");
  expect(resolveLeafPaths(directory)).toEqual(previous);
});

it("atomically restores the previous selection after publication failure", async () => {
  const directory = fixture();
  const previous = resolveLeafPaths(directory);
  await expect(
    renewLeafCertificate(directory, {
      ensureProxyStopped: stopped,
      failAt: "after-publication",
    }),
  ).rejects.toThrow("post-publication");
  expect(resolveLeafPaths(directory)).toEqual(previous);
});

it("publishes a chain-valid seven-day loopback-only leaf", async () => {
  const directory = fixture();
  const selected = await renewLeafCertificate(directory, {
    ensureProxyStopped: stopped,
  });
  const leaf = new X509Certificate(readFileSync(selected.certificate));
  const ca = new X509Certificate(readFileSync(join(directory, "root-ca.crt")));
  const duration = Date.parse(leaf.validTo) - Date.parse(leaf.validFrom);
  expect(duration).toBe(7 * 24 * 60 * 60 * 1000);
  expect(leaf.subjectAltName).toBe("IP Address:127.0.0.1");
  expect(leaf.ca).toBe(false);
  expect(leaf.issuer).toBe(ca.subject);
  expect(leaf.verify(ca.publicKey)).toBe(true);
});
