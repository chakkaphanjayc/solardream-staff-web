import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { eq, or } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getRequestOrigin } from "@/lib/siteUrl";
import {
  AUTH_NEXT_PATH_COOKIE,
  getAuthNextPathFromCookieHeader,
} from "@/lib/authRedirect";
import { getSafeInternalPath } from "@/lib/safeRedirect";
import { normalizePreferredLanguage, type PreferredLanguage } from "@/lib/userLanguage";
import { enforcePublicApiRateLimit } from "@/lib/apiRateLimit";


type LineTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type LineSuccessfulTokenResponse = LineTokenResponse & {
  access_token: string;
};

type LineUserInfoResponse = {
  sub?: string;
  name?: string;
  picture?: string;
  email?: string;
  error?: string;
  error_description?: string;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function getLineClientId() {
  return process.env.LINE_CLIENT_ID?.trim() || requireEnv("NEXT_PUBLIC_LINE_CLIENT_ID");
}

function getPublicOrigin(request: Request) {
  return getRequestOrigin(request.url, request.headers);
}

function getPreferredLanguageFromRequest(request: Request): PreferredLanguage {
  const cookieHeader = request.headers.get("cookie") || "";
  const value = cookieHeader
    .split(/;\s*/)
    .find((cookie) => cookie.startsWith("solardream_preferred_language="))
    ?.slice("solardream_preferred_language=".length);

  try {
    return normalizePreferredLanguage(value ? decodeURIComponent(value) : undefined);
  } catch {
    return normalizePreferredLanguage(undefined);
  }
}

function getLoginFailureRedirect(origin: string, preferredLanguage: PreferredLanguage) {
  return `${origin}/${preferredLanguage}/login?error=line_auth_failed`;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decodeJwtPayload<T extends Record<string, unknown>>(token: string | undefined) {
  if (!token) return null;

  const [, payload] = token.split(".");
  if (!payload) return null;

  const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
  const paddedPayload = normalizedPayload.padEnd(
    normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
    "=",
  );
  const json = Buffer.from(paddedPayload, "base64").toString("utf8");
  return JSON.parse(json) as T;
}

async function exchangeLineCodeForTokens({
  code,
  clientId,
  clientSecret,
  redirectUri,
}: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const payload = (await response.json()) as LineTokenResponse;

  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "LINE token exchange failed.");
  }

  return payload as LineSuccessfulTokenResponse;
}

async function getLineUserInfo(accessToken: string, idToken: string | undefined) {
  const response = await fetch("https://api.line.me/oauth2/v2.1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const userInfo = (await response.json()) as LineUserInfoResponse;

  if (!response.ok || userInfo.error) {
    throw new Error(userInfo.error_description || userInfo.error || "LINE userinfo request failed.");
  }

  const idTokenPayload = decodeJwtPayload<Record<string, unknown>>(idToken);
  const lineUserId = getString(userInfo.sub) || getString(idTokenPayload?.sub);
  const email = getString(userInfo.email) || getString(idTokenPayload?.email);
  const displayName = getString(userInfo.name) || getString(idTokenPayload?.name);
  const pictureUrl = getString(userInfo.picture) || getString(idTokenPayload?.picture);

  if (!lineUserId) throw new Error("LINE profile did not include a user ID.");
  if (!email) throw new Error("LINE profile did not include an email address.");

  return {
    lineUserId,
    email: email.toLowerCase(),
    displayName,
    pictureUrl,
  };
}

async function provisionSupabaseUser(profile: {
  lineUserId: string;
  email: string;
  displayName: string | null;
  pictureUrl: string | null;
}, preferredLanguage: PreferredLanguage) {
  const supabase = createSupabaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const metadata = {
    provider: "line",
    line_user_id: profile.lineUserId,
    sub: profile.lineUserId,
    email: profile.email,
    name: profile.displayName,
    full_name: profile.displayName,
    avatar_url: profile.pictureUrl,
    picture: profile.pictureUrl,
    preferred_language: preferredLanguage,
  };

  const existingUser = await db.query.users.findFirst({
    where: or(eq(users.lineUserId, profile.lineUserId), eq(users.email, profile.email)),
  });

  const upsertLocalProfile = async (userId: string) => {
    await db
      .insert(users)
      .values({
        id: userId,
        email: profile.email,
        name: profile.displayName,
        fullName: profile.displayName || "",
        role: "USER",
        lineUserId: profile.lineUserId,
        isLineBlocked: false,
        preferredLanguage,
        ...(profile.pictureUrl ? { avatarUrl: profile.pictureUrl } : {}),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          lineUserId: profile.lineUserId,
          lineLinkNonce: null,
          isLineBlocked: false,
          preferredLanguage,
          ...(profile.displayName ? { name: profile.displayName, fullName: profile.displayName } : {}),
          ...(profile.pictureUrl ? { avatarUrl: profile.pictureUrl } : {}),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        },
      });
  };

  if (existingUser) {
    const { error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      user_metadata: metadata,
      app_metadata: {
        provider: "line",
        role: "client",
      },
    });

    if (error) {
      console.warn("[LINE Auth] Supabase metadata update was deferred:", error.message);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ lineUserId: null, updatedAt: new Date() })
        .where(eq(users.lineUserId, profile.lineUserId));

      await tx
        .update(users)
        .set({
          lineUserId: profile.lineUserId,
          lineLinkNonce: null,
          isLineBlocked: false,
          preferredLanguage,
          ...(existingUser.name || !profile.displayName ? {} : { name: profile.displayName }),
          ...(existingUser.fullName || !profile.displayName ? {} : { fullName: profile.displayName }),
          ...(existingUser.avatarUrl || !profile.pictureUrl ? {} : { avatarUrl: profile.pictureUrl }),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id));
    });

    try {
      const { ensureUserConsentSync } = await import("@/lib/userConsent");
      await ensureUserConsentSync(existingUser.id);
    } catch (syncError) {
      console.warn("[LINE Auth] Listmonk sync was deferred:", syncError);
    }

    return { email: existingUser.email, isNewUser: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: profile.email,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: {
      provider: "line",
      role: "client",
    },
  });

  if (error) {
    if (!/already|registered|exists/i.test(error.message)) {
      throw new Error(error.message);
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });
    if (linkError) throw new Error(linkError.message);
    if (!linkData.user?.id) throw new Error("Supabase did not return an existing user ID.");

    const { error: updateError } = await supabase.auth.admin.updateUserById(linkData.user.id, {
      user_metadata: metadata,
      app_metadata: {
        provider: "line",
        role: "client",
      },
    });
    if (updateError) throw new Error(updateError.message);

    await upsertLocalProfile(linkData.user.id);
    try {
      const { ensureUserConsentSync } = await import("@/lib/userConsent");
      await ensureUserConsentSync(linkData.user.id);
    } catch (syncError) {
      console.warn("[LINE Auth] Listmonk sync was deferred:", syncError);
    }
    return { email: profile.email, isNewUser: false };
  }

  if (!data.user?.id) throw new Error("Supabase did not return a user ID.");

  await upsertLocalProfile(data.user.id);

  try {
    const { ensureUserConsentSync } = await import("@/lib/userConsent");
    await ensureUserConsentSync(data.user.id);
  } catch (syncError) {
    console.warn("[LINE Auth] Listmonk sync was deferred:", syncError);
  }

  return { email: profile.email, isNewUser: true };
}

