import { NextRequest, NextResponse } from "next/server";
import { describeDatabaseError } from "@/db";
import { processRichMenuScheduler } from "@/lib/richMenuScheduler";
import { hasValidBearerToken } from "@/lib/secretAuth";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!hasValidBearerToken(authorization, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processRichMenuScheduler();
    return NextResponse.json(
      {
        success: result.success,
        processedCount: result.processedCount,
        summary: result,
      },
      { status: result.success ? 200 : 502 },
    );
  } catch (error) {
    console.error("[RICH MENU SCHEDULER CRON] Execution failed.", describeDatabaseError(error));
    return NextResponse.json(
      {
        success: false,
        error: "Rich menu scheduler cron failed.",
      },
      { status: 500 },
    );
  }
}
