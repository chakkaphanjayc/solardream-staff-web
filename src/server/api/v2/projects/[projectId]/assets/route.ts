import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { listProjectAssets, registerInstalledAsset } from "@/server/services/ops-v2/asset-warranty-service";

const assetSchema = z.object({
  productName: z.string().trim().min(1).max(240),
  serialNumber: z.string().trim().min(2).max(160),
  catalogProductId: z.string().trim().max(160).optional().nullable(),
  installedDate: z.string().datetime({ offset: true }).optional().nullable(),
  productWarrantyProvider: z.string().trim().max(160).optional().nullable(),
  productWarrantyMonths: z.number().int().min(1).max(240).optional().nullable(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_ASSETS");
  if (!access.ok) return access.response;
  const { projectId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: await listProjectAssets(access.actor, projectId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_ASSETS");
  if (!access.ok) return access.response;
  const parsed = assetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The asset payload is invalid." } }, { status: 400 });
  }
  const { projectId } = await context.params;
  try {
    const data = await registerInstalledAsset(access.actor, {
      ...parsed.data,
      projectId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
