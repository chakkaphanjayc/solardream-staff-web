import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ success: false, code: "LEGACY_SERVICE_FLOW_RETIRED", error: "This service quote endpoint has been retired. Use /api/services/multi-quote." }, { status: 410, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
