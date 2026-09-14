import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasValidBearerToken } from "@/lib/secretAuth";
import { enqueueCatalogSync } from "@/server/services/sales/catalog/sync/catalog-sync-events";
export async function GET(request: NextRequest) {
  return handle(request, "SCHEDULED");
}
export async function POST(request: NextRequest) {
  return handle(request, "MANUAL");
}
async function handle(request: NextRequest, trigger: "SCHEDULED" | "MANUAL") {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Catalog sync is not configured." },
      { status: 503 },
    );
  if (!hasValidBearerToken(request.headers.get("authorization"), secret))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const eventId =
    request.headers.get("x-event-id")?.trim().slice(0, 200) || randomUUID();
  await enqueueCatalogSync({
    eventId,
    trigger,
    requestedAt: new Date().toISOString(),
  });
  return NextResponse.json({ accepted: true, eventId }, { status: 202 });
}
