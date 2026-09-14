import { NextRequest, NextResponse } from "next/server";

import { getBodyIdempotencyKey, startJobSchema } from "@/lib/techPortalDtos";
import { getTechnicianTaskAccess } from "@/lib/techPortalAccess";
import { getTechPortalFailure, getTechnicianAccessError, startTechnicianJob } from "@/lib/techPortal";

export async function POST(request: NextRequest) {
  const rawBody = await request.json().catch(() => null);
  const parsed = startJobSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "The JSA, GPS, and task payload is invalid." }, { status: 400 });
  }

  try {
    const idempotencyKey = getBodyIdempotencyKey(parsed.data, request.headers.get("idempotency-key"));
    const accessResult = await getTechnicianTaskAccess(parsed.data.taskId, ["OPEN", "IN_PROGRESS"], parsed.data.fieldVisitId || undefined);
    if (accessResult.kind !== "OK") {
      const failure = getTechnicianAccessError(accessResult);
      return NextResponse.json({ success: false, error: failure?.error || "Technician access denied." }, { status: failure?.status || 403 });
    }
    const result = await startTechnicianJob({
      access: accessResult.access,
      checks: parsed.data.checks,
      preflightVersion: parsed.data.preflightVersion,
      gps: parsed.data.gps,
      idempotencyKey,
      source: parsed.data.source,
    });
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("[Technician Portal Start Job] Failed to start task.", error);
    const failure = getTechPortalFailure(error, "The technician job could not be started.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
