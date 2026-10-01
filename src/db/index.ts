import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

type HyperdriveBinding = {
  connectionString?: string;
};

function getRuntimeConnectionString() {
  try {
    const { env } = getCloudflareContext();
    const hyperdriveConnectionString = (env as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE?.connectionString?.trim();
    if (hyperdriveConnectionString) return hyperdriveConnectionString;
  } catch {
    // Local Next.js and unit-test processes do not have a Cloudflare context.
  }

  return connectionString;
}

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

type Database = ReturnType<typeof createDatabase>["drizzle"];

function createDatabase() {
  const runtimeConnectionString = getRuntimeConnectionString();
  if (!runtimeConnectionString) throw new Error("DATABASE_URL or Hyperdrive is not configured");

  const requestContext = getCloudflareRequestContext();

  // A postgres-js client retains request-bound I/O objects under the Workers
  // runtime. Creating it at module scope lets a later request reuse objects
  // owned by an earlier request and produces Cloudflare's "different request"
  // error. Keep each Drizzle operation request-safe; Supavisor pools upstream.
  const client = postgres(normalizeConnectionString(runtimeConnectionString), {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    max_lifetime: 30,
    connection: { search_path: "public" },
  });

  let closed = false;
  return {
    drizzle: drizzle(client, { schema }),
    close: async () => {
      if (closed) return;
      closed = true;
      if (requestContext) return;
      await client.end();
    },
  };
}

function getCloudflareRequestContext(): object | null {
  try {
    const { ctx } = getCloudflareContext();
    return ctx && typeof ctx === "object" ? ctx : null;
  } catch {
    return null;
  }
}

type DatabaseHandle = ReturnType<typeof createDatabase>;
const requestDatabaseCache = new WeakMap<object, DatabaseHandle>();

function getRequestDatabase() {
  const requestContext = getCloudflareRequestContext();
  if (!requestContext) return createDatabase();

  const cached = requestDatabaseCache.get(requestContext);
  if (cached) return cached;

  const created = createDatabase();
  requestDatabaseCache.set(requestContext, created);
  return created;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  ) && typeof Reflect.get(value, "then") === "function";
}

function closeAfterResult<T>(value: T, close: () => Promise<unknown>) {
  if (!isThenable(value)) {
    void close();
    return value;
  }

  const then = Reflect.get(value, "then");
  return new Promise<unknown>((resolve, reject) => {
    Reflect.apply(then, value, [resolve, reject]);
  }).finally(close);
}

function wrapQueryBuilder(value: unknown, close: () => Promise<unknown>): unknown {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return value;

  return new Proxy(value, {
    get(target, property, receiver) {
      if (property === "then") {
        const then = Reflect.get(target, property, receiver);
        if (typeof then !== "function") return then;
        return (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) =>
          closeAfterResult(Reflect.apply(then, target, [resolve, reject]), close);
      }

      const member = Reflect.get(target, property, receiver);
      if (typeof member !== "function") return member;
      return (...args: unknown[]) => wrapQueryBuilder(Reflect.apply(member, target, args), close);
    },
  });
}

function createRelationalQueryProxy(path: readonly PropertyKey[] = []): unknown {
  return new Proxy(() => undefined, {
    get(_target, property) {
      return createRelationalQueryProxy([...path, property]);
    },
    apply(_target, _thisArg, args) {
      const requestDatabase = getRequestDatabase();
      let parent: unknown = requestDatabase.drizzle.query;

      for (const property of path.slice(0, -1)) parent = Reflect.get(parent as object, property);
      const operation = Reflect.get(parent as object, path[path.length - 1]);
      if (typeof operation !== "function") throw new Error("Invalid Drizzle relational query");

      return closeAfterResult(
        Reflect.apply(operation, parent as object, args),
        requestDatabase.close,
      );
    },
  });
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    if (property === "query") return createRelationalQueryProxy();

    const requestDatabase = getRequestDatabase();
    const member = Reflect.get(requestDatabase.drizzle, property);
    if (typeof member !== "function") return member;

    return (...args: unknown[]) => {
      const result = Reflect.apply(member, requestDatabase.drizzle, args);
      return wrapQueryBuilder(result, requestDatabase.close);
    };
  },
});

const RETRYABLE_DATABASE_CODES = new Set([
  "08001",
  "08003",
  "08006",
  "57P01",
  "53300",
  "40001",
  "40P01",
]);

function getDatabaseErrorParts(error: unknown) {
  const candidate = error as { code?: unknown; cause?: unknown } | null;
  const cause = candidate?.cause as { code?: unknown; message?: unknown } | null;
  const message = error instanceof Error ? error.message : String(error);
  const causeMessage = cause && typeof cause.message === "string" ? cause.message : "";
  const code = typeof candidate?.code === "string"
    ? candidate.code
    : cause && typeof cause.code === "string"
      ? cause.code
      : "";

  return { code, message: `${message} ${causeMessage}`.trim() };
}

function isRetryableDatabaseError(error: unknown) {
  const { code, message } = getDatabaseErrorParts(error);
  return RETRYABLE_DATABASE_CODES.has(code) || /connection|connect|timeout|timed out|reset|socket|terminated|fetch failed|too many clients/i.test(message);
}

export function describeDatabaseError(error: unknown) {
  const { code, message } = getDatabaseErrorParts(error);
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: code || undefined,
    // Keep the original server-side message for diagnosis without logging
    // query parameters or credentials separately.
    message,
  };
}

export async function withDatabaseRetry<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !isRetryableDatabaseError(error)) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Database operation failed");
}
