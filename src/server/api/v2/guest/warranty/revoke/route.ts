import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminJson } from "@/lib/auth-guard";
import { getPortalClientAddress } from "@/lib/portalRateLimit";
import { privacyHmac } from "@/lib/privacyConsent";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";
import {
  GuestWarrantyAccessError,
  revokeGuestWarrantyAccess,
} from "@/server/services/ops-v2/guest-warranty-service";

const schema = z.object({ accessId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_WARRANTY");
  if (featureResponse) return featureResponse;
  const access = await requireAdminJson();
  if (!access.ok) return access.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "A valid access session is required." } }, { status: 400 });
  try {
    const data = await revokeGuestWarrantyAccess({
      accessId: body.data.accessId,
      actorUserId: access.user.id,
      ipHash: privacyHmac(getPortalClientAddress(request.headers), "ip"),
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof GuestWarrantyAccessError) return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: 404 });
    console.error("[Guest Warranty] Access revocation failed.", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "The access session could not be revoked." } }, { status: 500 });
  }
}
