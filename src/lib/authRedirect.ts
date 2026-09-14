import { defaultLocale, isLocale } from "@/i18n/locales";
import { getSafeInternalPath } from "@/lib/safeRedirect";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

export const AUTH_NEXT_PATH_COOKIE = "solardream_auth_next";
export const AUTH_NEXT_PATH_COOKIE_MAX_AGE = 600;

type SignupEmailRedirectInput = {
  locale: unknown;
  nextPath: unknown;
};

export function buildSignupEmailRedirectTo({
  locale: rawLocale,
  nextPath: rawNextPath,
}: SignupEmailRedirectInput) {
  const locale = isLocale(typeof rawLocale === "string" ? rawLocale : null)
    ? rawLocale
    : defaultLocale;
  const fallbackPath = `/${locale}`;
  const nextPath = getSafeInternalPath(
    typeof rawNextPath === "string" ? rawNextPath : null,
    fallbackPath,
  );
  const callbackUrl = new URL(
    `/${locale}/auth/callback`,
    getConfiguredPublicSiteUrl(),
  );

  callbackUrl.searchParams.set("next", nextPath);
  return callbackUrl.toString();
}

export function setAuthNextPathCookie(nextPath: string) {
  if (typeof document === "undefined") return;

  const safePath = getSafeInternalPath(nextPath, "/");
  const encodedPath = encodeURIComponent(safePath);

  // A Discourse SSO request is usually small, but do not ask the browser to
  // persist a value that would exceed the practical per-cookie limit.
  if (encodedPath.length > 3_800) return;

  const secureAttribute = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_NEXT_PATH_COOKIE}=${encodedPath}; Path=/; Max-Age=${AUTH_NEXT_PATH_COOKIE_MAX_AGE}; SameSite=Lax${secureAttribute}`;
}

export function getAuthNextPathFromCookieHeader(cookieHeader: string | null) {
  const entry = (cookieHeader || "")
    .split(/;\s*/)
    .find((cookie) => cookie.startsWith(`${AUTH_NEXT_PATH_COOKIE}=`));

  if (!entry) return null;

  try {
    return decodeURIComponent(entry.slice(AUTH_NEXT_PATH_COOKIE.length + 1));
  } catch {
    return null;
  }
}
