import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import {
  externalAccessAccounts,
  installationTasks,
  installationWorkflowProjects,
  proposals,
  staffAccessAssignments,
  staffAccessRoles,
  users,
} from "@/db/schema";
import { recordAuditEventBestEffort } from "@/lib/auditLog";
import { STAFF_PERMISSION_OPTIONS } from "@/lib/developerAccessContracts";
import type {
  DeveloperAccessState,
  ExternalScopeType,
  ExternalWorkView,
  StaffResource,
  StaffScopeMode,
} from "@/lib/developerAccessContracts";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

export { STAFF_PERMISSION_OPTIONS } from "@/lib/developerAccessContracts";
export type {
  DeveloperAccessState,
  DeveloperAssignment,
  DeveloperExternalAccount,
  DeveloperProjectOption,
  DeveloperRole,
  DeveloperSalesProposal,
  DeveloperStaffMember,
  DeveloperTaskOption,
  ExternalScopeType,
  ExternalWorkView,
  StaffPermission,
  StaffResource,
  StaffScopeMode,
} from "@/lib/developerAccessContracts";

type DefaultRole = {
  code: string;
  name: string;
  description: string;
  permissions: readonly string[];
  scopeMode: StaffScopeMode;
};

export const DEFAULT_STAFF_ROLES: readonly DefaultRole[] = [
  {
    code: "SALES",
    name: "Sales",
    description: "Customer and quotation work assigned to the sales owner.",
    permissions: ["crm:read", "crm:read:own", "quotations:read", "quotations:read:own", "payments:read"],
    scopeMode: "OWN",
  },
  {
    code: "ENGINEER",
    name: "Engineer",
    description: "Installation projects and field tasks assigned to the engineer.",
    permissions: ["projects:read", "projects:read:own", "tasks:read", "tasks:read:own", "tickets:read:own", "assets:read"],
    scopeMode: "OWN",
  },
  {
    code: "OPERATIONS",
    name: "Operations",
    description: "Delivery coordination across installation projects and tickets.",
    permissions: ["projects:read", "projects:read:all", "tasks:read", "tasks:read:all", "tickets:read", "assets:read"],
    scopeMode: "ALL",
  },
  {
    code: "SUPPORT",
    name: "Support",
    description: "Customer support records and service tickets.",
    permissions: ["crm:read", "tickets:read", "tickets:write"],
    scopeMode: "ALL",
  },
  {
    code: "MANAGER",
    name: "Manager",
    description: "Cross-team operational visibility without Developer administration.",
    permissions: ["crm:read", "quotations:read", "projects:read", "projects:read:all", "tasks:read", "tasks:read:all", "tickets:read", "payments:read"],
    scopeMode: "ALL",
  },
  {
    code: "ADMIN",
    name: "Administrator",
    description: "Full Developer, access-control, and operational visibility.",
    permissions: ["*"],
    scopeMode: "ALL",
  },
  {
    code: "SUBCONTRACTOR",
    name: "Subcontractor",
    description: "Temporary external work access. Use an external account instead of a staff login.",
    permissions: ["external:work:read"],
    scopeMode: "OWN",
  },
];

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() || null;
}

function normalizePermissions(values: readonly string[]) {
  const allowed = new Set<string>(STAFF_PERMISSION_OPTIONS);
  return [...new Set(values.map((value) => value.trim()).filter((value) => allowed.has(value)))];
}

function normalizeScopeMode(value: string | null | undefined): StaffScopeMode {
  return value === "ALL" ? "ALL" : "OWN";
}

function normalizeExternalScopeType(value: string): ExternalScopeType | null {
  return value === "PROJECT" || value === "TASK" || value === "PROPOSAL" ? value : null;
}

/**
 * Access-control tables are deployment-owned schema. They are created by
 * `npm run db:migrate:staff-access` before the application starts; request
 * handlers must never issue DDL or compete for PostgreSQL schema locks.
 */
export async function ensureDeveloperAccessTables(): Promise<void> {}

