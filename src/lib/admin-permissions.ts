import "server-only";

import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { staffAccessAssignments, staffAccessRoles } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";

export const ADMIN_PERMISSIONS = {
  overviewView: "admin:overview:view",
  inboxView: "inbox:view",
  inboxManage: "inbox:manage",
  lineContentView: "line:content:view",
  lineContentEdit: "line:content:edit",
  lineContentPublish: "line:content:publish",
  lineRichMenuView: "line:richmenu:view",
  lineRichMenuEdit: "line:richmenu:edit",
  lineRichMenuPublish: "line:richmenu:publish",
  lineAutomationView: "line:automation:view",
  lineAutomationEdit: "line:automation:edit",
  lineAutomationPublish: "line:automation:publish",
  lineTest: "line:test:view",
  lineIntegrationsView: "line:integrations:view",
  lineIntegrationsEdit: "line:integrations:edit",
  auditView: "audit:view",
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

const DEFAULT_STAFF_PERMISSIONS = new Set<AdminPermission>([
  ADMIN_PERMISSIONS.overviewView,
  ADMIN_PERMISSIONS.inboxView,
  ADMIN_PERMISSIONS.inboxManage,
  ADMIN_PERMISSIONS.lineContentView,
  ADMIN_PERMISSIONS.lineContentEdit,
  ADMIN_PERMISSIONS.lineRichMenuView,
  ADMIN_PERMISSIONS.lineAutomationView,
  ADMIN_PERMISSIONS.lineTest,
]);

export async function hasAdminPermission(userId: string, role: string | null | undefined, permission: AdminPermission) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (DEFAULT_STAFF_PERMISSIONS.has(permission) && (role === "STAFF" || role === "MANAGER")) return true;

  const rows = await db
    .select({ permissions: staffAccessRoles.permissions })
    .from(staffAccessAssignments)
    .innerJoin(staffAccessRoles, eq(staffAccessAssignments.roleId, staffAccessRoles.id))
    .where(and(
      eq(staffAccessAssignments.userId, userId),
      eq(staffAccessAssignments.isActive, true),
      eq(staffAccessRoles.isActive, true),
      or(isNull(staffAccessAssignments.expiresAt), gt(staffAccessAssignments.expiresAt, new Date())),
    ));

  return rows.some((row) => row.permissions.includes("*") || row.permissions.includes(permission));
}

export async function requireAdminPermission(permission: AdminPermission) {
  const user = await requireStaff();
  if (!(await hasAdminPermission(user.id, user.role, permission))) {
    throw new Error("You do not have permission to perform this action.");
  }
  return user;
}

