import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { assignJob } from "@/server/services/ops-v2/scheduling-service";

const assignmentSchema = z.object({
  taskId: z.string().uuid().optional().nullable(),
  assigneeUserId: z.string().trim().min(1).max(160),
  role: z.string().trim().max(80).optional(),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ visitId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_SCHEDULING");
  if (!access.ok) return access.response;
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The job assignment payload is invalid." } }, { status: 400 });
  }
  const { visitId } = await context.params;
  try {
    const data = await assignJob(access.actor, {
      ...parsed.data,
      visitId,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