export async function getDeveloperAccessState(): Promise<DeveloperAccessState> {
  await ensureDeveloperAccessTables();
  const now = new Date();

  const [roles, staff, assignments, projects, tasks, salesProposals, externalAccounts] = await Promise.all([
    db.query.staffAccessRoles.findMany({ orderBy: [asc(staffAccessRoles.code)] }),
    db.query.users.findMany({
      where: and(
        eq(users.isActive, true),
        or(
          eq(users.role, "STAFF"),
          eq(users.role, "MANAGER"),
          eq(users.role, "INSTALLER"),
          eq(users.role, "ADMIN"),
          eq(users.role, "SUPER_ADMIN"),
        ),
      ),
      columns: { id: true, email: true, name: true, fullName: true, role: true, department: true, isActive: true },
      orderBy: [asc(users.fullName), asc(users.email)],
      limit: 500,
    }),
    db.select({
      id: staffAccessAssignments.id,
      userId: staffAccessAssignments.userId,
      userName: users.fullName,
      userEmail: users.email,
      roleId: staffAccessAssignments.roleId,
      roleCode: staffAccessRoles.code,
      roleName: staffAccessRoles.name,
      scopeMode: staffAccessAssignments.scopeMode,
      expiresAt: staffAccessAssignments.expiresAt,
      isActive: staffAccessAssignments.isActive,
    })
      .from(staffAccessAssignments)
      .innerJoin(users, eq(staffAccessAssignments.userId, users.id))
      .innerJoin(staffAccessRoles, eq(staffAccessAssignments.roleId, staffAccessRoles.id))
      .where(and(eq(staffAccessAssignments.isActive, true), or(isNull(staffAccessAssignments.expiresAt), gt(staffAccessAssignments.expiresAt, now))))
      .orderBy(asc(users.fullName), asc(staffAccessRoles.code)),
    db.select({
      id: installationWorkflowProjects.id,
      projectCode: installationWorkflowProjects.projectCode,
      proposalId: installationWorkflowProjects.proposalId,
      customerName: users.fullName,
      customerFallbackName: users.name,
      status: installationWorkflowProjects.status,
      createdAt: installationWorkflowProjects.createdAt,
    })
      .from(installationWorkflowProjects)
      .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
      .innerJoin(users, eq(proposals.userId, users.id))
      .orderBy(desc(installationWorkflowProjects.createdAt))
      .limit(250),
    db.select({
      id: installationTasks.id,
      title: installationTasks.title,
      taskCode: installationTasks.taskCode,
      projectId: installationTasks.projectId,
      projectCode: installationWorkflowProjects.projectCode,
      proposalId: installationWorkflowProjects.proposalId,
      status: installationTasks.status,
    })
      .from(installationTasks)
      .innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
      .orderBy(desc(installationTasks.createdAt))
      .limit(500),
    db.query.proposals.findMany({
      columns: { id: true, status: true, salesOwnerId: true },
      with: { user: { columns: { name: true, fullName: true } } },
      orderBy: [desc(proposals.createdAt)],
      limit: 250,
    }),
    db.query.externalAccessAccounts.findMany({ orderBy: [desc(externalAccessAccounts.createdAt)], limit: 500 }),
  ]);

  const assignmentCounts = new Map<string, number>();
  for (const assignment of assignments) {
    assignmentCounts.set(assignment.roleId, (assignmentCounts.get(assignment.roleId) || 0) + 1);
  }

  return {
    roles: roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      scopeMode: normalizeScopeMode(role.scopeMode),
      isSystem: role.isSystem,
      isActive: role.isActive,
      assignmentCount: assignmentCounts.get(role.id) || 0,
      updatedAt: role.updatedAt.toISOString(),
    })),
    staff: staff.map((member) => ({
      id: member.id,
      email: member.email,
      name: text(member.fullName, text(member.name, member.email)),
      role: member.role,
      department: member.department,
      isActive: member.isActive,
    })),
    assignments: assignments.map((assignment) => ({
      ...assignment,
      userName: text(assignment.userName, assignment.userEmail),
      scopeMode: normalizeScopeMode(assignment.scopeMode),
      expiresAt: iso(assignment.expiresAt),
    })),
    projects: projects.map((project) => ({
      id: project.id,
      projectCode: project.projectCode,
      proposalId: project.proposalId,
      customerName: text(project.customerName, text(project.customerFallbackName, "Customer")),
      status: project.status,
    })),
    tasks,
    salesProposals: salesProposals.map((proposal) => ({
      id: proposal.id,
      customerName: text(proposal.user?.fullName, text(proposal.user?.name, "Customer")),
      status: proposal.status,
      salesOwnerId: proposal.salesOwnerId,
    })),
    externalAccounts: externalAccounts.map((account) => ({
      id: account.id,
      displayName: account.displayName,
      email: account.email,
      companyName: account.companyName,
      scopeType: normalizeExternalScopeType(account.scopeType) || "PROJECT",
      scopeId: account.scopeId,
      permissions: account.permissions,
      expiresAt: account.expiresAt.toISOString(),
      lastUsedAt: iso(account.lastUsedAt),
      revokedAt: iso(account.revokedAt),
      createdAt: account.createdAt.toISOString(),
    })),
  };
}

