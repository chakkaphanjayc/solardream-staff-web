import { NextRequest, NextResponse } from "next/server";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { lookupErpnextMaterial } from "@/server/services/ops-v2/material-integration-service";

export async function GET(request: NextRequest) {
  const access = await requireOpsStaff("OPS_V2_SCHEDULING");
  if (!access.ok) return access.response;
  try {
    const itemCode = request.nextUrl.searchParams.get("itemCode") || request.nextUrl.searchParams.get("q") || "";
    const data = await lookupErpnextMaterial(access.actor, itemCode);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
