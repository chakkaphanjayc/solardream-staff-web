import { NextRequest, NextResponse } from "next/server";

import { requireAdminJson } from "@/lib/auth-guard";
import { retryIntegrationOutboxEvent } from "@/server/services/integrations/integration-center-service";
import { integrationErrorResponse } from "@/server/services/ops-v2/api-response";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;
  const { eventId } = await context.params;
  try {
    const data = await retryIntegrationOutboxEvent({ eventId, actorUserId: access.user.id });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return integrationErrorResponse(error);
  }
}
