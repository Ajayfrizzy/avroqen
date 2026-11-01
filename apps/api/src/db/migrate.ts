import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";

export async function migrate(
  pool: pg.Pool,
  directory = new URL("../../../../db/migrations/", import.meta.url),
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(413001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())",
    );
    const names = (await readdir(directory))
      .filter((name) => /^\d+_[a-z_]+\.sql$/.test(name))
      .sort();
    const existing = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations",
    );
    if (existing.rows.some((row) => !names.includes(row.name)))
      throw new Error("Unknown applied migration");
    for (const name of names) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = existing.rows.find((row) => row.name === name);
      if (applied) {
        if (applied.checksum !== checksum)
          throw new Error("Applied migration checksum mismatch");
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1,$2)",
        [name, checksum],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
