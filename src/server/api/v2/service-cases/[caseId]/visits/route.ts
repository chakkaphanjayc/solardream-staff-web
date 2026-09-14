import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { createServiceVisit, listServiceVisits } from "@/server/services/ops-v2/service-case-service";

const visitSchema = z.object({
  fieldVisitId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().trim().max(160).optional().nullable(),
  status: z.enum(["PLANNED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("PLANNED"),
  scheduledStart: z.string().datetime({ offset: true }).optional().nullable(),
  scheduledEnd: z.string().datetime({ offset: true }).optional().nullable(),
  notes: z.string().trim().max(2_000).optional().nullable(),
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
    return NextResponse.json({ success: true, data: await listServiceVisits(access.actor, caseId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_AFTER_SALES");
  if (!access.ok) return access.response;
  const parsed = visitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The service visit payload is invalid." } }, { status: 400 });
  const { caseId } = await context.params;
  try {
    const data = await createServiceVisit(access.actor, {
      ...parsed.data,
      caseId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
