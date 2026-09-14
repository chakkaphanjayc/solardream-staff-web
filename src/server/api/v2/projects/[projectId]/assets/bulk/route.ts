import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
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
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_ASSETS");
  if (!access.ok) return access.response;
  const parsed = bulkAssetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "The bulk asset payload is invalid." } },
      { status: 400 },
    );
  }

  const { projectId } = await context.params;
  try {
    const data = await registerInstalledAssetsBulk(access.actor, {
      ...parsed.data,
      projectId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data }, { status: data.failures.length > 0 ? 207 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
