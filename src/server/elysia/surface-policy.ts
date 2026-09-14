import {
  getConfiguredAdminSiteUrl,
  getConfiguredPublicSiteUrl,
  getHostname,
  getRequestHostHeader,
  isLocalHostname,
} from "@/lib/siteUrl";

export type ApiSurface = "customer" | "staff";

function isLocalHost(host: string) {
  return isLocalHostname(host);
}

export function isSurfaceRequestAllowed(request: Request, surface: ApiSurface) {
  const host = getRequestHostHeader(request.headers, new URL(request.url).host);
  if (isLocalHost(host)) return true;

  const configuredOrigin = surface === "customer" ? getConfiguredPublicSiteUrl() : getConfiguredAdminSiteUrl();
  return getHostname(host) === getHostname(configuredOrigin);
}

export function createSurfaceMismatchResponse(surface: ApiSurface) {
  const owner = surface === "customer" ? "customer" : "staff";
  return Response.json(
    { success: false, error: `This API belongs to the SolarDream ${owner} application.` },
    {
      status: 421,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
