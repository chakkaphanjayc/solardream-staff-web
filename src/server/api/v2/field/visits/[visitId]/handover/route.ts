import { NextRequest, NextResponse } from "next/server";

import { getBodyIdempotencyKey, handoverSchema } from "@/lib/techPortalDtos";
import { completeTechnicianHandover, getTechPortalFailure, getTechnicianAccessError } from "@/lib/techPortal";
import { getTechnicianVisitTaskAccess } from "@/lib/techPortalAccess";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";

export async function POST(request: NextRequest, context: { params: Promise<{ visitId: string }> }) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
  if (featureResponse) return featureResponse;
  const { visitId } = await context.params;
  const rawBody = await request.json().catch(() => null);
  const accessResult = await getTechnicianVisitTaskAccess(visitId, ["IN_PROGRESS", "COMPLETED"]);
  if (accessResult.kind !== "OK") {
    const failure = getTechnicianAccessError(accessResult);
    return NextResponse.json({ success: false, error: failure?.error || "Technician access denied." }, { status: failure?.status || 403 });
  }
  const parsed = handoverSchema.safeParse({ ...(rawBody && typeof rawBody === "object" ? rawBody : {}), taskId: accessResult.access.task.id });
  if (!parsed.success) return NextResponse.json({ success: false, error: "The signature, GPS, or handover payload is invalid." }, { status: 400 });
  try {
    const result = await completeTechnicianHandover({
      access: accessResult.access,
      signatureBase64: parsed.data.signatureBase64,
      gps: parsed.data.gps,
      notes: parsed.data.notes,
      idempotencyKey: getBodyIdempotencyKey(parsed.data, request.headers.get("idempotency-key")),
      requestHeaders: request.headers,
      source: parsed.data.source,
    });
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const failure = getTechPortalFailure(error, "The handover could not be finalized.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
