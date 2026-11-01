import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Scan the reviewable source tree, including untracked work, not ignored local secrets.
const snapshot = mkdtempSync(join(tmpdir(), "avroqen-source-scan-"));
try {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const file of new Set(files)) {
    const destination = join(snapshot, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(file, destination, { dereference: false });
  }
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--network=none",
      "-v",
      `${snapshot}:/scan:ro`,
      "ghcr.io/gitleaks/gitleaks:v8.30.0@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9",
      "dir",
      "/scan",
      "--redact",
      "--no-banner",
    ],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}
