import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireOpsStaff, opsErrorResponse } from "@/server/services/ops-v2/api-response";
import { listOpsProjects } from "@/server/services/ops-v2/project-service";
import { OPS_PROJECT_STATES } from "@/types/ops-v2";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
  state: z.enum(OPS_PROJECT_STATES).optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireOpsStaff("OPS_V2_PROJECTS");
  if (!access.ok) return access.response;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message || "Invalid project filters." } },
      { status: 400 },
    );
  }

  try {
    const result = await listOpsProjects(access.actor, {
      page: parsed.data.page,
      limit: parsed.data.limit,
      query: parsed.data.q,
      state: parsed.data.state,
    });
    return NextResponse.json(
      { success: true, data: result.items, pagination: result.pagination },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
