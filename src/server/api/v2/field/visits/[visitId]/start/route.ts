import { NextRequest, NextResponse } from "next/server";

import { getBodyIdempotencyKey, startJobSchema } from "@/lib/techPortalDtos";
import { getTechPortalFailure, getTechnicianAccessError, startTechnicianJob } from "@/lib/techPortal";
import { getTechnicianVisitTaskAccess } from "@/lib/techPortalAccess";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";

export async function POST(request: NextRequest, context: { params: Promise<{ visitId: string }> }) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
  if (featureResponse) return featureResponse;
  const { visitId } = await context.params;
  const rawBody = await request.json().catch(() => null);
  const accessResult = await getTechnicianVisitTaskAccess(visitId, ["OPEN", "IN_PROGRESS"]);
  if (accessResult.kind !== "OK") {
    const failure = getTechnicianAccessError(accessResult);
    return NextResponse.json({ success: false, error: failure?.error || "Technician access denied." }, { status: failure?.status || 403 });
  }
  const parsed = startJobSchema.safeParse({ ...(rawBody && typeof rawBody === "object" ? rawBody : {}), taskId: accessResult.access.task.id });
  if (!parsed.success) return NextResponse.json({ success: false, error: "The JSA, GPS, and visit payload is invalid." }, { status: 400 });
  try {
    const result = await startTechnicianJob({
      access: accessResult.access,
      checks: parsed.data.checks,
      preflightVersion: parsed.data.preflightVersion,
      gps: parsed.data.gps,
      idempotencyKey: getBodyIdempotencyKey(parsed.data, request.headers.get("idempotency-key")),
      source: parsed.data.source,
    });
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const failure = getTechPortalFailure(error, "The field visit could not be started.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
