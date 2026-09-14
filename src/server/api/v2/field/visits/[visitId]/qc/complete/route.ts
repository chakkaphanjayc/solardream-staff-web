import { NextRequest, NextResponse } from "next/server";

import { getBodyIdempotencyKey, qcCompleteSchema } from "@/lib/techPortalDtos";
import { completeTechnicianQc, getTechPortalFailure, getTechnicianAccessError } from "@/lib/techPortal";
import { getTechnicianVisitTaskAccess } from "@/lib/techPortalAccess";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";

export async function POST(request: NextRequest, context: { params: Promise<{ visitId: string }> }) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
  if (featureResponse) return featureResponse;
  const { visitId } = await context.params;
  const rawBody = await request.json().catch(() => null);
  const accessResult = await getTechnicianVisitTaskAccess(visitId, ["IN_PROGRESS"]);
  if (accessResult.kind !== "OK") {
    const failure = getTechnicianAccessError(accessResult);
    return NextResponse.json({ success: false, error: failure?.error || "Technician access denied." }, { status: failure?.status || 403 });
  }
  const parsed = qcCompleteSchema.safeParse({ ...(rawBody && typeof rawBody === "object" ? rawBody : {}), taskId: accessResult.access.task.id });
  if (!parsed.success) return NextResponse.json({ success: false, error: "The QC phase payload is invalid." }, { status: 400 });
  try {
    const result = await completeTechnicianQc({
      access: accessResult.access,
      phase: parsed.data.phase,
      testValues: parsed.data.testValues,
      evidenceIds: parsed.data.evidenceIds,
      idempotencyKey: getBodyIdempotencyKey(parsed.data, request.headers.get("idempotency-key")),
      source: parsed.data.source,
    });
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const failure = getTechPortalFailure(error, "The QC phase could not be completed.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
