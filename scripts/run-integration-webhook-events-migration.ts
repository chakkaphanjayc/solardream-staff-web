import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import "dotenv/config";
import { Client } from "pg";

const name = "0111_integration_webhook_events.sql";
const migrationSql = readFileSync(resolve(process.cwd(), "drizzle", name), "utf8");
const checksum = createHash("sha256").update(migrationSql).digest("hex");
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL is required.");

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["manual-migration:" + name]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS public.app_manual_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const existing = await client.query<{ checksum: string }>(
      "SELECT checksum FROM public.app_manual_migrations WHERE name=$1 FOR UPDATE",
      [name],
    );
    if (existing.rows[0] && existing.rows[0].checksum !== checksum) {
      throw new Error(name + " was already recorded with a different checksum.");
    }
    if (!existing.rows[0]) {
      await client.query(migrationSql);
      await client.query(
        "INSERT INTO public.app_manual_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
    }
    await client.query("COMMIT");
    process.stdout.write(existing.rows[0] ? name + " already applied.\n" : name + " applied and recorded.\n");
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
