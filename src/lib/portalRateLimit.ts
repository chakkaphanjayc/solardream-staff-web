import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/db";

export function getPortalClientAddress(headers: Headers) {
  return (headers.get("x-forwarded-for")?.split(",")[0] || headers.get("x-real-ip") || "unknown").trim();
}

export async function enforcePortalRateLimit(input: {
  namespace: string;
  identity: string;
  limit: number;
  windowSeconds: number;
}) {
  const key = createHash("sha256")
    .update(`${input.namespace}:${input.identity}`)
    .digest("hex");
  const result = await db.execute<{ request_count: number; expires_at: Date }>(sql`
    INSERT INTO portal_rate_limits (key, window_started_at, request_count, expires_at, updated_at)
    VALUES (
      ${key}, now(), 1,
      now() + (${input.windowSeconds} * interval '1 second'), now()
    )
    ON CONFLICT (key) DO UPDATE SET
      window_started_at = CASE
        WHEN portal_rate_limits.expires_at <= now() THEN now()
        ELSE portal_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN portal_rate_limits.expires_at <= now() THEN 1
        ELSE portal_rate_limits.request_count + 1
      END,
      expires_at = CASE
        WHEN portal_rate_limits.expires_at <= now()
          THEN now() + (${input.windowSeconds} * interval '1 second')
        ELSE portal_rate_limits.expires_at
      END,
      updated_at = now()
    RETURNING request_count, expires_at
  `);
  const row = result[0];
  if (!row) throw new Error("Portal rate limit could not be evaluated.");
  return {
    allowed: Number(row.request_count) <= input.limit,
    remaining: Math.max(0, input.limit - Number(row.request_count)),
    resetAt: new Date(row.expires_at),
  };
}