export type StaffAccessProfile = {
  userId: string;
  isAdmin: boolean;
  roleCodes: string[];
  permissions: string[];
  scopeMode: StaffScopeMode;
};

function fallbackRoleForUser(user: Pick<typeof users.$inferSelect, "role" | "department">) {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return "ADMIN";
  if (user.role === "MANAGER") return "MANAGER";
  if (user.role === "INSTALLER" || user.department === "ENGINEERING") return "ENGINEER";
  if (user.department === "SALES") return "SALES";
  if (user.department === "PROJECT_TEAM" || user.department === "WAREHOUSE") return "OPERATIONS";
  return "SUPPORT";
}

export async function getStaffAccessProfile(userId: string): Promise<StaffAccessProfile | null> {
  await ensureDeveloperAccessTables();
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.isActive, true)),
    columns: { id: true, role: true, department: true },
  });
  if (!user) return null;

  const now = new Date();
  const assignments = await db.select({
    code: staffAccessRoles.code,
    permissions: staffAccessRoles.permissions,
    roleScopeMode: staffAccessRoles.scopeMode,
    assignmentScopeMode: staffAccessAssignments.scopeMode,
  })
    .from(staffAccessAssignments)
    .innerJoin(staffAccessRoles, eq(staffAccessAssignments.roleId, staffAccessRoles.id))
    .where(and(
      eq(staffAccessAssignments.userId, userId),
      eq(staffAccessAssignments.isActive, true),
      eq(staffAccessRoles.isActive, true),
      or(isNull(staffAccessAssignments.expiresAt), gt(staffAccessAssignments.expiresAt, now)),
    ));

  const source = assignments.length > 0
    ? assignments
    : [{
        code: fallbackRoleForUser(user),
        permissions: DEFAULT_STAFF_ROLES.find((role) => role.code === fallbackRoleForUser(user))?.permissions || [],
        roleScopeMode: DEFAULT_STAFF_ROLES.find((role) => role.code === fallbackRoleForUser(user))?.scopeMode || "OWN",
        assignmentScopeMode: DEFAULT_STAFF_ROLES.find((role) => role.code === fallbackRoleForUser(user))?.scopeMode || "OWN",
      }];

  const roleCodes = [...new Set(source.map((role) => role.code))];
  const permissions = [...new Set(source.flatMap((role) => role.permissions))];
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || roleCodes.includes("ADMIN") || permissions.includes("*");
  const scopeMode: StaffScopeMode = isAdmin || source.some((role) => normalizeScopeMode(role.assignmentScopeMode || role.roleScopeMode) === "ALL") ? "ALL" : "OWN";

  return { userId, isAdmin, roleCodes, permissions, scopeMode };
}

export function hasStaffPermission(profile: StaffAccessProfile, permission: string) {
  return profile.isAdmin || profile.permissions.includes("*") || profile.permissions.includes(permission);
}

export type StaffResourceScope = { mode: "ALL" | "OWN" | "NONE"; profile: StaffAccessProfile };

export async function getStaffResourceScope(userId: string, resource: StaffResource): Promise<StaffResourceScope | null> {
  const profile = await getStaffAccessProfile(userId);
  if (!profile) return null;
  if (profile.isAdmin) return { mode: "ALL", profile };
  if (hasStaffPermission(profile, `${resource}:read:all`)) return { mode: "ALL", profile };
  if (hasStaffPermission(profile, `${resource}:read`) && profile.scopeMode === "ALL") return { mode: "ALL", profile };
  if (hasStaffPermission(profile, `${resource}:read:own`)) return { mode: "OWN", profile };
  if (hasStaffPermission(profile, `${resource}:read`)) return { mode: profile.scopeMode, profile };
  return { mode: "NONE", profile };
}

export async function getOwnedProposalIds(userId: string) {
  const [salesRows, taskRows] = await Promise.all([
    db.query.proposals.findMany({ where: eq(proposals.salesOwnerId, userId), columns: { id: true } }),
    db.select({ proposalId: installationWorkflowProjects.proposalId })
      .from(installationTasks)
      .innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
      .where(eq(installationTasks.assignedUserId, userId)),
  ]);

  return [...new Set([...salesRows.map((row) => row.id), ...taskRows.map((row) => row.proposalId)])];
}

