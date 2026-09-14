import { NextResponse } from "next/server";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { listAssignableFieldUsers } from "@/server/services/ops-v2/scheduling-service";

export async function GET() {
  const access = await requireOpsStaff("OPS_V2_SCHEDULING");
  if (!access.ok) return access.response;
  try {
    return NextResponse.json({ success: true, data: await listAssignableFieldUsers(access.actor) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
