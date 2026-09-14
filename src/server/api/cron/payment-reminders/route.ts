import { processDailyPaymentReminders } from "@/lib/reminderEngine";
import { NextRequest, NextResponse } from "next/server";
import { hasValidBearerToken } from "@/lib/secretAuth";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!hasValidBearerToken(authorization, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDailyPaymentReminders();
    return NextResponse.json(
      {
        success: result.success,
        processedCount: result.sent,
        summary: result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[PAYMENT REMINDER CRON] Execution failed.", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Payment reminder cron failed.",
      },
      { status: 500 },
    );
  }
}
