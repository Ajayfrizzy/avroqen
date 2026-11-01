import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// This is a disposable local PostgreSQL password, never a wallet credential.
const template = readFileSync(
  new URL("../.env.example", import.meta.url),
  "utf8",
);
try {
  writeFileSync(
    new URL("../.env", import.meta.url),
    template.replace(
      "REPLACE_WITH_LOCAL_ONLY_PASSWORD",
      randomBytes(32).toString("hex"),
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.info(
    "Created ignored local database configuration; no blockchain credentials generated.",
  );
} catch (error) {
  if (error.code === "EEXIST") console.info("Existing .env preserved.");
  else throw new Error("Unable to create local configuration");
}
