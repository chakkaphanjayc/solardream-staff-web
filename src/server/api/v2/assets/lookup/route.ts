import { NextRequest, NextResponse } from "next/server";

import { opsErrorResponse, requireOpsStaff } from "@/server/services/ops-v2/api-response";
import { lookupInstalledAssetSerial } from "@/server/services/ops-v2/asset-warranty-service";

export async function GET(request: NextRequest) {
  const access = await requireOpsStaff("OPS_V2_ASSETS");
  if (!access.ok) return access.response;
  try {
    const serial = request.nextUrl.searchParams.get("serial") || "";
    const data = await lookupInstalledAssetSerial(access.actor, serial);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
