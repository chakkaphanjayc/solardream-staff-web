export type SalesPermission = "sales:read" | "sales:write";
export type SalesPrincipal = { active: boolean; userId: string; permissions: readonly string[] };
export type SalesResource = { ownerUserId: string; assignments?: readonly { userId: string; active: boolean; expiresAt?: Date | null }[] };
export function canAccessSalesResource(principal: SalesPrincipal, resource: SalesResource, permission: SalesPermission, now = new Date()): boolean {
  if (!principal.active) return false;
  const permissions = new Set(principal.permissions);
  if (permissions.has("*") || permissions.has(`${permission}:all`)) return true;
  if (!permissions.has(permission) && !permissions.has(`${permission}:own`)) return false;
  if (resource.ownerUserId === principal.userId) return true;
  return Boolean(resource.assignments?.some((assignment) => assignment.userId === principal.userId && assignment.active && (!assignment.expiresAt || assignment.expiresAt > now)));
}
