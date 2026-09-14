import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";
import {
  GUEST_WARRANTY_GENERIC_MESSAGE,
  requestGuestWarrantyOtp,
} from "@/server/services/ops-v2/guest-warranty-service";

const schema = z.object({ contact: z.string().trim().min(3).max(180) });

export async function POST(request: NextRequest) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_WARRANTY");
  if (featureResponse) return featureResponse;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: true, message: GUEST_WARRANTY_GENERIC_MESSAGE }, { status: 202 });
  }

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ success: true, message: GUEST_WARRANTY_GENERIC_MESSAGE }, { status: 202 });
  }

  const ip = requestClientAddress(request.headers);
  const ipRate = await enforcePortalRateLimit({
    namespace: "guest-warranty-otp-ip",
    identity: privacyHmac(ip, "ip"),
    limit: 5,
    windowSeconds: 15 * 60,
  });
  const contactRate = await enforcePortalRateLimit({
    namespace: "guest-warranty-otp-contact",
    identity: privacyHmac(body.data.contact.trim().toLowerCase(), "session"),
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (!ipRate.allowed || !contactRate.allowed) {
    return NextResponse.json({ success: true, message: GUEST_WARRANTY_GENERIC_MESSAGE }, { status: 202 });
  }

  try {
    const data = await requestGuestWarrantyOtp({ contact: body.data.contact });
    return NextResponse.json(
      { success: true, message: GUEST_WARRANTY_GENERIC_MESSAGE, data },
      { status: 202, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } },
    );
  } catch (error: unknown) {
    console.error("[Guest Warranty] OTP request failed.", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
    return NextResponse.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Warranty access is temporarily unavailable." } }, { status: 503 });
  }
}
