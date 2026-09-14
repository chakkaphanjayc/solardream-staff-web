import {
  isConfiguredAdminHost,
  isConfiguredPublicHost,
  isLocalSiteUrl,
} from "@/lib/siteUrl";

export const RUNTIME_ROLES = ["all", "public", "admin"] as const;
export type RuntimeRole = (typeof RUNTIME_ROLES)[number];

const RUNTIME_ROLE_ENV = "SOLARDREAM_RUNTIME_ROLE";

/**
 * Runtime role is deliberately read through bracket notation so the same
 * image can be deployed twice with different roles in Coolify.
 */
export function getRuntimeRole(): RuntimeRole {
  const configuredRole = process.env[RUNTIME_ROLE_ENV]?.trim().toLowerCase();
  return configuredRole === "public" || configuredRole === "admin"
    ? configuredRole
    : "all";
}

function isLocalRequestHost(hostOrUrl: string) {
  const value = hostOrUrl.includes("://") ? hostOrUrl : `http://${hostOrUrl}`;
  return isLocalSiteUrl(value);
}

export function isRuntimeRoleHostAllowed(role: RuntimeRole, hostOrUrl: string) {
  if (role === "all" || isLocalRequestHost(hostOrUrl)) return true;

  if (role === "public") {
    return isConfiguredPublicHost(hostOrUrl);
  }

  return isConfiguredAdminHost(hostOrUrl);
}
