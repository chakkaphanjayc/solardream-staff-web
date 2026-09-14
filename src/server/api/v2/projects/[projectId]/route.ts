import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireOpsStaff, opsErrorResponse } from "@/server/services/ops-v2/api-response";
import {
  getOpsProjectWorkspace,
  transitionOpsProject,
} from "@/server/services/ops-v2/project-service";
import { OPS_PROJECT_STATES } from "@/types/ops-v2";

const transitionSchema = z.object({
  to: z.enum(OPS_PROJECT_STATES),
  idempotencyKey: z.string().trim().min(12).max(160),
  reason: z.string().trim().max(1_000).optional(),
  source: z.string().trim().max(80).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_PROJECT_WORKSPACE");
  if (!access.ok) return access.response;
  const { projectId } = await context.params;
  try {
    const data = await getOpsProjectWorkspace(access.actor, projectId);
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsStaff("OPS_V2_PROJECT_WORKSPACE");
  if (!access.ok) return access.response;
  const { projectId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message || "Invalid project transition." } },
      { status: 400 },
    );
  }

  try {
    const result = await transitionOpsProject(access.actor, {
      projectId,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
