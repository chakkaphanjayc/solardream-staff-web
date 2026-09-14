import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { ensureUserExists } from "@/app/actions/auth";
import { claimEstimateDraftToken, ESTIMATE_DRAFT_COOKIE } from "@/lib/estimateDraftBridge";
import {
  AUTH_NEXT_PATH_COOKIE,
  getAuthNextPathFromCookieHeader,
} from "@/lib/authRedirect";
import { getCookieDomain, getRequestHostHeader, getRequestOrigin } from "@/lib/siteUrl";
import { getSafeInternalPath } from "@/lib/safeRedirect";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";


function getLocale(value: string | null) {
  return value === "en" || value === "th" ? value : "th";
}

function getPublicOrigin(request: Request) {
  return getRequestOrigin(request.url, request.headers);
}

function isLineIdentityProvider(provider: string | undefined) {
  return provider === "line" || provider === "custom:line" || provider === "custom_line";
}

function appendAuthAnalyticsFlags(nextPath: string, provider: "google" | "line", isNewUser: boolean) {
  const markerUrl = new URL(nextPath, "https://solar-dream.local");
  markerUrl.searchParams.set("authProvider", provider);
  markerUrl.searchParams.set("authEvent", "login");
  if (isNewUser) markerUrl.searchParams.set("authNewUser", "1");
  return `${markerUrl.pathname}${markerUrl.search}${markerUrl.hash}`;
}

function getLoginErrorRedirect(origin: string, locale: string, sourceUrl: URL) {
  const error = sourceUrl.searchParams.get("error");
  const errorCode = sourceUrl.searchParams.get("error_code");
  const errorDescription = sourceUrl.searchParams.get("error_description");
  const target = new URL(`/${locale}/login`, origin);
  target.searchParams.set("authError", "callback");
  if (error) target.searchParams.set("error", error);
  if (errorCode) target.searchParams.set("error_code", errorCode);
  if (errorDescription) target.searchParams.set("error_description", errorDescription);
  return target.toString();
}

function clearAuthNextPathCookie(response: NextResponse) {
  response.cookies.delete(AUTH_NEXT_PATH_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const sourceUrl = new URL(request.url);
  const locale = getLocale(sourceUrl.searchParams.get("locale"));
  const origin = getPublicOrigin(request);
  const code = sourceUrl.searchParams.get("code");
  const tokenHash = sourceUrl.searchParams.get("token_hash");
  const verificationType = sourceUrl.searchParams.get("type");

  const pendingCookies: Array<{
    name: string;
    value: string;
    options: Parameters<NextResponse["cookies"]["set"]>[2];
  }> = [];

  const redirectWithCookies = (url: string) => {
    const response = NextResponse.redirect(url);
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  };

  if (!code && !tokenHash) {
    return clearAuthNextPathCookie(redirectWithCookies(getLoginErrorRedirect(origin, locale, sourceUrl)));
  }

  try {
    const cookieStore = await cookies();
    const host = getRequestHostHeader(request.headers);
    const cookieDomain = getCookieDomain(host);
    const isProd = process.env.NODE_ENV === "production";

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                const cookieOptions = {
                  ...options,
                  secure: isProd,
                  sameSite: "lax" as const,
                  path: "/",
                  ...(cookieDomain ? { domain: cookieDomain } : {}),
                };

                cookieStore.set(name, value, {
                  ...cookieOptions,
                });
                pendingCookies.push({ name, value, options: cookieOptions });
              });
            } catch {
              // Cookie writes can be unavailable in static render contexts.
            }
          },
        },
      },
    );

    const { error } = tokenHash
      ? await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: verificationType === "magiclink" ? "magiclink" : "email",
        })
      : await supabase.auth.exchangeCodeForSession(code!);
    if (error) {
      console.error("[Auth Callback] Error exchanging code:", error);
      const target = new URL(`/${locale}/login`, origin);
      target.searchParams.set("authError", "callback");
      target.searchParams.set("error_description", error.message);
      return clearAuthNextPathCookie(redirectWithCookies(target.toString()));
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return clearAuthNextPathCookie(
        redirectWithCookies(`${origin}/${locale}/login?authError=callback&error_description=session_missing`),
      );
    }

    const normalizedEmail = user.email?.trim().toLowerCase();
    const existingDbUser = await db.query.users.findFirst({
      where: normalizedEmail
        ? or(eq(users.id, user.id), eq(users.email, normalizedEmail))
        : eq(users.id, user.id),
    });
    const dbUser = await ensureUserExists(user);
    if (!dbUser) {
      await supabase.auth.signOut();
      return clearAuthNextPathCookie(
        redirectWithCookies(`${origin}/${locale}/login?authError=account_inactive`),
      );
    }

    const estimateToken =
      request.headers
        .get("cookie")
        ?.split(/;\s*/)
        .find((item) => item.startsWith(`${ESTIMATE_DRAFT_COOKIE}=`))
        ?.slice(ESTIMATE_DRAFT_COOKIE.length + 1) || "";
    const clearEstimateDraftCookie = estimateToken
      ? (await claimEstimateDraftToken(dbUser.id, estimateToken)).terminal
      : false;

    const lineLinkToken =
      sourceUrl.searchParams.get("linkToken") ||
      request.headers
        .get("cookie")
        ?.split(/;\s*/)
        .find((cookie) => cookie.startsWith("line_link_token="))
        ?.split("=")[1];

    if (lineLinkToken) {
      const response = redirectWithCookies(`${origin}/${locale}/login?linkToken=${lineLinkToken}`);
      response.cookies.delete("line_link_token");
      if (clearEstimateDraftCookie) response.cookies.delete(ESTIMATE_DRAFT_COOKIE);
      return clearAuthNextPathCookie(response);
    }

    const isLineLogin =
      user.identities?.some((identity) => isLineIdentityProvider(identity.provider)) ||
      isLineIdentityProvider(
        typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : undefined,
    );
    const isGoogleLogin =
      user.identities?.some((identity) => identity.provider === "google") ||
      user.app_metadata?.provider === "google";
    const nextPath = getSafeInternalPath(
      sourceUrl.searchParams.get("next") || getAuthNextPathFromCookieHeader(request.headers.get("cookie")),
      `/${locale}`,
    );
    const isNewUser = sourceUrl.searchParams.get("authNewUser") === "1" || !existingDbUser;
    const redirectPath = isLineLogin
      ? appendAuthAnalyticsFlags(nextPath, "line", isNewUser)
      : isGoogleLogin
        ? appendAuthAnalyticsFlags(nextPath, "google", isNewUser)
        : nextPath;
    const response = redirectWithCookies(`${origin}${redirectPath}`);
    if (clearEstimateDraftCookie) response.cookies.delete(ESTIMATE_DRAFT_COOKIE);
    return clearAuthNextPathCookie(response);
  } catch (error) {
    console.error("[Auth Callback] Fatal error:", error);
    const message = error instanceof Error ? error.message : "callback_failed";
    return clearAuthNextPathCookie(
      redirectWithCookies(`${origin}/${locale}/login?authError=callback&error_description=${encodeURIComponent(message)}`),
    );
  }
}
