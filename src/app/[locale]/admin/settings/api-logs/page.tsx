import { desc } from "drizzle-orm";

import { db } from "@/db";
import { apiLogs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import ApiLogsClient, { type ApiLogRow } from "./ApiLogsClient";


function getDatabaseErrorCode(error: unknown) {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === "string" ? cause.code : null;
}

async function getApiLogRows() {
  try {
    return await db.query.apiLogs.findMany({
      orderBy: [desc(apiLogs.createdAt)],
      limit: 250,
    });
  } catch (error) {
    const code = getDatabaseErrorCode(error);
    const message = error instanceof Error ? error.message : String(error);

    if (code === "42P01" || message.includes("api_logs")) {
      console.warn("[API Logs] api_logs table is not available yet. Returning an empty ledger.");
      return [];
    }

    throw error;
  }
}

export default async function AdminApiLogsPage() {
  await requireAdmin();

  const rows = await getApiLogRows();

  const logs: ApiLogRow[] = rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    sourceSystem: row.sourceSystem,
    endpoint: row.endpoint,
    method: row.method,
    statusCode: row.statusCode,
    requestHeaders: row.requestHeaders,
    requestBody: row.requestBody,
    responseBody: row.responseBody,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  }));

  return <ApiLogsClient logs={logs} />;
}
