import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MATERIAL_REQUIREMENT_STATUSES } from "@/types/ops-v2";
import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { updateMaterialStatus } from "@/server/services/ops-v2/scheduling-service";

const statusSchema = z.object({
  status: z.enum(MATERIAL_REQUIREMENT_STATUSES),
  notes: z.string().trim().max(1_000).optional().nullable(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ materialId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_SCHEDULING");
  if (!access.ok) return access.response;
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The material status payload is invalid." } }, { status: 400 });
  }
  const { materialId } = await context.params;
  try {
    const data = await updateMaterialStatus(access.actor, {
      ...parsed.data,
      materialId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
