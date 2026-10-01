import { NextRequest, NextResponse } from "next/server";

import { describeDatabaseError } from "@/db";
import { processPrivacyRetention } from "@/lib/privacyRetention";
import { hasValidBearerToken } from "@/lib/secretAuth";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!hasValidBearerToken(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processPrivacyRetention({ dryRun: request.nextUrl.searchParams.get("dryRun") === "true" });
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("[Privacy Retention Cron]", describeDatabaseError(error));
    return NextResponse.json({ success: false, error: "Privacy retention run failed." }, { status: 500 });
  }
}
