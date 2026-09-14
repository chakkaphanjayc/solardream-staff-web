import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { addMaterialRequirement, listProjectMaterials } from "@/server/services/ops-v2/scheduling-service";

const materialSchema = z.object({
  taskId: z.string().uuid().optional().nullable(),
  catalogProductId: z.string().trim().max(160).optional().nullable(),
  productName: z.string().trim().min(1).max(240),
  quantity: z.string().trim().min(1).max(40),
  unit: z.string().trim().max(40).optional(),
  serialRequired: z.boolean().optional(),
  notes: z.string().trim().max(1_000).optional().nullable(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_SCHEDULING");
  if (!access.ok) return access.response;
  const { projectId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: await listProjectMaterials(access.actor, projectId) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_SCHEDULING");
  if (!access.ok) return access.response;
  const parsed = materialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The material requirement payload is invalid." } }, { status: 400 });
  }
  const { projectId } = await context.params;
  try {
    const data = await addMaterialRequirement(access.actor, {
      ...parsed.data,
      projectId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
