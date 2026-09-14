import { NextRequest, NextResponse } from "next/server";

import { getTechnicianAccessError } from "@/lib/techPortal";
import { getTechnicianVisitTaskAccess } from "@/lib/techPortalAccess";
import { requireOpsV2Feature, opsErrorResponse } from "@/server/services/ops-v2/api-response";
import { lookupInstalledAssetSerial } from "@/server/services/ops-v2/asset-warranty-service";

export async function GET(
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
  try {
    const data = await lookupInstalledAssetSerial(
      accessResult.access.actor,
      request.nextUrl.searchParams.get("serial") || "",
    );
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
