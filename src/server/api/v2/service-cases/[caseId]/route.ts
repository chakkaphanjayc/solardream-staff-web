import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SERVICE_CASE_STATUSES, WARRANTY_DECISIONS } from "@/types/ops-v2";
import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { getServiceCase, updateServiceCase } from "@/server/services/ops-v2/service-case-service";

const updateSchema = z.object({
  status: z.enum(SERVICE_CASE_STATUSES).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedUserId: z.string().trim().max(160).optional().nullable(),
  warrantyDecision: z.enum(WARRANTY_DECISIONS).optional().nullable(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_AFTER_SALES");
  if (!access.ok) return access.response;
  const { caseId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: await getServiceCase(access.actor, caseId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_AFTER_SALES");
  if (!access.ok) return access.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The service case update is invalid." } }, { status: 400 });
  const { caseId } = await context.params;
  try {
    const data = await updateServiceCase(access.actor, {
      ...parsed.data,
      caseId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