async function generateSupabaseCallbackUrl(
  email: string,
  origin: string,
  isNewUser: boolean,
  preferredLanguage: PreferredLanguage,
  nextPath: string,
) {
  const supabase = createSupabaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error) throw new Error(error.message);

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error("Supabase did not return a magic link token hash.");

  const callbackUrl = new URL("/api/auth/callback", origin);
  callbackUrl.searchParams.set("token_hash", tokenHash);
  callbackUrl.searchParams.set("type", "magiclink");
  callbackUrl.searchParams.set("locale", preferredLanguage);
  callbackUrl.searchParams.set(
    "next",
    nextPath,
  );
  if (isNewUser) callbackUrl.searchParams.set("authNewUser", "1");

  return callbackUrl.toString();
}

export async function GET(request: Request) {
  const rateLimited = await enforcePublicApiRateLimit(request, {
    namespace: "line-auth-callback",
    limit: 10,
    windowSeconds: 300,
  });
  if (rateLimited) return rateLimited;

  const sourceUrl = new URL(request.url);
  const origin = getPublicOrigin(request);
  const preferredLanguage = getPreferredLanguageFromRequest(request);
  const code = sourceUrl.searchParams.get("code");
  const error = sourceUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(getLoginFailureRedirect(origin, preferredLanguage));
  }

  try {
    const tokens = await exchangeLineCodeForTokens({
      code,
      clientId: getLineClientId(),
      clientSecret: requireEnv("LINE_CLIENT_SECRET"),
      redirectUri: `${origin}/api/auth/line/callback`,
    });
    const profile = await getLineUserInfo(tokens.access_token, tokens.id_token);
    const { email, isNewUser } = await provisionSupabaseUser(profile, preferredLanguage);
    const defaultNextPath = `/${preferredLanguage}?authProvider=line&authEvent=login${isNewUser ? "&authNewUser=1" : ""}`;
    const nextPath = getSafeInternalPath(
      getAuthNextPathFromCookieHeader(request.headers.get("cookie")),
      defaultNextPath,
    );
    const loginLink = await generateSupabaseCallbackUrl(
      email,
      origin,
      isNewUser,
      preferredLanguage,
      nextPath,
    );

    const response = NextResponse.redirect(loginLink);
    response.cookies.delete("solardream_preferred_language");
    response.cookies.delete(AUTH_NEXT_PATH_COOKIE);
    return response;
  } catch (callbackError) {
    console.error("[LINE Auth] Callback failed:", callbackError);
    const response = NextResponse.redirect(getLoginFailureRedirect(origin, preferredLanguage));
    response.cookies.delete("solardream_preferred_language");
    response.cookies.delete(AUTH_NEXT_PATH_COOKIE);
    return response;
  }
}
