import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/locales";
import {
  getConfiguredAdminSiteUrl,
  getHostname,
  getRequestHostHeader,
  isConfiguredAdminHost,
  isLocalHostname,
} from "@/lib/siteUrl";
import { updateSession } from "@/utils/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

function requestHost(request: NextRequest) {
  return getHostname(getRequestHostHeader(request.headers, request.nextUrl.host));
}

function isLocalRequest(request: NextRequest) {
  return isLocalHostname(requestHost(request));
}

function rejectNonStaffHost(request: NextRequest) {
  if (isLocalRequest(request) || isConfiguredAdminHost(requestHost(request))) return null;

  return new NextResponse("This host belongs to the SolarDream customer application.", {
    status: 421,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function localeFromRequest(request: NextRequest) {
  const value = request.cookies.get("NEXT_LOCALE")?.value;
  return routing.locales.includes(value as (typeof routing.locales)[number])
    ? value as (typeof routing.locales)[number]
    : routing.defaultLocale;
}

function redirectStaffRoot(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.includes(".")) return null;

  const segments = pathname.split("/").filter(Boolean);
  const hasLocale = routing.locales.includes(segments[0] as (typeof routing.locales)[number]);
  const locale = hasLocale ? segments[0] : localeFromRequest(request);
  const routeSegments = hasLocale ? segments.slice(1) : segments;

  if (routeSegments.length === 0 || (routeSegments.length === 1 && routeSegments[0] === "admin" && !hasLocale)) {
    const target = request.nextUrl.clone();
    target.pathname = `/${locale}/admin`;
    return NextResponse.redirect(target, 308);
  }

  if (routeSegments[0] === "admin" && !hasLocale) {
    const target = request.nextUrl.clone();
    target.pathname = `/${locale}/${routeSegments.join("/")}`;
    return NextResponse.redirect(target, 308);
  }

  if (routeSegments[0] === "tech-portal" && !hasLocale) {
    const target = request.nextUrl.clone();
    target.pathname = `/${locale}/${routeSegments.join("/")}`;
    return NextResponse.redirect(target, 308);
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const hostRejection = rejectNonStaffHost(request);
  if (hostRejection) return hostRejection;

  if (["/robots.txt", "/tech-portal/manifest.webmanifest", "/tech-portal-sw.js"].includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const rootRedirect = redirectStaffRoot(request);
  if (rootRedirect) return rootRedirect;

  if (request.nextUrl.pathname.includes("/auth/callback")) {
    return intlMiddleware(request);
  }

  const intlResponse = intlMiddleware(request);
  if (intlResponse.status >= 300 && intlResponse.status < 400) return intlResponse;

  const hasAuthCookie = request.cookies.getAll().some((cookie) =>
    cookie.name.includes("auth-token") || cookie.name.includes("sb-") || cookie.name.includes("supabase"),
  );

  return hasAuthCookie ? updateSession(request, intlResponse) : intlResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
    "/",
    "/(th|en|ja|zh|ko|vi)/:path*",
  ],
};
