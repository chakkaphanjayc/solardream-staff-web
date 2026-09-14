import { NextResponse } from "next/server";

import { getTechnicianDashboardAccess } from "@/lib/techPortalAccess";
import { getTechPortalFailure } from "@/lib/techPortal";
import { listTechnicianFieldVisits } from "@/lib/techPortalAccess";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";

export async function GET() {
  const featureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
  if (featureResponse) return featureResponse;
  const access = await getTechnicianDashboardAccess();
  if (access.kind === "UNAUTHENTICATED") {
    return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  }
  if (access.kind === "FORBIDDEN") {
    return NextResponse.json({ success: false, error: "Technician or installation reviewer access is required." }, { status: 403 });
  }
  try {
    const result = await listTechnicianFieldVisits(access.actor);
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error: unknown) {
    const failure = getTechPortalFailure(error, "Field visits are temporarily unavailable.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