export async function getStaffProposalVisibility(userId: string, resource: "crm" | "quotations" | "projects" | "tickets") {
  const scope = await getStaffResourceScope(userId, resource);
  if (!scope || scope.mode === "ALL") return scope;
  if (scope.mode === "NONE") return scope;

  const ownedProposalIds = await getOwnedProposalIds(userId);
  return {
    ...scope,
    ownedProposalIds,
    condition: ownedProposalIds.length > 0
      ? or(eq(proposals.salesOwnerId, userId), inArray(proposals.id, ownedProposalIds))
      : eq(proposals.id, "__no_staff_access__"),
  };
}

export async function saveStaffRole(input: {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  permissions: readonly string[];
  scopeMode: StaffScopeMode;
  actorUserId: string;
}) {
  await ensureDeveloperAccessTables();
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 64);
  const name = input.name.trim().slice(0, 120);
  const permissions = normalizePermissions(input.permissions);
  if (!code || !name || permissions.length === 0) throw new Error("Role code, name, and at least one permission are required.");

  const [role] = input.id
    ? await db.update(staffAccessRoles).set({ code, name, description: input.description?.trim() || null, permissions, scopeMode: input.scopeMode, updatedAt: new Date() }).where(eq(staffAccessRoles.id, input.id)).returning()
    : await db.insert(staffAccessRoles).values({ code, name, description: input.description?.trim() || null, permissions, scopeMode: input.scopeMode, isSystem: false }).returning();
  if (!role) throw new Error("Role could not be saved.");
  await recordAuditEventBestEffort({ actorUserId: input.actorUserId, actorType: "ADMIN", action: input.id ? "STAFF_ROLE_UPDATED" : "STAFF_ROLE_CREATED", resourceType: "STAFF_ACCESS_ROLE", resourceId: role.id, metadata: { code, permissions, scopeMode: input.scopeMode } });
  return role;
}

export async function deleteStaffRole(roleId: string, actorUserId: string) {
  await ensureDeveloperAccessTables();
  const role = await db.query.staffAccessRoles.findFirst({ where: eq(staffAccessRoles.id, roleId) });
  if (!role) throw new Error("Role not found.");
  if (role.isSystem) throw new Error("System roles cannot be deleted.");
  const assignment = await db.query.staffAccessAssignments.findFirst({ where: eq(staffAccessAssignments.roleId, roleId), columns: { id: true } });
  if (assignment) throw new Error("Remove staff assignments before deleting this role.");
  const [deleted] = await db.delete(staffAccessRoles).where(eq(staffAccessRoles.id, roleId)).returning({ id: staffAccessRoles.id });
  if (!deleted) throw new Error("Role no longer exists.");
  await recordAuditEventBestEffort({ actorUserId, actorType: "ADMIN", action: "STAFF_ROLE_DELETED", resourceType: "STAFF_ACCESS_ROLE", resourceId: roleId });
}

