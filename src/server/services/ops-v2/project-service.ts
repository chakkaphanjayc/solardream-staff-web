import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  fieldVisits,
  installationAuditEvents,
  installationChecklistItems,
  installationWarranties,
  installationTasks,
  installationWorkflowProjects,
  installedAssets,
  jobAssignments,
  materialRequirements,
  proposals,
  productWarranties,
  serviceCases,
  sites,
  users,
} from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import {
  assertProjectTransition,
  hasOpsCapability,
  OpsDomainError,
} from "@/lib/opsV2State";
import type {
  OpsActor,
  OpsProjectState,
  OpsProjectTransitionCommand,
} from "@/types/ops-v2";

type OpsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PROJECT_STATE_SET = new Set<string>([
  "NEW",
  "SITE_REVIEW",
  "ENGINEERING",
  "MATERIAL_PREPARATION",
  "READY_TO_SCHEDULE",
  "SCHEDULED",
  "IN_PROGRESS",
  "QA_COMMISSIONING",
  "HANDOVER",
  "WARRANTY_ACTIVATION",
  "COMPLETED",
]);

function projectState(value: string): OpsProjectState {
  return PROJECT_STATE_SET.has(value) ? value as OpsProjectState : "NEW";
}

function toIso(value: Date | null | undefined) {
  return value?.toISOString() || null;
}

function assertProjectRead(actor: OpsActor) {
  if (!hasOpsCapability(actor, "project.read")) {
    throw new OpsDomainError("FORBIDDEN", "Project access is not permitted.");
  }
}

function assertProjectTransitionAccess(actor: OpsActor) {
  if (!hasOpsCapability(actor, "project.transition")) {
    throw new OpsDomainError("FORBIDDEN", "Project transitions are not permitted for this account.");
  }
}

export type ListOpsProjectsInput = {
  page?: number;
  limit?: number;
  query?: string;
  state?: OpsProjectState;
};

