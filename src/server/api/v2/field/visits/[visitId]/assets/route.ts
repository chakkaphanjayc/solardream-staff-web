import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getBodyIdempotencyKey } from "@/lib/techPortalDtos";
import { getTechnicianAccessError } from "@/lib/techPortal";
import { getTechnicianVisitTaskAccess } from "@/lib/techPortalAccess";
import { opsErrorResponse, requireOpsV2Feature } from "@/server/services/ops-v2/api-response";
import { listProjectAssets, registerInstalledAsset } from "@/server/services/ops-v2/asset-warranty-service";

const assetSchema = z.object({
  productName: z.string().trim().min(1).max(240),
  serialNumber: z.string().trim().min(2).max(160),
  catalogProductId: z.string().trim().max(160).optional().nullable(),
  verificationStatus: z.enum(["VERIFIED", "UNVERIFIED"]).optional(),
  installedDate: z.string().datetime({ offset: true }).optional().nullable(),
  productWarrantyProvider: z.string().trim().max(160).optional().nullable(),
  productWarrantyMonths: z.number().int().min(1).max(240).optional().nullable(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ visitId: string }> },
) {
  const fieldFeatureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
  if (fieldFeatureResponse) return fieldFeatureResponse;
  const assetFeatureResponse = await requireOpsV2Feature("OPS_V2_ASSETS");
  if (assetFeatureResponse) return assetFeatureResponse;

  const { visitId } = await context.params;
  const accessResult = await getTechnicianVisitTaskAccess(visitId, ["IN_PROGRESS", "COMPLETED"]);
  if (accessResult.kind !== "OK") {
    const failure = getTechnicianAccessError(accessResult);
    return NextResponse.json(
      { success: false, error: failure?.error || "Technician access denied." },
      { status: failure?.status || 403 },
    );
  }
  try {
    const data = await listProjectAssets(accessResult.access.actor, accessResult.access.project.id);
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ visitId: string }> },
) {
  const fieldFeatureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
  if (fieldFeatureResponse) return fieldFeatureResponse;
  const assetFeatureResponse = await requireOpsV2Feature("OPS_V2_ASSETS");
  if (assetFeatureResponse) return assetFeatureResponse;

  const { visitId } = await context.params;
  const accessResult = await getTechnicianVisitTaskAccess(visitId, ["IN_PROGRESS"]);
  if (accessResult.kind !== "OK") {
    const failure = getTechnicianAccessError(accessResult);
    return NextResponse.json(
      { success: false, error: failure?.error || "Technician access denied." },
      { status: failure?.status || 403 },
    );
  }
  const parsed = assetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "The asset payload is invalid." } },
      { status: 400 },
    );
  }

  try {
    const data = await registerInstalledAsset(accessResult.access.actor, {
      ...parsed.data,
      projectId: accessResult.access.project.id,
      idempotencyKey: getBodyIdempotencyKey(parsed.data, request.headers.get("idempotency-key")),
    });
    return NextResponse.json({ success: true, data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