export async function assignStaffRole(input: {
  userId: string;
  roleId: string;
  scopeMode: StaffScopeMode;
  expiresAt?: Date | null;
  actorUserId: string;
}) {
  await ensureDeveloperAccessTables();
  const user = await db.query.users.findFirst({ where: and(eq(users.id, input.userId), eq(users.isActive, true)), columns: { id: true, role: true } });
  if (!user || !["STAFF", "MANAGER", "INSTALLER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) throw new Error("Only active staff accounts can receive a staff access role.");
  const role = await db.query.staffAccessRoles.findFirst({ where: and(eq(staffAccessRoles.id, input.roleId), eq(staffAccessRoles.isActive, true)), columns: { id: true } });
  if (!role) throw new Error("Role not found.");
  if (input.expiresAt && input.expiresAt <= new Date()) throw new Error("The access expiry must be in the future.");

  const [assignment] = await db.insert(staffAccessAssignments).values({ userId: input.userId, roleId: input.roleId, scopeMode: input.scopeMode, expiresAt: input.expiresAt || null, createdByUserId: input.actorUserId, isActive: true }).onConflictDoUpdate({ target: [staffAccessAssignments.userId, staffAccessAssignments.roleId], set: { scopeMode: input.scopeMode, expiresAt: input.expiresAt || null, createdByUserId: input.actorUserId, isActive: true, updatedAt: new Date() } }).returning();
  if (!assignment) throw new Error("Staff access assignment could not be saved.");
  await recordAuditEventBestEffort({ actorUserId: input.actorUserId, actorType: "ADMIN", action: "STAFF_ACCESS_ASSIGNED", resourceType: "STAFF_ACCESS_ASSIGNMENT", resourceId: assignment?.id || null, metadata: { userId: input.userId, roleId: input.roleId, scopeMode: input.scopeMode } });
  return assignment;
}

export async function revokeStaffAssignment(assignmentId: string, actorUserId: string) {
  await ensureDeveloperAccessTables();
  const [updated] = await db.update(staffAccessAssignments).set({ isActive: false, updatedAt: new Date() }).where(eq(staffAccessAssignments.id, assignmentId)).returning({ id: staffAccessAssignments.id });
  if (!updated) throw new Error("Staff access assignment no longer exists.");
  await recordAuditEventBestEffort({ actorUserId, actorType: "ADMIN", action: "STAFF_ACCESS_REVOKED", resourceType: "STAFF_ACCESS_ASSIGNMENT", resourceId: assignmentId });
}

export async function assignSalesOwner(input: { proposalId: string; salesOwnerId: string | null; actorUserId: string }) {
  await ensureDeveloperAccessTables();
  if (input.salesOwnerId) {
    const owner = await db.query.users.findFirst({
      where: and(eq(users.id, input.salesOwnerId), eq(users.isActive, true)),
      columns: { id: true, role: true, department: true },
    });
    if (!owner || ["USER", "CUSTOMER"].includes(owner.role)) throw new Error("Sales ownership can only be assigned to an active staff account.");
  }
  const [updated] = await db.update(proposals).set({ salesOwnerId: input.salesOwnerId, updatedAt: new Date() }).where(eq(proposals.id, input.proposalId)).returning({ id: proposals.id, salesOwnerId: proposals.salesOwnerId });
  if (!updated) throw new Error("Quotation not found.");
  await recordAuditEventBestEffort({ actorUserId: input.actorUserId, actorType: "ADMIN", action: "SALES_OWNER_ASSIGNED", resourceType: "PROPOSAL", resourceId: input.proposalId, metadata: { salesOwnerId: input.salesOwnerId } });
  return updated;
}

function digestExternalToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function assertExternalScope(scopeType: ExternalScopeType, scopeId: string) {
  if (scopeType === "PROJECT") return Boolean(await db.query.installationWorkflowProjects.findFirst({ where: eq(installationWorkflowProjects.id, scopeId), columns: { id: true } }));
  if (scopeType === "TASK") return Boolean(await db.query.installationTasks.findFirst({ where: eq(installationTasks.id, scopeId), columns: { id: true } }));
  return Boolean(await db.query.proposals.findFirst({ where: eq(proposals.id, scopeId), columns: { id: true } }));
}

export async function createExternalAccessAccount(input: {
  displayName: string;
  email?: string | null;
  companyName?: string | null;
  scopeType: ExternalScopeType;
  scopeId: string;
  permissions: readonly string[];
  expiresAt: Date;
  locale: "en" | "th";
  actorUserId: string;
}) {
  await ensureDeveloperAccessTables();
  const displayName = input.displayName.trim().slice(0, 160);
  const scopeId = input.scopeId.trim();
  const now = new Date();
  const maximumExpiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  if (!displayName || !scopeId) throw new Error("Name and work scope are required.");
  if (input.expiresAt <= now || input.expiresAt > maximumExpiry) throw new Error("External access must expire within 180 days.");
  if (!(await assertExternalScope(input.scopeType, scopeId))) throw new Error("The selected work record no longer exists.");

  const rawToken = randomBytes(32).toString("base64url");
  const permissions = normalizePermissions(input.permissions).filter((permission) => permission.startsWith("external:"));
  const [account] = await db.insert(externalAccessAccounts).values({
    displayName,
    email: input.email?.trim().toLowerCase() || null,
    companyName: input.companyName?.trim() || null,
    scopeType: input.scopeType,
    scopeId,
    permissions: permissions.length > 0 ? permissions : ["external:work:read"],
    tokenDigest: digestExternalToken(rawToken),
    expiresAt: input.expiresAt,
    createdByUserId: input.actorUserId,
  }).returning();
  if (!account) throw new Error("Temporary external account could not be created.");

  await recordAuditEventBestEffort({ actorUserId: input.actorUserId, actorType: "ADMIN", action: "EXTERNAL_ACCESS_CREATED", resourceType: "EXTERNAL_ACCESS_ACCOUNT", resourceId: account.id, metadata: { scopeType: input.scopeType, scopeId, expiresAt: input.expiresAt.toISOString() } });
  const inviteUrl = `${getConfiguredPublicSiteUrl()}/${input.locale}/external-access/${encodeURIComponent(rawToken)}`;
  return { account, inviteUrl };
}

export async function revokeExternalAccessAccount(accountId: string, actorUserId: string) {
  await ensureDeveloperAccessTables();
  const [updated] = await db.update(externalAccessAccounts).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(externalAccessAccounts.id, accountId), isNull(externalAccessAccounts.revokedAt))).returning({ id: externalAccessAccounts.id });
  if (!updated) throw new Error("External access account no longer exists or is already revoked.");
  await recordAuditEventBestEffort({ actorUserId, actorType: "ADMIN", action: "EXTERNAL_ACCESS_REVOKED", resourceType: "EXTERNAL_ACCESS_ACCOUNT", resourceId: accountId });
}

