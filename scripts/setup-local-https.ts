import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function openssl(args: string[]) {
  // Never emit generated key material or OpenSSL diagnostic buffers.
  try {
    execFileSync("openssl", args, { stdio: "ignore" });
  } catch {
    throw new Error(
      "Local TLS certificate operation failed; inspect prerequisites and certificate expiry, not private keys.",
    );
  }
}
export function setupCertificates(directory = resolve(".local/https")) {
  if (existsSync(directory)) {
    openssl([
      "verify",
      "-CAfile",
      `${directory}/root-ca.crt`,
      `${directory}/server.crt`,
    ]);
    openssl([
      "x509",
      "-in",
      `${directory}/server.crt`,
      "-checkend",
      "86400",
      "-noout",
    ]);
    return;
  }
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(`${directory}-`);
  chmodSync(staging, 0o700);
  try {
    writeFileSync(
      `${staging}/ca.cnf`,
      `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Avroqen local acceptance CA\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`,
      { mode: 0o600 },
    );
    writeFileSync(
      `${staging}/leaf.cnf`,
      `[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1\nauthorityKeyIdentifier=keyid,issuer\n`,
      { mode: 0o600 },
    );
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
      `${staging}/ca.cnf`,
      "-keyout",
      `${staging}/root-ca.key`,
      "-out",
      `${staging}/root-ca.crt`,
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
      `${staging}/server.key`,
      "-out",
      `${staging}/server.csr`,
    ]);
    openssl([
      "x509",
      "-req",
      "-in",
      `${staging}/server.csr`,
      "-CA",
      `${staging}/root-ca.crt`,
      "-CAkey",
      `${staging}/root-ca.key`,
      "-CAcreateserial",
      "-days",
      "7",
      "-sha256",
      "-extfile",
      `${staging}/leaf.cnf`,
      "-extensions",
      "server",
      "-out",
      `${staging}/server.crt`,
    ]);
    chmodSync(`${staging}/root-ca.key`, 0o600);
    chmodSync(`${staging}/server.key`, 0o600);
    openssl([
      "verify",
      "-CAfile",
      `${staging}/root-ca.crt`,
      `${staging}/server.crt`,
    ]);
    renameSync(staging, directory);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  setupCertificates();
  console.info(
    "Local TLS certificates ready in ignored .local/https (leaf 7 days, CA 30 days). No trust store was modified. Transfer only root-ca.crt to the test phone.",
  );
}
