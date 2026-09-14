import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { portalExchangeSchema } from "@/lib/servicePortalContracts";
import { createPortalSessionCookie, SERVICE_PORTAL_SESSION_COOKIE, verifyPortalCapability } from "@/lib/servicePortal";
import { verifyTurnstileToken } from "@/lib/turnstile";

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } }); }
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return json({ success: false, error: "Forbidden." }, 403);
    const ipRate = await enforcePortalRateLimit({ namespace: "service-portal-exchange", identity: privacyHmac(requestClientAddress(request.headers), "ip"), limit: 5, windowSeconds: 60 });
    if (!ipRate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const input = portalExchangeSchema.parse(await request.json());
    if (input.turnstileToken) {
      const botCheck = await verifyTurnstileToken({
        token: input.turnstileToken,
        remoteIp: requestClientAddress(request.headers),
        expectedAction: "service_magic_link",
      });
      if (!botCheck.success) return json({ success: false, error: "Security check failed." }, 403);
    }
    const tokenRate = await enforcePortalRateLimit({ namespace: "service-portal-exchange-token", identity: input.tokenId, limit: 3, windowSeconds: 60 });
    if (!tokenRate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const token = await verifyPortalCapability(input.tokenId, input.access);
    if (!token) return json({ success: false, error: "This service portal link is invalid or expired." }, 401);
    const response = json({ success: true });
    const session = createPortalSessionCookie(token.id, token.expiresAt);
    response.cookies.set(SERVICE_PORTAL_SESSION_COOKIE, session.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: session.maxAge, expires: session.expiresAt });
    return response;
  } catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ success: false, error: "Invalid portal access." }, 400); console.error("[Service Portal Exchange]", error); return json({ success: false, error: "Portal access is temporarily unavailable." }, 503); }
}
