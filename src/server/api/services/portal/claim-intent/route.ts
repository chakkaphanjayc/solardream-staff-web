import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { portalClaimIntentSchema } from "@/lib/servicePortalContracts";
import { createPortalClaimIntent, resolvePortalSession, SERVICE_PORTAL_CLAIM_COOKIE, SERVICE_PORTAL_SESSION_COOKIE } from "@/lib/servicePortal";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    const ipRate = await enforcePortalRateLimit({ namespace: "service-portal-claim-intent-ip", identity: privacyHmac(requestClientAddress(request.headers), "ip"), limit: 10, windowSeconds: 900 });
    if (!ipRate.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
    portalClaimIntentSchema.parse(await request.json()); const token = await resolvePortalSession(request.cookies.get(SERVICE_PORTAL_SESSION_COOKIE)?.value);
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const tokenRate = await enforcePortalRateLimit({ namespace: "service-portal-claim-intent-token", identity: token.id, limit: 5, windowSeconds: 900 });
    if (!tokenRate.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
    const cookie = await createPortalClaimIntent(token.id); const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    if (cookie) response.cookies.set(SERVICE_PORTAL_CLAIM_COOKIE, cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 20 * 60 }); return response;
  } catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ success: false, error: "Invalid claim request." }, { status: 400 }); console.error("[Service Portal Claim Intent]", error); return NextResponse.json({ success: false, error: "Claim request is temporarily unavailable." }, { status: 503 }); }
}