export async function deleteExternalAccessAccount(accountId: string, actorUserId: string) {
  await ensureDeveloperAccessTables();
  const [deleted] = await db.delete(externalAccessAccounts).where(eq(externalAccessAccounts.id, accountId)).returning({ id: externalAccessAccounts.id });
  if (!deleted) throw new Error("External access account no longer exists.");
  await recordAuditEventBestEffort({ actorUserId, actorType: "ADMIN", action: "EXTERNAL_ACCESS_DELETED", resourceType: "EXTERNAL_ACCESS_ACCOUNT", resourceId: accountId });
}

export async function findExternalAccessAccountByToken(rawToken: string) {
  await ensureDeveloperAccessTables();
  const digest = digestExternalToken(rawToken.trim());
  const account = await db.query.externalAccessAccounts.findFirst({
    where: and(eq(externalAccessAccounts.tokenDigest, digest), isNull(externalAccessAccounts.revokedAt), gt(externalAccessAccounts.expiresAt, new Date())),
  });
  return account || null;
}

export async function findExternalAccessAccountById(accountId: string) {
  await ensureDeveloperAccessTables();
  const account = await db.query.externalAccessAccounts.findFirst({
    where: and(eq(externalAccessAccounts.id, accountId), isNull(externalAccessAccounts.revokedAt), gt(externalAccessAccounts.expiresAt, new Date())),
  });
  return account || null;
}

export async function touchExternalAccessAccount(accountId: string) {
  await db.update(externalAccessAccounts).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(externalAccessAccounts.id, accountId));
}

export async function loadExternalWorkView(account: typeof externalAccessAccounts.$inferSelect): Promise<ExternalWorkView> {
  const projectId = account.scopeType === "PROJECT"
    ? account.scopeId
    : account.scopeType === "TASK"
      ? (await db.query.installationTasks.findFirst({ where: eq(installationTasks.id, account.scopeId), columns: { projectId: true } }))?.projectId || null
      : (await db.query.installationWorkflowProjects.findFirst({ where: eq(installationWorkflowProjects.proposalId, account.scopeId), columns: { id: true } }))?.id || null;

  const projectRow = projectId
    ? (await db.select({ id: installationWorkflowProjects.id, projectCode: installationWorkflowProjects.projectCode, status: installationWorkflowProjects.status, proposalId: installationWorkflowProjects.proposalId, customerName: users.fullName, fallbackName: users.name })
      .from(installationWorkflowProjects)
      .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
      .innerJoin(users, eq(proposals.userId, users.id))
      .where(eq(installationWorkflowProjects.id, projectId)).limit(1))[0]
    : null;
  const tasks = projectId
    ? await db.query.installationTasks.findMany({ where: eq(installationTasks.projectId, projectId), columns: { id: true, taskCode: true, title: true, status: true }, orderBy: [asc(installationTasks.sequence)] })
    : [];
  const visibleTasks = account.scopeType === "TASK" ? tasks.filter((task) => task.id === account.scopeId) : tasks;
  const scopeType = normalizeExternalScopeType(account.scopeType) || "PROJECT";

  return {
    account: {
      id: account.id,
      displayName: account.displayName,
      companyName: account.companyName,
      scopeType,
      expiresAt: account.expiresAt.toISOString(),
      permissions: account.permissions,
    },
    project: projectRow ? { id: projectRow.id, projectCode: projectRow.projectCode, status: projectRow.status, customerName: text(projectRow.customerName, text(projectRow.fallbackName, "Customer")), proposalId: projectRow.proposalId } : null,
    tasks: visibleTasks,
  };
}
