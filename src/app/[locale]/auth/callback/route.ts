import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getCookieDomain, getRequestHostHeader, getRequestOrigin } from "@/lib/siteUrl";
import { getSafeInternalPath } from "@/lib/safeRedirect";
import { ensureUserExists } from "@/app/actions/auth";
import { claimEstimateDraftToken, ESTIMATE_DRAFT_COOKIE } from "@/lib/estimateDraftBridge";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";


function getPublicOrigin(request: Request) {
  return getRequestOrigin(request.url, request.headers);
}

function appendAuthAnalyticsFlags(nextPath: string, provider: "google" | "line", isNewUser: boolean) {
  const markerUrl = new URL(nextPath, "https://solar-dream.local");
  markerUrl.searchParams.set("authProvider", provider);
  markerUrl.searchParams.set("authEvent", "login");
  if (isNewUser) markerUrl.searchParams.set("authNewUser", "1");
  return `${markerUrl.pathname}${markerUrl.search}${markerUrl.hash}`;
}

function getAuthProvider(user: SupabaseUser) {
  if (user.identities?.some((identity) => identity.provider === "google") || user.app_metadata?.provider === "google") {
    return "google";
  }
  if (
    user.identities?.some((identity) =>
      identity.provider === "line" ||
      identity.provider === "custom:line" ||
      identity.provider === "custom_line"
    ) ||
    user.app_metadata?.provider === "line" ||
    user.app_metadata?.provider === "custom:line"
  ) {
    return "line";
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  let locale = "th";
  let origin = "https://solar-dream.org";
  try {
    locale = (await params).locale || "th";
    origin = getPublicOrigin(request);
    const sourceUrl = new URL(request.url);
    const code = sourceUrl.searchParams.get("code");

    if (code) {
      const cookieStore = await cookies();
      const isProd = process.env.NODE_ENV === "production";
      const host = getRequestHostHeader(request.headers);
      const cookieDomain = getCookieDomain(host);

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              const allCookies = cookieStore.getAll();
              console.log("[Auth Callback] getAll() cookies:", allCookies.map(c => ({ name: c.name, value: c.value ? c.value.substring(0, 10) + "..." : "" })));
              return allCookies;
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) => {
                  console.log("[Auth Callback] setAll cookie:", name, { ...options, domain: cookieDomain });
                  cookieStore.set(name, value, {
                    ...options,
                    secure: isProd,
                    sameSite: "lax",
                    path: "/",
                    ...(cookieDomain ? { domain: cookieDomain } : {}),
                  });
                });
              } catch {
                // Ignore cookie errors during static rendering/server component context
              }
            },
          },
        }
      );

      // Check if session/user already exists from existing cookies (idempotency guard)
      let hasSession = false;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          hasSession = true;
          console.log("[Auth Callback] User already authenticated. Skipping code exchange.");
        }
      } catch (err) {
        console.error("[Auth Callback] Error checking existing user session:", err);
      }

      let error = null;
      if (!hasSession) {
        console.log("[Auth Callback] Exchanging code. Request cookies header:", request.headers.get("cookie"));
        const res = await supabase.auth.exchangeCodeForSession(code);
        error = res.error;
      }

      if (!error) {
        let clearEstimateDraftCookie = false;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const normalizedEmail = user.email?.trim().toLowerCase();
            const existingDbUser = await db.query.users.findFirst({
              where: normalizedEmail
                ? or(eq(users.id, user.id), eq(users.email, normalizedEmail))
                : eq(users.id, user.id),
            });
            const dbUser = await ensureUserExists(user);
            if (!dbUser) {
              await supabase.auth.signOut();
              return NextResponse.redirect(`${origin}/${locale}/login?authError=account_inactive`);
            }
            const provider = getAuthProvider(user);
            if (provider) {
              sourceUrl.searchParams.set("authProvider", provider);
              sourceUrl.searchParams.set("authEvent", "login");
              if (!existingDbUser) sourceUrl.searchParams.set("authNewUser", "1");
            }
            const estimateToken = request.headers.get("cookie")?.split(/;\s*/).find((item) => item.startsWith(`${ESTIMATE_DRAFT_COOKIE}=`))?.slice(ESTIMATE_DRAFT_COOKIE.length + 1) || "";
            if (estimateToken) clearEstimateDraftCookie = (await claimEstimateDraftToken(dbUser.id, estimateToken)).terminal;
          }
        } catch (err) {
          console.error("[Auth Callback] Failed to sync user:", err);
        }

        // Check if there is a line_link_token cookie
        const cookiesHeader = request.headers.get("cookie") || "";
        const lineLinkToken = cookiesHeader
          .split("; ")
          .find((cookie) => cookie.startsWith("line_link_token="))
          ?.split("=")[1];

        if (lineLinkToken) {
          const response = NextResponse.redirect(
            `${origin}/${locale}/login?linkToken=${lineLinkToken}`
          );
          // Clear the line link token cookie
          response.cookies.delete("line_link_token");
          if (clearEstimateDraftCookie) response.cookies.delete(ESTIMATE_DRAFT_COOKIE);
          return response;
        }

        const next = getSafeInternalPath(sourceUrl.searchParams.get("next"), `/${locale}`);
        const provider = sourceUrl.searchParams.get("authProvider");
        const redirectPath =
          provider === "google" || provider === "line"
            ? appendAuthAnalyticsFlags(next, provider, sourceUrl.searchParams.get("authNewUser") === "1")
            : next;
        const response = NextResponse.redirect(`${origin}${redirectPath}`);
        if (clearEstimateDraftCookie) response.cookies.delete(ESTIMATE_DRAFT_COOKIE);
        return response;
      } else {
        console.error("[Auth Callback] Error exchanging code:", error);
      }

      const query = sourceUrl.searchParams.toString();
      return NextResponse.redirect(
        `${origin}/${locale}/login${query ? `?${query}` : "?authError=callback"}`
      );
    }

    const query = new URL(request.url).searchParams.toString();
    return NextResponse.redirect(
      `${origin}/${locale}/login${query ? `?${query}` : "?authError=callback"}`
    );
  } catch (fatalErr) {
    // Top-level guard: prevent any unhandled exception from causing a 502.
    // Log the error and redirect to login with a safe error code.
    console.error("[Auth Callback] Fatal error — returning safe redirect:", fatalErr);
    return NextResponse.redirect(`${origin}/${locale}/login?authError=callback`);
  }
}
