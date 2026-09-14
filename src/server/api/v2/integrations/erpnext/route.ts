import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminJson } from "@/lib/auth-guard";
import { checkERPNextConnection, getIntegrationCenterSnapshot } from "@/server/services/integrations/integration-center-service";
import { integrationErrorResponse } from "@/server/services/ops-v2/api-response";

const commandSchema = z.object({ action: z.literal("ping") });

export async function GET() {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;
  try {
    return NextResponse.json({ success: true, data: await getIntegrationCenterSnapshot() }, {
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error: unknown) {
    return integrationErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "A JSON command is required." } }, { status: 400 });
  }
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The ERPNext integration command is invalid." } }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, data: await checkERPNextConnection() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    return integrationErrorResponse(error);
  }
}
