import { NextRequest, NextResponse } from "next/server";

import { getBodyIdempotencyKey, qcCompleteSchema } from "@/lib/techPortalDtos";
import { getTechnicianTaskAccess } from "@/lib/techPortalAccess";
import { completeTechnicianQc, getTechPortalFailure, getTechnicianAccessError } from "@/lib/techPortal";

export async function POST(request: NextRequest) {
  const parsed = qcCompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "The QC phase payload is invalid." }, { status: 400 });
  }

  try {
    const idempotencyKey = getBodyIdempotencyKey(parsed.data, request.headers.get("idempotency-key"));
    const accessResult = await getTechnicianTaskAccess(parsed.data.taskId, ["IN_PROGRESS"], parsed.data.fieldVisitId || undefined);
    if (accessResult.kind !== "OK") {
      const failure = getTechnicianAccessError(accessResult);
      return NextResponse.json({ success: false, error: failure?.error || "Technician access denied." }, { status: failure?.status || 403 });
    }
    const result = await completeTechnicianQc({
      access: accessResult.access,
      phase: parsed.data.phase,
      testValues: parsed.data.testValues,
      evidenceIds: parsed.data.evidenceIds,
      idempotencyKey,
      source: parsed.data.source,
    });
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("[Technician Portal QC Complete] Failed to complete phase.", error);
    const failure = getTechPortalFailure(error, "The QC phase could not be completed.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
