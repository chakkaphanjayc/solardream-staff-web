import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { proposals } from "@/db/schema";
import { portalJson } from "@/lib/portalAccess";
import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";
import { createPortalSessionCookie, issuePortalToken, PORTAL_SCOPES, PORTAL_SESSION_COOKIE, validatePortalToken } from "@/lib/portalTokens";
import { normalizeTrackingReference } from "@/lib/trackingReference";
import { verifyTurnstileToken } from "@/lib/turnstile";

const exchangeSchema = z.object({
  proposalId: z.string().trim().min(1).max(128),
  token: z.string().trim().min(1).max(512).optional(),
  trackNumber: z.string().trim().min(1).max(128).optional(),
  turnstileToken: z.string().trim().min(1).max(4096).optional(),
}).refine((data) => Boolean(data.token || data.trackNumber), {
  message: "Either token or trackNumber is required.",
});

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([request.nextUrl.origin]);
  for (const configured of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
  ]) {
    if (!configured) continue;
    try { allowed.add(new URL(configured).origin); } catch { /* Ignore invalid configuration. */ }
  }
  try { return allowed.has(new URL(origin).origin); } catch { return false; }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAllowedOrigin(request)) {
      return portalJson({ success: false, error: "Access denied." }, { status: 403 });
    }
    const rate = await enforcePortalRateLimit({
      namespace: "portal-session-exchange",
      identity: getPortalClientAddress(request.headers),
      limit: 10,
      windowSeconds: 60,
    });
    if (!rate.allowed) {
      return portalJson({ success: false, error: "Too many requests." }, { status: 429 });
    }

    const parsed = exchangeSchema.parse(await request.json());
    if (parsed.turnstileToken) {
      const botCheck = await verifyTurnstileToken({
        token: parsed.turnstileToken,
        remoteIp: getPortalClientAddress(request.headers),
        expectedAction: "proposal_magic_link",
      });
      if (!botCheck.success) {
        return portalJson({ success: false, error: "Security check failed." }, { status: 403 });
      }
    }

    let tokenRecord = parsed.token
      ? await validatePortalToken({
          token: parsed.token,
          proposalId: parsed.proposalId,
          requiredScope: "proposal:read",
        })
      : null;

    if (!tokenRecord && parsed.trackNumber) {
      const cleanInput = parsed.trackNumber.trim();
      const cleanRef = normalizeTrackingReference(cleanInput);
      const proposal = await db.query.proposals.findFirst({
        where: eq(proposals.id, parsed.proposalId),
        columns: { id: true, userId: true, magicTokenSlug: true, erpnextQuotationId: true, configurationData: true },
      });

      if (proposal) {
        const config = (proposal.configurationData && typeof proposal.configurationData === "object" ? proposal.configurationData : {}) as Record<string, unknown>;
        const trackingRef = String(config.trackingRef || "").trim();
        const trackingId = String(config.trackingId || "").trim();
        const orderReference = String(config.orderReference || "").trim();
        const formattedRef = `SD-QT-${proposal.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

        const candidates = [
          proposal.id.toLowerCase(),
          proposal.magicTokenSlug?.toLowerCase(),
          proposal.erpnextQuotationId?.toLowerCase(),
          trackingRef.toLowerCase(),
          trackingId.toLowerCase(),
          orderReference.toLowerCase(),
          formattedRef.toLowerCase(),
        ].filter(Boolean);

        const isMatch = candidates.some(
          (val) => val === cleanRef.toLowerCase() || val === cleanInput.toLowerCase()
        );

        if (isMatch) {
          const issued = await issuePortalToken({
            proposalId: proposal.id,
            issuedByUserId: proposal.userId,
            scopes: PORTAL_SCOPES,
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          });
          tokenRecord = issued.record;
        }
      }
    }

    if (!tokenRecord) {
      return portalJson({ success: false, error: "Access denied. Invalid token or Track Request Number." }, { status: 401 });
    }

    const response = portalJson({ success: true, proposalId: parsed.proposalId });
    const session = await createPortalSessionCookie({
      tokenId: tokenRecord.id,
      expiresAt: tokenRecord.expiresAt,
    });
    response.cookies.set(PORTAL_SESSION_COOKIE, session.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: session.maxAge,
      expires: session.expiresAt,
    });
    return response;
  } catch (error: unknown) {
    console.error("[Portal Session Exchange]", error);
    return portalJson({ success: false, error: "Unable to establish portal session." }, { status: 400 });
  }
}

export async function DELETE() {
  const response = portalJson({ success: true });
  response.cookies.set(PORTAL_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
