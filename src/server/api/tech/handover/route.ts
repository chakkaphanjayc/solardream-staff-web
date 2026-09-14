import { NextRequest, NextResponse } from "next/server";

import { getBodyIdempotencyKey, handoverSchema } from "@/lib/techPortalDtos";
import { getTechnicianTaskAccess } from "@/lib/techPortalAccess";
import { completeTechnicianHandover, getTechPortalFailure, getTechnicianAccessError } from "@/lib/techPortal";

export async function POST(request: NextRequest) {
  const parsed = handoverSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "The customer signature, GPS, or handover payload is invalid." }, { status: 400 });
  }

  try {
    const idempotencyKey = getBodyIdempotencyKey(parsed.data, request.headers.get("idempotency-key"));
    const accessResult = await getTechnicianTaskAccess(parsed.data.taskId, ["IN_PROGRESS", "COMPLETED"], parsed.data.fieldVisitId || undefined);
    if (accessResult.kind !== "OK") {
      const failure = getTechnicianAccessError(accessResult);
      return NextResponse.json({ success: false, error: failure?.error || "Technician access denied." }, { status: failure?.status || 403 });
    }
    const result = await completeTechnicianHandover({
      access: accessResult.access,
      signatureBase64: parsed.data.signatureBase64,
      gps: parsed.data.gps,
      notes: parsed.data.notes,
      idempotencyKey,
      requestHeaders: request.headers,
      source: parsed.data.source,
    });
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("[Technician Portal Handover] Failed to finalize handover.", error);
    const failure = getTechPortalFailure(error, "The handover could not be finalized.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
