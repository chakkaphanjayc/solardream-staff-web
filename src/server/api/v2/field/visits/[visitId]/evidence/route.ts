import { NextRequest, NextResponse } from "next/server";

import { validateUploadContentLength } from "@/lib/fileValidation";
import { parseCapturedAt, parseMultipartCoordinate, techIdempotencyKeySchema, techOperationSourceSchema, techPhaseSchema } from "@/lib/techPortalDtos";
import { getTechPortalFailure, getTechnicianAccessError, TechPortalError, uploadTechnicianEvidence } from "@/lib/techPortal";
import { getTechnicianVisitTaskAccess } from "@/lib/techPortalAccess";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest, context: { params: Promise<{ visitId: string }> }) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
  if (featureResponse) return featureResponse;
  const contentLength = validateUploadContentLength(request.headers, MAX_UPLOAD_BYTES + 512 * 1024);
  if (!contentLength.ok) return NextResponse.json({ success: false, error: contentLength.error }, { status: contentLength.status });
  try {
    const { visitId } = await context.params;
    const form = await request.formData();
    const phase = techPhaseSchema.parse(String(form.get("phase") || "").trim());
    const source = techOperationSourceSchema.catch("PWA_ONLINE").parse(String(form.get("source") || "PWA_ONLINE").trim());
    const idempotencyKey = techIdempotencyKeySchema.parse(request.headers.get("idempotency-key")?.trim() || String(form.get("idempotencyKey") || "").trim());
    const file = form.get("file");
    if (!(file instanceof File)) throw new TechPortalError("A QC image is required.", 400);
    let latitude: number | null;
    let longitude: number | null;
    let capturedAt: string;
    try {
      latitude = parseMultipartCoordinate(form.get("latitude"), -90, 90);
      longitude = parseMultipartCoordinate(form.get("longitude"), -180, 180);
      capturedAt = parseCapturedAt(form.get("capturedAt"));
    } catch {
      throw new TechPortalError("Valid GPS coordinates and capture time are required.", 400);
    }
    if (latitude === null || longitude === null) throw new TechPortalError("GPS coordinates are required for QC evidence.", 400);
    const accessResult = await getTechnicianVisitTaskAccess(visitId, ["IN_PROGRESS"]);
    if (accessResult.kind !== "OK") {
      const failure = getTechnicianAccessError(accessResult);
      return NextResponse.json({ success: false, error: failure?.error || "Technician access denied." }, { status: failure?.status || 403 });
    }
    const result = await uploadTechnicianEvidence({
      access: accessResult.access,
      phase,
      idempotencyKey,
      file,
      gps: { latitude, longitude, capturedAt },
      source,
    });
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const failure = getTechPortalFailure(error, "QC evidence could not be uploaded.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
