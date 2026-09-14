import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { DatabaseHealth, HealthStatusResponse } from "@/types/health";


const DB_TIMEOUT_MS = 3000;

async function checkDatabase(): Promise<DatabaseHealth> {
  const start = performance.now();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Database query timed out after ${DB_TIMEOUT_MS}ms`)),
        DB_TIMEOUT_MS,
      );
    });

    const queryPromise = db.execute(sql`SELECT 1`);

    await Promise.race([queryPromise, timeoutPromise]);
    const latencyMs = Math.round(performance.now() - start);

    return {
      status: "connected",
      latencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown database error";
    return {
      status: "error",
      error: errorMessage,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export async function GET() {
  const dbHealth = await checkDatabase();
  const isHealthy = dbHealth.status === "connected";
  const includeDiagnostics =
    process.env.NODE_ENV !== "production" || process.env.HEALTH_DIAGNOSTICS === "true";

  const publicDatabase: HealthStatusResponse["database"] = {
    status: dbHealth.status,
    ...(dbHealth.latencyMs === undefined ? {} : { latencyMs: dbHealth.latencyMs }),
  };

  const responsePayload: HealthStatusResponse = {
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    database: publicDatabase,
    ...(includeDiagnostics
      ? {
          diagnostics: {
            uptimeSeconds: Math.floor(process.uptime()),
            environment: process.env.NODE_ENV ?? "development",
            memory: (() => {
              const memoryUsage = process.memoryUsage();
              return {
                rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
                heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                externalMB: Math.round(memoryUsage.external / 1024 / 1024),
              };
            })(),
            version: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
          },
        }
      : {}),
  };

  return NextResponse.json(responsePayload, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
