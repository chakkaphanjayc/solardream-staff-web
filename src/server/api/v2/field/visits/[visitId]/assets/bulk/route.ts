import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getTechnicianAccessError } from "@/lib/techPortal";
import { getTechnicianVisitTaskAccess } from "@/lib/techPortalAccess";
import { opsErrorResponse, requireOpsV2Feature } from "@/server/services/ops-v2/api-response";
import { registerInstalledAssetsBulk } from "@/server/services/ops-v2/asset-warranty-service";

const bulkAssetSchema = z.object({
  productName: z.string().trim().min(1).max(240),
  serialNumbers: z.array(z.string().trim().min(2).max(160)).min(1).max(200),
  catalogProductId: z.string().trim().max(160).optional().nullable(),
  verificationStatus: z.enum(["VERIFIED", "UNVERIFIED"]).optional(),
  installedDate: z.string().datetime({ offset: true }).optional().nullable(),
  productWarrantyProvider: z.string().trim().max(160).optional().nullable(),
  productWarrantyMonths: z.number().int().min(1).max(240).optional().nullable(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

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
  const parsed = bulkAssetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "The bulk asset payload is invalid." } },
      { status: 400 },
    );
  }

  try {
    const data = await registerInstalledAssetsBulk(accessResult.access.actor, {
      ...parsed.data,
      projectId: accessResult.access.project.id,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data }, { status: data.failures.length > 0 ? 207 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
