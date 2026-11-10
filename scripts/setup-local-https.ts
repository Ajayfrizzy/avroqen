import { execFileSync } from "node:child_process";
import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  X509Certificate,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DAY_MS = 24 * 60 * 60 * 1000;
const LEAF_DAYS = 7;
const ACTIVE_LEAF = "active-leaf";
const VERSION = /^leaf-[0-9]+-[0-9a-f]{16}$/;
const LEAF_CONFIG = `[server]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:127.0.0.1
authorityKeyIdentifier=keyid,issuer
`;

export interface LeafPaths {
  certificate: string;
  key: string;
  version: string | null;
}
export interface RenewalOptions {
  now?: Date;
  ensureProxyStopped?: () => Promise<void>;
  candidateMutator?: (paths: LeafPaths) => void;
  failAt?: "before-publication" | "after-publication";
}

function openssl(args: string[], capture = false) {
  try {
    return execFileSync("openssl", args, {
      encoding: capture ? "utf8" : undefined,
      stdio: capture ? ["ignore", "pipe", "ignore"] : "ignore",
    });
  } catch {
    throw new Error(
      "Local TLS certificate operation failed; inspect prerequisites and certificate metadata, not private keys.",
    );
  }
}

function mode(path: string) {
  return lstatSync(path).mode & 0o777;
}
function regular(path: string, expectedMode: number) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || mode(path) !== expectedMode)
    throw new Error("Unsafe local TLS file state");
}
function directory(path: string) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || mode(path) !== 0o700)
    throw new Error("Unsafe local TLS directory state");
}
function cert(path: string) {
  try {
    return new X509Certificate(readFileSync(path));
  } catch {
    throw new Error("Invalid local TLS certificate");
  }
}
function publicDerFromPrivate(path: string) {
  try {
    return createPublicKey(createPrivateKey(readFileSync(path))).export({
      format: "der",
      type: "spki",
    });
  } catch {
    throw new Error("Invalid local TLS private key");
  }
}
function paired(certificate: X509Certificate, keyPath: string) {
  const publicDer = certificate.publicKey.export({
    format: "der",
    type: "spki",
  });
  if (!publicDer.equals(publicDerFromPrivate(keyPath)))
    throw new Error("Local TLS certificate and key do not match");
}
function text(path: string) {
  return String(openssl(["x509", "-in", path, "-noout", "-text"], true));
}
function dates(certificate: X509Certificate) {
  const from = Date.parse(certificate.validFrom);
  const to = Date.parse(certificate.validTo);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
    throw new Error("Invalid local TLS certificate dates");
  return { from, to };
}
function validateCa(
  directoryPath: string,
  now: Date,
  minimumRemainingMs: number,
) {
  directory(directoryPath);
  const certificatePath = join(directoryPath, "root-ca.crt");
  const keyPath = join(directoryPath, "root-ca.key");
  regular(certificatePath, 0o644);
  regular(keyPath, 0o600);
  const certificate = cert(certificatePath);
  const { from, to } = dates(certificate);
  const at = now.getTime();
  if (at < from || at >= to || to - at < minimumRemainingMs)
    throw new Error("Local TLS CA is expired or too near expiry");
  if (
    !certificate.ca ||
    certificate.subject !== certificate.issuer ||
    !certificate.verify(certificate.publicKey)
  )
    throw new Error("Invalid local TLS CA identity");
  const details = text(certificatePath);
  if (
    !/X509v3 Basic Constraints: critical\s+CA:TRUE, pathlen:0/.test(details) ||
    !/X509v3 Key Usage: critical\s+Certificate Sign, CRL Sign/.test(details)
  )
    throw new Error("Invalid local TLS CA extensions");
  paired(certificate, keyPath);
  return { certificate, certificatePath, keyPath, notAfter: to };
}

export function resolveLeafPaths(
  directoryPath = resolve(".local/https"),
): LeafPaths {
  directory(directoryPath);
  const active = join(directoryPath, ACTIVE_LEAF);
  if (!existsSync(active))
    return {
      certificate: join(directoryPath, "server.crt"),
      key: join(directoryPath, "server.key"),
      version: null,
    };
  regular(active, 0o600);
  const version = readFileSync(active, "utf8").trim();
  if (!VERSION.test(version)) throw new Error("Invalid active local TLS leaf");
  const leaves = join(directoryPath, "leaves");
  const versionPath = join(leaves, version);
  directory(leaves);
  directory(versionPath);
  return {
    certificate: join(versionPath, "server.crt"),
    key: join(versionPath, "server.key"),
    version,
  };
}

