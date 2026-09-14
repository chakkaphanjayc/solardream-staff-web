import { NextResponse } from "next/server";

import { getTechnicianDashboardAccess } from "@/lib/techPortalAccess";
import { getTechPortalFailure, loadTechnicianDashboard } from "@/lib/techPortal";

export async function GET() {
  const actorResult = await getTechnicianDashboardAccess();
  if (actorResult.kind === "UNAUTHENTICATED") {
    return NextResponse.json({ success: false, error: "Authentication is required." }, { status: 401 });
  }
  if (actorResult.kind === "FORBIDDEN") {
    return NextResponse.json({ success: false, error: "Technician or installation reviewer access is required." }, { status: 403 });
  }

  try {
    const dashboard = await loadTechnicianDashboard(actorResult.actor);
    return NextResponse.json(
      { success: true, ...dashboard },
      { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error: unknown) {
    console.error("[Technician Portal Tasks] Failed to load dashboard.", error);
    const failure = getTechPortalFailure(error, "Technician tasks are temporarily unavailable.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
