import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { activateInstallationWarranty, listProjectWarranties } from "@/server/services/ops-v2/asset-warranty-service";

const activationSchema = z.object({
  durationMonths: z.number().int().min(1).max(240).optional().nullable(),
  startsAt: z.string().datetime({ offset: true }).optional().nullable(),
  sourceHandoverId: z.string().trim().max(160).optional().nullable(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_WARRANTY");
  if (!access.ok) return access.response;
  const { projectId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: await listProjectWarranties(access.actor, projectId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_WARRANTY");
  if (!access.ok) return access.response;
  const parsed = activationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The warranty activation payload is invalid." } }, { status: 400 });
  }
  const { projectId } = await context.params;
  try {
    const data = await activateInstallationWarranty(access.actor, {
      ...parsed.data,
      projectId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
