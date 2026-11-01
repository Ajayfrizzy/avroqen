import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--network=none",
    "-v",
    `${resolve(".github/workflows")}:/workflows:ro`,
    "rhysd/actionlint:1.7.7@sha256:887a259a5a534f3c4f36cb02dca341673c6089431057242cdc931e9f133147e9",
    "/workflows/ci.yml",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
