import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

function normalizeConnectionString(value: string) {
  try {
    const url = new URL(value);
    if (
      process.env.NODE_ENV === "production" &&
      url.hostname.includes(".pooler.supabase.com") &&
      url.port === "5432"
    ) {
      url.port = "6543";
      return url.toString();
    }
  } catch {
    // Fall back to the original string if it is not a standard URL.
  }

  return value;
}

// Global variable cache to prevent multiple client instances in development HMR
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const client = connectionString
  ? globalForDb.conn ??
    postgres(normalizeConnectionString(connectionString), {
      max: process.env.NODE_ENV === "production" ? 10 : 3,
      prepare: false,
      // Explicitly set search_path to avoid schema resolution failures
      // when connecting through Supabase Supavisor (transaction-mode pooler).
      connection: { search_path: "public" },
    })
  : null;
if (client && process.env.NODE_ENV !== "production") globalForDb.conn = client;

const database = client ? drizzle(client, { schema }) : null;
const missingDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error("DATABASE_URL is not set");
    },
  },
);

// Server modules are imported during Next's build. Keep database construction
// runtime-only while preserving a strongly typed database API for callers.
export const db = (database ?? missingDatabase) as NonNullable<typeof database>;