function validateLeaf(
  directoryPath: string,
  paths: LeafPaths,
  now: Date,
  minimumRemainingMs: number,
  expectedMaximumMs?: number,
) {
  regular(paths.certificate, 0o644);
  regular(paths.key, 0o600);
  const ca = validateCa(directoryPath, now, minimumRemainingMs);
  const certificate = cert(paths.certificate);
  const { from, to } = dates(certificate);
  const at = now.getTime();
  if (
    certificate.ca ||
    certificate.issuer !== ca.certificate.subject ||
    !certificate.verify(ca.certificate.publicKey) ||
    at < from ||
    at >= to ||
    to - at < minimumRemainingMs ||
    to > ca.notAfter
  )
    throw new Error("Invalid or expired local TLS leaf");
  if (expectedMaximumMs !== undefined) {
    const duration = to - from;
    if (
      duration < expectedMaximumMs - 5 * 60 * 1000 ||
      duration > expectedMaximumMs
    )
      throw new Error("Unexpected local TLS leaf validity");
  }
  const details = text(paths.certificate);
  if (
    !/X509v3 Basic Constraints: critical\s+CA:FALSE/.test(details) ||
    !/X509v3 Key Usage: critical\s+Digital Signature, Key Encipherment/.test(
      details,
    ) ||
    !/X509v3 Extended Key Usage:\s+TLS Web Server Authentication/.test(
      details,
    ) ||
    !/X509v3 Subject Alternative Name:\s+IP Address:127\.0\.0\.1(?:\s|$)/.test(
      details,
    ) ||
    certificate.subjectAltName !== "IP Address:127.0.0.1"
  )
    throw new Error("Invalid local TLS leaf extensions");
  paired(certificate, paths.key);
  openssl([
    "verify",
    "-purpose",
    "sslserver",
    "-verify_ip",
    "127.0.0.1",
    "-CAfile",
    ca.certificatePath,
    paths.certificate,
  ]);
  return certificate;
}

