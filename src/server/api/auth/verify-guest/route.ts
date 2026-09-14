import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { proposals, serviceOrders, users } from "@/db/schema";
import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";
import {
  createPortalSessionCookie,
  PORTAL_SESSION_COOKIE,
  validatePortalToken,
} from "@/lib/portalTokens";
import {
  createPortalSessionCookie as createServicePortalSessionCookie,
  SERVICE_PORTAL_SESSION_COOKIE,
  verifyPortalCapability,
} from "@/lib/servicePortal";
import { serviceContactEmailDigest } from "@/lib/servicePortal";
import { getSigningSecret } from "@/lib/portalTokens";
import { verifyHs256Jwt } from "@/lib/signedJwt";
import { getConfiguredPublicSiteUrl, isLocalSiteUrl } from "@/lib/siteUrl";

type VerifyMode = "proposal" | "service" | "guest";

function cleanLocale(value: string | null) {
  return value === "en" ? "en" : "th";
}

function getPublicRedirectOrigin(request: NextRequest) {
  const requestOrigin = request.nextUrl.origin;
  if (request.nextUrl.searchParams.get("destination") === "local" && isLocalSiteUrl(requestOrigin)) {
    const localUrl = new URL(requestOrigin);
    if (localUrl.hostname === "0.0.0.0") localUrl.hostname = "localhost";
    return localUrl.origin;
  }
  return getConfiguredPublicSiteUrl();
}

function redirectWithError(request: NextRequest, locale: string) {
  const url = new URL(`/${locale}/guest/proposals`, getPublicRedirectOrigin(request));
  url.searchParams.set("auth", "expired");
  return NextResponse.redirect(url, 302);
}

function redirectClean(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, getPublicRedirectOrigin(request)), 302);
}

function redirectProposalRecovery(request: NextRequest, locale: string, proposalId: string) {
  const path = `/${locale}/portal/${encodeURIComponent(proposalId)}?access=expired`;
  return redirectClean(request, path);
}

async function rateLimit(request: NextRequest) {
  return enforcePortalRateLimit({
    namespace: "verify-guest-link-ip",
    identity: getPortalClientAddress(request.headers),
    limit: 10,
    windowSeconds: 60,
  });
}

async function hasOpenGuestRequest(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const [proposal] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.userId))
    .where(
      and(
        sql`lower(${users.email}) = ${normalizedEmail}`,
        sql`${proposals.status} NOT IN ('COMPLETED','COMPLETE','CANCELLED','CANCELED','CLOSED','ARCHIVED')`,
        sql`coalesce(${proposals.projectStatus}, '') NOT IN ('COMPLETED','COMPLETE','CANCELLED','CANCELED','CLOSED','ARCHIVED')`,
      ),
    )
    .limit(1);

  if (proposal) return true;

  const service = await db.query.serviceOrders.findFirst({
    where: and(
      eq(serviceOrders.contactEmailDigest, serviceContactEmailDigest(normalizedEmail)),
      isNull(serviceOrders.portalClosedAt),
      sql`${serviceOrders.status} NOT IN ('COMPLETED','COMPLETE','CANCELLED','CANCELED','CLOSED')`,
    ),
    columns: { id: true },
  });

  return Boolean(service);
}

export async function GET(request: NextRequest) {
  const locale = cleanLocale(request.nextUrl.searchParams.get("locale"));
  try {
    const rate = await rateLimit(request);
    if (!rate.allowed) return redirectWithError(request, locale);

    const mode = request.nextUrl.searchParams.get("mode") as VerifyMode | null;

    if (mode === "proposal") {
      const proposalId = request.nextUrl.searchParams.get("proposalId")?.trim() || "";
      const token = request.nextUrl.searchParams.get("token")?.trim() || "";
      if (!proposalId || !token) {
        return proposalId
          ? redirectProposalRecovery(request, locale, proposalId)
          : redirectWithError(request, locale);
      }
      const tokenRecord = await validatePortalToken({
        token,
        proposalId,
        requiredScope: "proposal:read",
      });
      if (!tokenRecord) return redirectProposalRecovery(request, locale, proposalId);
      const session = await createPortalSessionCookie({
        tokenId: tokenRecord.id,
        expiresAt: tokenRecord.expiresAt,
      });
      const response = redirectClean(request, `/${locale}/proposals/${encodeURIComponent(proposalId)}`);
      response.cookies.set(PORTAL_SESSION_COOKIE, session.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: session.maxAge,
        expires: session.expiresAt,
      });
      return response;
    }

    if (mode === "service") {
      const tokenId = request.nextUrl.searchParams.get("tokenId")?.trim() || "";
      const access = request.nextUrl.searchParams.get("access")?.trim() || "";
      if (!tokenId || !access) return redirectWithError(request, locale);
      const token = await verifyPortalCapability(tokenId, access);
      if (!token) return redirectWithError(request, locale);
      const session = createServicePortalSessionCookie(token.id, token.expiresAt);
      const response = redirectClean(request, `/${locale}/track/${encodeURIComponent(tokenId)}`);
      response.cookies.set(SERVICE_PORTAL_SESSION_COOKIE, session.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: session.maxAge,
        expires: session.expiresAt,
      });
      return response;
    }

    if (mode === "guest") {
      const token = request.nextUrl.searchParams.get("token")?.trim() || "";
      if (!token) return redirectWithError(request, locale);
      const secret = await getSigningSecret();
      const payload = verifyHs256Jwt(token, secret);
      if (
        !payload ||
        payload.typ !== "guest_master_session" ||
        typeof payload.email !== "string"
      ) {
        return redirectWithError(request, locale);
      }
      const hasOpenRequest = await hasOpenGuestRequest(payload.email);
      if (!hasOpenRequest) return redirectWithError(request, locale);
      const response = redirectClean(request, `/${locale}/guest/proposals`);
      response.cookies.set("sd_guest_email", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 2 * 60 * 60,
        expires: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });
      return response;
    }

    return redirectWithError(request, locale);
  } catch (error) {
    console.error("[Verify Guest Magic Link]", error);
    return redirectWithError(request, locale);
  }
}