export async function listOpsProjects(
  actor: OpsActor,
  input: ListOpsProjectsInput = {},
) {
  assertProjectRead(actor);

  const page = Math.max(1, Math.floor(input.page || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit || 25)));
  const offset = (page - 1) * limit;
  const filters = [];

  if (input.state) {
    filters.push(eq(installationWorkflowProjects.lifecycleState, input.state));
  }
  const query = input.query?.trim();
  if (query) {
    const pattern = "%" + query + "%";
    filters.push(or(
      ilike(installationWorkflowProjects.projectCode, pattern),
      ilike(proposals.id, pattern),
      ilike(users.fullName, pattern),
      ilike(users.email, pattern),
      ilike(sites.label, pattern),
      ilike(sites.addressLine1, pattern),
    ));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        project: installationWorkflowProjects,
        proposalCustomerId: proposals.userId,
        customerName: users.fullName,
        customerEmail: users.email,
        siteLabel: sites.label,
        siteAddress: sites.addressLine1,
      })
      .from(installationWorkflowProjects)
      .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
      .leftJoin(users, eq(users.id, proposals.userId))
      .leftJoin(sites, eq(installationWorkflowProjects.siteId, sites.id))
      .where(where)
      .orderBy(desc(installationWorkflowProjects.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(installationWorkflowProjects)
      .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
      .leftJoin(users, eq(users.id, proposals.userId))
      .leftJoin(sites, eq(installationWorkflowProjects.siteId, sites.id))
      .where(where),
  ]);

  const total = Number(totalRows[0]?.value || 0);
  return {
    items: rows.map(({ project, proposalCustomerId, customerName, customerEmail, siteLabel, siteAddress }) => ({
      id: project.id,
      projectCode: project.projectCode,
      proposalId: project.proposalId,
      customerId: project.customerId || proposalCustomerId,
      customerName: customerName || customerEmail || "Customer",
      siteId: project.siteId,
      siteLabel: siteLabel || null,
      siteAddress: siteAddress || null,
      lifecycleState: projectState(project.lifecycleState),
      legacyStatus: project.status,
      erpnextSyncStatus: project.erpnextSyncStatus,
      permitStatus: project.permitStatus,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getOpsProjectWorkspace(
  actor: OpsActor,
  projectId: string,
) {
  assertProjectRead(actor);
  const projectRows = await db
    .select({
      project: installationWorkflowProjects,
      proposal: proposals,
      customer: users,
      site: sites,
    })
    .from(installationWorkflowProjects)
    .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
    .leftJoin(users, eq(users.id, proposals.userId))
    .leftJoin(sites, eq(installationWorkflowProjects.siteId, sites.id))
    .where(eq(installationWorkflowProjects.id, projectId))
    .limit(1);
  const row = projectRows[0];
  if (!row) throw new OpsDomainError("NOT_FOUND", "Installation project was not found.");

  const [tasks, visits, materials, assets, productWarrantyRows, installationWarrantyRows, cases] = await Promise.all([
    db
      .select({ task: installationTasks, checklistItem: installationChecklistItems })
      .from(installationTasks)
      .leftJoin(installationChecklistItems, eq(installationChecklistItems.taskId, installationTasks.id))
      .where(eq(installationTasks.projectId, projectId))
      .orderBy(asc(installationTasks.sequence), asc(installationChecklistItems.sequence)),
    db
      .select({ visit: fieldVisits, assignment: jobAssignments, assignee: users })
      .from(fieldVisits)
      .leftJoin(jobAssignments, eq(jobAssignments.visitId, fieldVisits.id))
      .leftJoin(users, eq(jobAssignments.assigneeUserId, users.id))
      .where(eq(fieldVisits.projectId, projectId))
      .orderBy(desc(fieldVisits.scheduledStart), desc(fieldVisits.createdAt)),
    db.query.materialRequirements.findMany({
      where: eq(materialRequirements.projectId, projectId),
      orderBy: [asc(materialRequirements.createdAt)],
    }),
    db.query.installedAssets.findMany({
      where: eq(installedAssets.projectId, projectId),
      orderBy: [desc(installedAssets.installedDate)],
    }),
    db
      .select({ warranty: productWarranties, asset: installedAssets })
      .from(productWarranties)
      .innerJoin(installedAssets, eq(productWarranties.assetId, installedAssets.id))
      .where(eq(installedAssets.projectId, projectId)),
    db.query.installationWarranties.findMany({
      where: eq(installationWarranties.projectId, projectId),
    }),
    db.query.serviceCases.findMany({
      where: eq(serviceCases.projectId, projectId),
      orderBy: [desc(serviceCases.createdAt)],
    }),
  ]);

  const taskMap = new Map<string, {
    task: typeof tasks[number]["task"];
    checklist: Array<typeof tasks[number]["checklistItem"]>;
  }>();
  for (const item of tasks) {
    const existing = taskMap.get(item.task.id) || { task: item.task, checklist: [] };
    if (item.checklistItem) existing.checklist.push(item.checklistItem);
    taskMap.set(item.task.id, existing);
  }

  const visitMap = new Map<string, {
    visit: typeof visits[number]["visit"];
    assignments: Array<{
      assignment: typeof visits[number]["assignment"];
      assignee: typeof visits[number]["assignee"];
    }>;
  }>();
  for (const item of visits) {
    const existing = visitMap.get(item.visit.id) || { visit: item.visit, assignments: [] };
    if (item.assignment) existing.assignments.push({ assignment: item.assignment, assignee: item.assignee });
    visitMap.set(item.visit.id, existing);
  }

  return {
    project: {
      ...row.project,
      lifecycleState: projectState(row.project.lifecycleState),
      customer: row.customer
        ? { id: row.customer.id, name: row.customer.fullName || row.customer.name || row.customer.email, email: row.customer.email }
        : { id: row.proposal.userId, name: "Customer", email: null },
      site: row.site
        ? {
          id: row.site.id,
          label: row.site.label,
          addressLine1: row.site.addressLine1,
          addressLine2: row.site.addressLine2,
          city: row.site.city,
          province: row.site.province,
          postalCode: row.site.postalCode,
          country: row.site.country,
          latitude: row.site.latitude,
          longitude: row.site.longitude,
          accessNotes: row.site.accessNotes,
        }
        : null,
      proposal: {
        id: row.proposal.id,
        status: row.proposal.status,
        paymentStatus: row.proposal.paymentStatus,
        paidAt: toIso(row.proposal.paidAt),
        systemSizeKwp: row.proposal.systemSizeKwp,
        panelCount: row.proposal.panelCount,
      },
    },
    tasks: [...taskMap.values()],
    visits: [...visitMap.values()],
    materials,
    assets,
    productWarranties: productWarrantyRows,
    installationWarranties: installationWarrantyRows,
    serviceCases: cases,
  };
}

async function assertTransitionGates(
  executor: OpsTransaction,
  project: typeof installationWorkflowProjects.$inferSelect,
  nextState: OpsProjectState,
) {
  const currentState = projectState(project.lifecycleState);
  if (nextState === "SITE_REVIEW" && !project.siteId) {
    throw new OpsDomainError("DEPENDENCY_BLOCKED", "A site is required before site review.");
  }
  if (nextState === "ENGINEERING" && !project.siteId) {
    throw new OpsDomainError("DEPENDENCY_BLOCKED", "A site is required before engineering.");
  }
  if (nextState === "MATERIAL_PREPARATION") {
    const materials = await executor.query.materialRequirements.findMany({
      where: eq(materialRequirements.projectId, project.id),
    });
    if (materials.length === 0) {
      throw new OpsDomainError("DEPENDENCY_BLOCKED", "Material requirements must be recorded before preparation.");
    }
  }
  if (nextState === "READY_TO_SCHEDULE") {
    const materials = await executor.query.materialRequirements.findMany({
      where: eq(materialRequirements.projectId, project.id),
    });
    const blocking = materials.some((item) => !["RESERVED", "PICKED", "ISSUED", "CANCELLED"].includes(item.status));
    if (blocking) throw new OpsDomainError("DEPENDENCY_BLOCKED", "All material requirements must be ready or explicitly cancelled.");
  }
  if (nextState === "SCHEDULED") {
    const scheduledVisit = await executor.query.fieldVisits.findFirst({
      where: and(eq(fieldVisits.projectId, project.id), inArray(fieldVisits.status, ["CONFIRMED", "IN_PROGRESS"])),
    });
    if (!scheduledVisit) throw new OpsDomainError("DEPENDENCY_BLOCKED", "A confirmed field visit is required before scheduling.");
  }
  if (nextState === "IN_PROGRESS") {
    const activeVisit = await executor.query.fieldVisits.findFirst({
      where: and(eq(fieldVisits.projectId, project.id), eq(fieldVisits.status, "IN_PROGRESS")),
    });
    if (!activeVisit) throw new OpsDomainError("DEPENDENCY_BLOCKED", "A field visit must be started before project execution.");
  }
  if (nextState === "QA_COMMISSIONING") {
    const tasks = await executor.query.installationTasks.findMany({
      where: eq(installationTasks.projectId, project.id),
    });
    if (tasks.some((task) => task.status !== "COMPLETED")) {
      throw new OpsDomainError("DEPENDENCY_BLOCKED", "All installation tasks must be completed before QA.");
    }
  }
  if (nextState === "HANDOVER") {
    const warranty = await executor.query.installationWarranties.findFirst({
      where: and(eq(installationWarranties.projectId, project.id), eq(installationWarranties.status, "PENDING_ACTIVATION")),
    });
    if (!warranty) {
      throw new OpsDomainError("DEPENDENCY_BLOCKED", "A pending installation warranty is required for handover.");
    }
  }
  if (nextState === "WARRANTY_ACTIVATION") {
    const assets = await executor.query.installedAssets.findMany({
      where: eq(installedAssets.projectId, project.id),
    });
    if (assets.length === 0) throw new OpsDomainError("DEPENDENCY_BLOCKED", "At least one installed asset is required.");
  }
  if (nextState === "COMPLETED") {
    const warranty = await executor.query.installationWarranties.findFirst({
      where: and(eq(installationWarranties.projectId, project.id), eq(installationWarranties.status, "ACTIVE")),
    });
    if (!warranty) throw new OpsDomainError("DEPENDENCY_BLOCKED", "Warranty activation is required before completion.");
  }

  assertProjectTransition(currentState, nextState);
}

export async function transitionOpsProject(
  actor: OpsActor,
  command: OpsProjectTransitionCommand,
) {
  assertProjectTransitionAccess(actor);
  if (!command.projectId.trim() || !command.idempotencyKey.trim()) {
    throw new OpsDomainError("INVALID_INPUT", "Project ID and idempotency key are required.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ "ops-v2:project:" + command.projectId }))`);
    const project = await tx.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.id, command.projectId),
    });
    if (!project) throw new OpsDomainError("NOT_FOUND", "Installation project was not found.");

    const existing = await tx.query.installationAuditEvents.findFirst({
      where: eq(installationAuditEvents.idempotencyKey, command.idempotencyKey),
    });
    if (existing) {
      return {
        project: { ...project, lifecycleState: projectState(project.lifecycleState) },
        replayed: true,
      };
    }

    await assertTransitionGates(tx, project, command.to);
    const now = new Date();
    const nextVersion = project.lifecycleVersion + 1;
    const [updated] = await tx
      .update(installationWorkflowProjects)
      .set({
        lifecycleState: command.to,
        lifecycleVersion: nextVersion,
        lastTransitionAt: now,
        updatedAt: now,
      })
      .where(eq(installationWorkflowProjects.id, project.id))
      .returning();
    if (!updated) throw new OpsDomainError("CONFLICT", "Project changed before the transition could be saved.");

    const [audit] = await tx
      .insert(installationAuditEvents)
      .values({
        proposalId: project.proposalId,
        eventType: "PROJECT_STATE_CHANGED",
        actorUserId: actor.userId,
        idempotencyKey: command.idempotencyKey,
        payload: {
          from: projectState(project.lifecycleState),
          to: command.to,
          reason: command.reason || null,
          source: command.source || "OPS_V2",
          lifecycleVersion: nextVersion,
        },
      })
      .returning({ id: installationAuditEvents.id });
    if (!audit) throw new OpsDomainError("CONFLICT", "Project audit event could not be recorded.");

    await enqueueIntegrationEvent(tx, {
      topic: "installation.project.state_changed",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: project.id,
      payload: {
        projectId: project.id,
        proposalId: project.proposalId,
        auditEventId: audit.id,
        from: projectState(project.lifecycleState),
        to: command.to,
        lifecycleVersion: nextVersion,
      },
      dedupeKey: "installation.project.state_changed:" + command.idempotencyKey,
    });

    return { project: { ...updated, lifecycleState: projectState(updated.lifecycleState) }, replayed: false };
  });
}

export async function getOpsProjectIdByProposalId(proposalId: string) {
  const project = await db.query.installationWorkflowProjects.findFirst({
    where: eq(installationWorkflowProjects.proposalId, proposalId),
    columns: { id: true },
  });
  return project?.id || null;
}
