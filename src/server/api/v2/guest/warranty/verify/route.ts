import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";
import { privacyHmac } from "@/lib/privacyConsent";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";
import {
  GuestWarrantyAccessError,
  verifyGuestWarrantyOtp,
} from "@/server/services/ops-v2/guest-warranty-service";

const schema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_WARRANTY");
  if (featureResponse) return featureResponse;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "Enter the six-digit verification code." } }, { status: 400 });
  }
  const ip = getPortalClientAddress(request.headers);
  const rate = await enforcePortalRateLimit({
    namespace: "guest-warranty-verify",
    identity: privacyHmac(ip + ":" + body.data.challengeId, "session"),
    limit: 8,
    windowSeconds: 10 * 60,
  });
  if (!rate.allowed) {
    return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many verification attempts. Request a new code later." } }, { status: 429 });
  }

  try {
    const result = await verifyGuestWarrantyOtp({
      challengeId: body.data.challengeId,
      code: body.data.code,
      ipHash: privacyHmac(ip, "ip"),
    });
    return NextResponse.json({
      success: true,
      data: {
        accessPath: "/warranty/access/" + encodeURIComponent(result.accessToken),
        expiresAt: result.expiresAt,
      },
    }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error: unknown) {
    if (error instanceof GuestWarrantyAccessError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: 400 });
    }
    console.error("[Guest Warranty] OTP verification failed.", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
    return NextResponse.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Warranty access is temporarily unavailable." } }, { status: 503 });
  }
}
