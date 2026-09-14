import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { FIELD_VISIT_STATUSES } from "@/types/ops-v2";
import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { listProjectVisits, upsertFieldVisit } from "@/server/services/ops-v2/scheduling-service";

const visitSchema = z.object({
  visitId: z.string().uuid().optional().nullable(),
  visitType: z.string().trim().max(80).optional(),
  status: z.enum(FIELD_VISIT_STATUSES).default("PLANNED"),
  scheduledStart: z.string().datetime({ offset: true }).optional().nullable(),
  scheduledEnd: z.string().datetime({ offset: true }).optional().nullable(),
  timezone: z.string().trim().max(80).optional(),
  crewName: z.string().trim().max(160).optional().nullable(),
  customerConfirmed: z.boolean().optional(),
  cancellationReason: z.string().trim().max(1_000).optional().nullable(),
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
    return NextResponse.json({ success: true, data: await listProjectVisits(access.actor, projectId) }, {
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
  const parsed = visitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The field visit payload is invalid." } }, { status: 400 });
  }
  const { projectId } = await context.params;
  try {
    const data = await upsertFieldVisit(access.actor, {
      ...parsed.data,
      projectId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
