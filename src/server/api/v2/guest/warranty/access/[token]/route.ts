import { NextRequest, NextResponse } from "next/server";

import { getPortalClientAddress } from "@/lib/portalRateLimit";
import { privacyHmac } from "@/lib/privacyConsent";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";
import { getGuestWarrantyPortal } from "@/server/services/ops-v2/guest-warranty-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_WARRANTY");
  if (featureResponse) return featureResponse;
  const { token } = await context.params;
  const data = await getGuestWarrantyPortal({
    accessToken: token,
    ipHash: privacyHmac(getPortalClientAddress(request.headers), "ip"),
  });
  if (!data) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "This warranty access link is invalid or expired." } }, { status: 404, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
