import { NextRequest, NextResponse } from "next/server";

import { requireOpsCustomer, opsErrorResponse } from "@/server/services/ops-v2/api-response";
import { getServiceCase } from "@/server/services/ops-v2/service-case-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  const access = await requireOpsCustomer(["OPS_V2_CUSTOMER_PORTAL", "OPS_V2_AFTER_SALES"]);
  if (!access.ok) return access.response;
  const { caseId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: await getServiceCase(access.actor, caseId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
