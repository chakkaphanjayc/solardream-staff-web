import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createDiscourseConnectResponse,
  getDiscourseSsoLoginUrl,
  verifyAndParseDiscourseConnectRequest,
} from "@/lib/discourseConnect";
import { getRequestOrigin } from "@/lib/siteUrl";
import { createClient } from "@/utils/supabase/server";

const DEFAULT_LOCALE = "th";

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  const entry = cookieHeader
    .split(/;\s*/)
    .find((cookie) => cookie.startsWith(`${name}=`));

  if (!entry) return null;

  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return null;
  }
}

function getLocale(request: Request, requestUrl: URL) {
  const locale = requestUrl.searchParams.get("locale");
  if (locale === "en" || locale === "th") return locale;

  const cookieLocale = getCookieValue(request, "solardream_forum_locale");
  if (cookieLocale === "en" || cookieLocale === "th") return cookieLocale;

  const acceptLanguage = request.headers.get("accept-language")?.toLowerCase() || "";
  return acceptLanguage.startsWith("en") ? "en" : DEFAULT_LOCALE;
}

function getStringMetadata(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getUsername(source: string, fallbackId: string) {
  const sanitized = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 20);

  if (sanitized.length >= 3) return sanitized;

  const fallback = fallbackId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 14);
  return `solar_${fallback || "member"}`;
}

function getProfileName(
  localUser: { fullName: string; name: string | null },
  metadata: Record<string, unknown> | undefined,
  email: string,
) {
  return (
    localUser.fullName.trim() ||
    localUser.name?.trim() ||
    getStringMetadata(metadata, "full_name") ||
    getStringMetadata(metadata, "name") ||
    email.split("@", 1)[0]
  );
}

function badRequest() {
  return NextResponse.json(
    { error: "Invalid DiscourseConnect request." },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

function redirectNoStore(url: URL | string) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const sso = requestUrl.searchParams.get("sso");
  const sig = requestUrl.searchParams.get("sig");

  if (!sso || !sig) return badRequest();

  try {
    const { nonce, returnSsoUrl } = verifyAndParseDiscourseConnectRequest(sso, sig);
    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      console.warn("[DiscourseConnect] Failed to resolve the active session.", { code: sessionError.code });
    }

    if (!user || !user.email_confirmed_at || !user.email) {
      const origin = getRequestOrigin(request.url, request.headers);
      const loginUrl = new URL(`/${getLocale(request, requestUrl)}/login`, origin);
      loginUrl.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
      return redirectNoStore(loginUrl);
    }

    const email = user.email.trim().toLowerCase();
    const localUser = await db.query.users.findFirst({
      columns: { id: true, email: true, fullName: true, name: true, isActive: true, anonymizedAt: true, deletionRequestedAt: true },
      where: eq(users.id, user.id),
    });

    if (
      !localUser ||
      !localUser.isActive ||
      localUser.anonymizedAt ||
      localUser.deletionRequestedAt ||
      localUser.email.trim().toLowerCase() !== email
    ) {
      console.warn("[DiscourseConnect] Authenticated account is not eligible for forum SSO.", { userId: user.id });
      return NextResponse.json(
        { error: "Your account is not available for forum sign-in." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const metadata = user.user_metadata as Record<string, unknown> | undefined;
    const usernameSource =
      getStringMetadata(metadata, "username") ||
      getStringMetadata(metadata, "preferred_username") ||
      email.split("@", 1)[0];
    const { sso: responseSso, sig: responseSignature } = createDiscourseConnectResponse(nonce, {
      email,
      externalId: localUser.id,
      username: getUsername(usernameSource, localUser.id),
      name: getProfileName(localUser, metadata, email),
    });

    return redirectNoStore(getDiscourseSsoLoginUrl(returnSsoUrl, responseSso, responseSignature));
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid DiscourseConnect signature.") {
      console.warn("[DiscourseConnect] Rejected an SSO request with an invalid signature.");
      return NextResponse.json(
        { error: "Invalid DiscourseConnect request." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("[DiscourseConnect] Unable to complete SSO.", error);
    return badRequest();
  }
}
