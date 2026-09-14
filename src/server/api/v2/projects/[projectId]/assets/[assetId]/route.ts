import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { resolveInstalledAsset } from "@/server/services/ops-v2/asset-warranty-service";

const resolutionSchema = z.object({
  catalogProductId: z.string().trim().min(1).max(160),
  productName: z.string().trim().max(240).optional().nullable(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; assetId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_ASSETS");
  if (!access.ok) return access.response;
  const parsed = resolutionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "The asset resolution payload is invalid." } },
      { status: 400 },
    );
  }
  const { projectId, assetId } = await context.params;
  try {
    const data = await resolveInstalledAsset(access.actor, {
      ...parsed.data,
      projectId,
      assetId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
