import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

for (const service of ["api", "web", "worker"]) {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      service,
      "node",
      "-e",
      "const fs=require('node:fs'); if(process.getuid()===0 || fs.existsSync('/app/.env') || fs.existsSync('/app/.git') || fs.existsSync('/app/.local')) process.exit(1); console.log('Isolated non-root process');",
    ],
    { encoding: "utf8" },
  );
  assert.match(output, /Isolated non-root process/);
}
console.info(
  "Web/API/worker run non-root; local environment and Git metadata are absent from images.",
);
