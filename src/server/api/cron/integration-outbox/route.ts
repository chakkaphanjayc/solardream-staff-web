import { NextRequest, NextResponse } from "next/server";

import { processIntegrationOutbox } from "@/lib/outboxProcessor";
import { hasValidBearerToken } from "@/lib/secretAuth";
import { db } from "@/db";
import { systemSettingsKeyValue } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const setting = await db.query.systemSettingsKeyValue.findFirst({
    where: eq(systemSettingsKeyValue.key, "cron_secret"),
    columns: { value: true },
  });
  const cronSecret = process.env.CRON_SECRET?.trim() || setting?.value.trim() || "";
  if (!hasValidBearerToken(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, ...(await processIntegrationOutbox({ limit: 50 })) });
  } catch (error: unknown) {
    console.error("[Integration Outbox Cron]", error);
    return NextResponse.json({ success: false, error: "Outbox processing failed." }, { status: 500 });
  }
}
