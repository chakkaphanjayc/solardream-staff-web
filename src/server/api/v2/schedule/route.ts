import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { FIELD_VISIT_STATUSES } from "@/types/ops-v2";
import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { listScheduleBoard } from "@/server/services/ops-v2/scheduling-service";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(FIELD_VISIT_STATUSES).optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireOpsStaff("OPS_V2_SCHEDULING");
  if (!access.ok) return access.response;

  const parsed = querySchema.safeParse({
    from: request.nextUrl.searchParams.get("from") || undefined,
    to: request.nextUrl.searchParams.get("to") || undefined,
    status: request.nextUrl.searchParams.get("status") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "The schedule filters are invalid." } },
      { status: 400 },
    );
  }

  try {
    const data = await listScheduleBoard(access.actor, parsed.data);
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
