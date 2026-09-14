import { NextRequest, NextResponse } from "next/server";

import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { createPortalSessionCookie, resolvePortalSession, rotateAndCopyServicePortalLink, SERVICE_PORTAL_SESSION_COOKIE } from "@/lib/servicePortal";
import { portalShareLinkResponseSchema } from "@/lib/servicePortalContracts";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return json({ success: false, error: "Forbidden." }, 403);
    const ipRate = await enforcePortalRateLimit({ namespace: "service-portal-share-link-ip", identity: privacyHmac(requestClientAddress(request.headers), "ip"), limit: 3, windowSeconds: 900 });
    if (!ipRate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const current = await resolvePortalSession(request.cookies.get(SERVICE_PORTAL_SESSION_COOKIE)?.value);
    if (!current) return json({ success: false, error: "Unauthorized." }, 401);
    const tokenRate = await enforcePortalRateLimit({ namespace: "service-portal-share-link-token", identity: current.id, limit: 3, windowSeconds: 900 });
    if (!tokenRate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const replacement = await rotateAndCopyServicePortalLink(current.id);
    if (!replacement) return json({ success: false, error: "Portal access is no longer available." }, 409);
    const session = createPortalSessionCookie(replacement.tokenId, replacement.tokenExpiresAt);
    const response = json(portalShareLinkResponseSchema.parse({ success: true, link: replacement.link, expiresAt: replacement.tokenExpiresAt.toISOString() }));
    response.cookies.set(SERVICE_PORTAL_SESSION_COOKIE, session.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: session.maxAge, expires: session.expiresAt });
    return response;
  } catch {
    console.error("[Service Portal Share Link] Rotation failed.");
    return json({ success: false, error: "A secure share link could not be created." }, 503);
  }
}
