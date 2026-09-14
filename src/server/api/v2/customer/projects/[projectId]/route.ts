import { NextRequest, NextResponse } from "next/server";

import { requireOpsCustomer, opsErrorResponse } from "@/server/services/ops-v2/api-response";
import { getCustomerProjectStatus } from "@/server/services/ops-v2/customer-operations-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const access = await requireOpsCustomer("OPS_V2_CUSTOMER_PORTAL");
  if (!access.ok) return access.response;
  const { projectId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: await getCustomerProjectStatus(access.actor, projectId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
