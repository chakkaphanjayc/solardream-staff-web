const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;
const DEFAULT_PUBLIC_SITE_URL = "https://solar-dream.org";
const DEFAULT_ADMIN_SITE_URL = "https://admin.solar-dream.org";

function stripTrailingSlash(value: string | null | undefined) {
  return (value || "").trim().replace(/\/$/, "");
}

/**
 * Prefer the request's direct Host header. A reverse proxy should preserve it;
 * trusting X-Forwarded-Host first lets an unsanitized client header change
 * host-aware redirects and cookie scoping.
 */
export function getRequestHostHeader(headers: Headers, fallback = "") {
  return (
    headers.get("host")?.split(",")[0]?.trim() ||
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    fallback
  );
}

export function isLocalSiteUrl(value: string) {
  return LOCALHOST_PATTERN.test(stripTrailingSlash(value));
}

export function getConfiguredPublicSiteUrl() {
  const configured = stripTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL || "");
  if (!configured || isLocalSiteUrl(configured)) {
    return DEFAULT_PUBLIC_SITE_URL;
  }
  return configured;
}

export function getConfiguredAdminSiteUrl() {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_ADMIN_URL || "") || DEFAULT_ADMIN_SITE_URL;
}

export function getHostname(hostOrUrl: string | null | undefined) {
  const value = (hostOrUrl || "").trim();
  if (!value) return "";

  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return value.split("/")[0]?.split(":")[0]?.toLowerCase() || "";
  }
}

export function isLocalHostname(hostOrUrl: string) {
  const hostname = getHostname(hostOrUrl);
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  );
}

export function isCloudflareWorkersHostname(hostOrUrl: string) {
  const hostname = getHostname(hostOrUrl);
  return hostname.endsWith(".workers.dev");
}

function normalizeCookieHostname(hostOrUrl: string) {
  return getHostname(hostOrUrl).replace(/^\.+/, "").toLowerCase();
}

function isHostWithinDomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isConfiguredAdminHost(hostOrUrl: string) {
  return getHostname(hostOrUrl) === getHostname(getConfiguredAdminSiteUrl());
}

export function isConfiguredPublicHost(hostOrUrl: string) {
  return getHostname(hostOrUrl) === getHostname(getConfiguredPublicSiteUrl());
}

export function getBrowserPublicOrigin() {
  if (typeof window === "undefined") {
    return getConfiguredPublicSiteUrl();
  }

  const browserOrigin = stripTrailingSlash(window.location.origin);
  if (isConfiguredAdminHost(browserOrigin)) {
    return getConfiguredPublicSiteUrl();
  }
  return isLocalSiteUrl(browserOrigin) ? getConfiguredPublicSiteUrl() : browserOrigin;
}

export function getBrowserAdminOrigin() {
  if (typeof window === "undefined") {
    return getConfiguredAdminSiteUrl();
  }

  const browserOrigin = stripTrailingSlash(window.location.origin);
  return isLocalSiteUrl(browserOrigin) ? browserOrigin : getConfiguredAdminSiteUrl();
}

export function getBrowserAdminUrl(pathname: string) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getBrowserAdminOrigin()}${path}`;
}

export function getRequestPublicOrigin(requestUrl: string) {
  return stripTrailingSlash(new URL(requestUrl).origin);
}

/**
 * Resolve a browser-facing origin from an allowlisted SolarDream host.
 * Unknown production hosts fall back to the public origin instead of being
 * reflected into OAuth redirects or generated links.
 */
export function getRequestOrigin(requestUrl: string, headers?: Headers) {
  const requestHost = headers ? getRequestHostHeader(headers) : "";

  if (isConfiguredAdminHost(requestHost)) {
    return getConfiguredAdminSiteUrl();
  }

  if (isConfiguredPublicHost(requestHost)) {
    return getConfiguredPublicSiteUrl();
  }

  const requestOrigin = new URL(requestUrl).origin;
  const requestHostname = getHostname(requestOrigin);
  const allowLocalDevelopmentOrigin =
    process.env.NODE_ENV !== "production" && isLocalHostname(requestHostname);
  return allowLocalDevelopmentOrigin ? requestOrigin : getConfiguredPublicSiteUrl();
}

export function getCookieDomain(hostOrUrl: string) {
  const hostname = normalizeCookieHostname(hostOrUrl);

  // A production cookie domain is invalid on localhost and browsers silently
  // discard it. Always keep local development host-only, even when a shared
  // production AUTH_COOKIE_DOMAIN is present in the developer's .env file.
  if (!hostname || isLocalHostname(hostname)) return undefined;

  const explicitlyConfigured = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicitlyConfigured) {
    const explicitHostname = normalizeCookieHostname(explicitlyConfigured);
    if (!explicitHostname || isLocalHostname(explicitHostname)) return undefined;
    if (!isHostWithinDomain(hostname, explicitHostname)) return undefined;
    return `.${explicitHostname}`;
  }

  try {
    if (isLocalHostname(hostname)) return undefined;

    const publicHostname = getHostname(getConfiguredPublicSiteUrl());
    const adminHostname = getHostname(getConfiguredAdminSiteUrl());
    if (hostname !== publicHostname && hostname !== adminHostname) return undefined;

    const publicParts = publicHostname.split(".");
    const adminParts = adminHostname.split(".");
    const publicRegistrableDomain = publicParts.slice(-2).join(".");
    const adminRegistrableDomain = adminParts.slice(-2).join(".");
    return publicRegistrableDomain === adminRegistrableDomain
      ? `.${publicRegistrableDomain}`
      : undefined;
  } catch {
    // Return undefined on any parse error
  }
  return undefined;
}
