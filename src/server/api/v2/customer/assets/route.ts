import { NextResponse } from "next/server";

import { requireOpsCustomer, opsErrorResponse } from "@/server/services/ops-v2/api-response";
import { listCustomerAssets } from "@/server/services/ops-v2/customer-operations-service";

export async function GET() {
  const access = await requireOpsCustomer("OPS_V2_CUSTOMER_PORTAL");
  if (!access.ok) return access.response;
  try {
    return NextResponse.json({ success: true, data: await listCustomerAssets(access.actor) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
