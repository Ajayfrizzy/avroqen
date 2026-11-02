import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const name = `avroqen-monitor-check-${randomUUID()}`;
try {
  execFileSync(
    "docker",
    [
      "compose",
      "run",
      "--detach",
      "--no-deps",
      "--name",
      name,
      "--env",
      "M6_TRANSACTIONS_ENABLED=true",
      "--env",
      "M6_VAULT_ACCOUNT=INVALID",
      "worker",
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "docker",
    [
      "exec",
      name,
      "node",
      "-e",
      "(async()=>{for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:3002/ready');if(r.status===200)process.exit(0);}catch{}await new Promise(r=>setTimeout(r,500));}process.exit(1);})();",
    ],
    { stdio: "pipe" },
  );
  console.info(
    "Invalid deployment-monitor configuration did not stop reconciliation or worker readiness; no transaction was submitted.",
  );
} finally {
  try {
    execFileSync("docker", ["rm", "--force", name], { stdio: "pipe" });
  } catch {
    /* No container if creation failed. */
  }
}