function createInitialCertificates(directoryPath: string) {
  mkdirSync(dirname(directoryPath), { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(`${directoryPath}-`);
  chmodSync(staging, 0o700);
  try {
    writeFileSync(
      join(staging, "ca.cnf"),
      `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Avroqen local acceptance CA\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`,
      { mode: 0o600 },
    );
    writeFileSync(join(staging, "leaf.cnf"), LEAF_CONFIG, { mode: 0o600 });
    openssl([
      "req",
      "-x509",
      "-newkey",
      "rsa:3072",
      "-nodes",
      "-sha256",
      "-days",
      "30",
      "-config",
      join(staging, "ca.cnf"),
      "-keyout",
      join(staging, "root-ca.key"),
      "-out",
      join(staging, "root-ca.crt"),
    ]);
    openssl([
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-sha256",
      "-subj",
      "/CN=127.0.0.1",
      "-keyout",
      join(staging, "server.key"),
      "-out",
      join(staging, "server.csr"),
    ]);
    openssl([
      "x509",
      "-req",
      "-in",
      join(staging, "server.csr"),
      "-CA",
      join(staging, "root-ca.crt"),
      "-CAkey",
      join(staging, "root-ca.key"),
      "-set_serial",
      `0x${randomBytes(16).toString("hex")}`,
      "-days",
      String(LEAF_DAYS),
      "-sha256",
      "-extfile",
      join(staging, "leaf.cnf"),
      "-extensions",
      "server",
      "-out",
      join(staging, "server.crt"),
    ]);
    chmodSync(join(staging, "root-ca.key"), 0o600);
    chmodSync(join(staging, "root-ca.crt"), 0o644);
    chmodSync(join(staging, "server.key"), 0o600);
    chmodSync(join(staging, "server.crt"), 0o644);
    unlinkSync(join(staging, "server.csr"));
    validateLeaf(
      staging,
      {
        certificate: join(staging, "server.crt"),
        key: join(staging, "server.key"),
        version: null,
      },
      new Date(),
      DAY_MS,
    );
    renameSync(staging, directoryPath);
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}

export function setupCertificates(directoryPath = resolve(".local/https")) {
  if (!existsSync(directoryPath)) createInitialCertificates(directoryPath);
  else {
    const now = new Date();
    validateCa(directoryPath, now, DAY_MS);
    validateLeaf(directoryPath, resolveLeafPaths(directoryPath), now, DAY_MS);
  }
}

async function proxyStopped() {
  const server = createServer();
  try {
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(8443, "127.0.0.1", resolveListen);
    });
  } catch {
    throw new Error("Stop the local HTTPS proxy before renewing its leaf");
  } finally {
    if (server.listening)
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
  }
}

function publishPointer(directoryPath: string, value: Buffer) {
  const temporary = join(
    directoryPath,
    `.active-leaf-${randomBytes(8).toString("hex")}`,
  );
  try {
    writeFileSync(temporary, value, { mode: 0o600, flag: "wx" });
    chmodSync(temporary, 0o600);
    renameSync(temporary, join(directoryPath, ACTIVE_LEAF));
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

export async function renewLeafCertificate(
  directoryPath = resolve(".local/https"),
  options: RenewalOptions = {},
) {
  const now = options.now ?? new Date();
  await (options.ensureProxyStopped ?? proxyStopped)();
  const ca = validateCa(directoryPath, now, (LEAF_DAYS + 1) * DAY_MS);
  const caCertificateBefore = readFileSync(ca.certificatePath);
  const caKeyBefore = readFileSync(ca.keyPath);
  // The old leaf may be expired, but its paths must still be safe and paired.
  const previous = resolveLeafPaths(directoryPath);
  regular(previous.certificate, 0o644);
  regular(previous.key, 0o600);
  paired(cert(previous.certificate), previous.key);

  const leaves = join(directoryPath, "leaves");
  if (!existsSync(leaves)) mkdirSync(leaves, { mode: 0o700 });
  directory(leaves);
  const staging = mkdtempSync(join(leaves, ".staging-"));
  chmodSync(staging, 0o700);
  const version = `leaf-${Date.now()}-${randomBytes(8).toString("hex")}`;
  const published = join(leaves, version);
  const active = join(directoryPath, ACTIVE_LEAF);
  const previousPointer = existsSync(active) ? readFileSync(active) : null;
  let pointerPublished = false;
  try {
    const keyPath = join(staging, "server.key");
    const csrPath = join(staging, "server.csr");
    const certificatePath = join(staging, "server.crt");
    const configPath = join(staging, "leaf.cnf");
    writeFileSync(configPath, LEAF_CONFIG, { mode: 0o600 });
    openssl([
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-sha256",
      "-subj",
      "/CN=127.0.0.1",
      "-keyout",
      keyPath,
      "-out",
      csrPath,
    ]);
    openssl([
      "x509",
      "-req",
      "-in",
      csrPath,
      "-CA",
      ca.certificatePath,
      "-CAkey",
      ca.keyPath,
      "-set_serial",
      `0x${randomBytes(16).toString("hex")}`,
      "-days",
      String(LEAF_DAYS),
      "-sha256",
      "-extfile",
      configPath,
      "-extensions",
      "server",
      "-out",
      certificatePath,
    ]);
    chmodSync(keyPath, 0o600);
    chmodSync(certificatePath, 0o644);
    unlinkSync(csrPath);
    unlinkSync(configPath);
    const candidate = { certificate: certificatePath, key: keyPath, version };
    options.candidateMutator?.(candidate);
    const issuedAt = options.now ?? new Date();
    validateLeaf(
      directoryPath,
      candidate,
      issuedAt,
      6 * DAY_MS,
      LEAF_DAYS * DAY_MS,
    );
    if (
      !caCertificateBefore.equals(readFileSync(ca.certificatePath)) ||
      !caKeyBefore.equals(readFileSync(ca.keyPath))
    )
      throw new Error("Local TLS CA changed during renewal");
    renameSync(staging, published);
    if (options.failAt === "before-publication")
      throw new Error("Injected pre-publication failure");
    publishPointer(directoryPath, Buffer.from(`${version}\n`));
    pointerPublished = true;
    if (options.failAt === "after-publication")
      throw new Error("Injected post-publication failure");
    const selected = resolveLeafPaths(directoryPath);
    validateLeaf(
      directoryPath,
      selected,
      options.now ?? new Date(),
      6 * DAY_MS,
      LEAF_DAYS * DAY_MS,
    );
    if (
      !caCertificateBefore.equals(readFileSync(ca.certificatePath)) ||
      !caKeyBefore.equals(readFileSync(ca.keyPath))
    )
      throw new Error("Local TLS CA changed during publication");
    return selected;
  } catch (error) {
    if (pointerPublished) {
      if (previousPointer) publishPointer(directoryPath, previousPointer);
      else rmSync(active, { force: true });
    }
    if (existsSync(published))
      rmSync(published, { recursive: true, force: true });
    throw error;
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length === 3 && process.argv[2] === "--renew-leaf") {
    await renewLeafCertificate();
    console.info(
      "Local TLS leaf renewed for seven days; existing CA preserved and no trust store changed.",
    );
  } else if (process.argv.length === 2) {
    setupCertificates();
    console.info(
      "Local TLS certificates are valid in ignored .local/https. No trust store was modified.",
    );
  } else {
    throw new Error("Use setup:https or renew:https");
  }
}
