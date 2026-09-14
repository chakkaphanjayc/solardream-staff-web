import "server-only";

import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  fieldVisits,
  installationAuditEvents,
  installationTasks,
  installationWorkflowProjects,
  jobAssignments,
  materialRequirements,
  proposals,
  sites,
  users,
} from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { hasOpsCapability, OpsDomainError } from "@/lib/opsV2State";
import type {
  FieldVisitStatus,
  MaterialRequirementStatus,
  OpsActor,
} from "@/types/ops-v2";

type OpsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const MATERIAL_STATUS_TRANSITIONS: Readonly<Record<MaterialRequirementStatus, readonly MaterialRequirementStatus[]>> = {
  ESTIMATED: ["ESTIMATED", "REQUIRED", "RESERVED", "SHORT", "CANCELLED"],
  REQUIRED: ["REQUIRED", "RESERVED", "SHORT", "CANCELLED"],
  RESERVED: ["RESERVED", "PICKED", "SHORT", "CANCELLED"],
  PICKED: ["PICKED", "ISSUED", "SHORT", "CANCELLED"],
  ISSUED: ["ISSUED"],
  SHORT: ["SHORT", "RESERVED", "PICKED", "CANCELLED"],
  CANCELLED: ["CANCELLED"],
};

function assertCapability(actor: OpsActor, capability: Parameters<typeof hasOpsCapability>[1], message: string) {
  if (!hasOpsCapability(actor, capability)) throw new OpsDomainError("FORBIDDEN", message);
}

function text(value: string | null | undefined) {
  return value?.trim() || "";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseDate(value: string | null | undefined, label: string) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new OpsDomainError("INVALID_INPUT", label + " must be a valid date.");
  return date;
}

async function assertConfirmedVisitReadiness(
  tx: OpsTransaction,
  projectId: string,
  customerConfirmed: boolean,
) {
  if (!customerConfirmed) {
    throw new OpsDomainError("DEPENDENCY_BLOCKED", "Customer confirmation is required before a visit can be scheduled.");
  }
  const materials = await tx.query.materialRequirements.findMany({
    where: eq(materialRequirements.projectId, projectId),
    columns: { status: true },
  });
  if (materials.length === 0 || materials.some((material) => !["RESERVED", "PICKED", "ISSUED", "CANCELLED"].includes(material.status))) {
    throw new OpsDomainError("DEPENDENCY_BLOCKED", "All material requirements must be ready or explicitly cancelled before scheduling.");
  }
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() || null;
}

function serializeVisit(visit: typeof fieldVisits.$inferSelect) {
  return {
    ...visit,
    scheduledStart: iso(visit.scheduledStart),
    scheduledEnd: iso(visit.scheduledEnd),
    customerConfirmedAt: iso(visit.customerConfirmedAt),
    createdAt: visit.createdAt.toISOString(),
    updatedAt: visit.updatedAt.toISOString(),
  };
}

function serializeAssignment(assignment: typeof jobAssignments.$inferSelect) {
  return {
    ...assignment,
    assignedAt: assignment.assignedAt.toISOString(),
    acceptedAt: iso(assignment.acceptedAt),
    startedAt: iso(assignment.startedAt),
    completedAt: iso(assignment.completedAt),
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

function serializeMaterial(material: typeof materialRequirements.$inferSelect) {
  return {
    ...material,
    quantity: String(material.quantity),
    resolvedAt: iso(material.resolvedAt),
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString(),
  };
}

async function getProjectForMutation(tx: OpsTransaction, projectId: string) {
  const project = await tx.query.installationWorkflowProjects.findFirst({
    where: eq(installationWorkflowProjects.id, projectId),
  });
  if (!project) throw new OpsDomainError("NOT_FOUND", "Installation project was not found.");
  return project;
}

function validateIdempotencyKey(value: string) {
  const key = text(value);
  if (!key || key.length > 180) throw new OpsDomainError("INVALID_INPUT", "A bounded idempotency key is required.");
  return key;
}

async function writeProjectStateAudit(
  tx: OpsTransaction,
  input: {
    project: typeof installationWorkflowProjects.$inferSelect;
    actor: OpsActor;
    from: string;
    to: string;
    idempotencyKey: string;
    source: string;
  },
) {
  const [audit] = await tx.insert(installationAuditEvents).values({
    proposalId: input.project.proposalId,
    eventType: "PROJECT_STATE_CHANGED",
    actorUserId: input.actor.userId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      from: input.from,
      to: input.to,
      source: input.source,
      lifecycleVersion: input.project.lifecycleVersion + 1,
    },
  }).returning({ id: installationAuditEvents.id });
  if (!audit) throw new OpsDomainError("CONFLICT", "Project transition audit could not be recorded.");

  await enqueueIntegrationEvent(tx, {
    topic: "installation.project.state_changed",
    aggregateType: "INSTALLATION_PROJECT",
    aggregateId: input.project.id,
    correlationId: input.idempotencyKey,
    payload: {
      projectId: input.project.id,
      proposalId: input.project.proposalId,
      auditEventId: audit.id,
      from: input.from,
      to: input.to,
      lifecycleVersion: input.project.lifecycleVersion + 1,
    },
    dedupeKey: "installation.project.state_changed:" + input.idempotencyKey,
  });
}

export async function listProjectVisits(actor: OpsActor, projectId: string) {
  assertCapability(actor, "visit.read", "Field visit access is not permitted.");
  const visits = await db
    .select({ visit: fieldVisits, assignment: jobAssignments, assignee: users })
    .from(fieldVisits)
    .leftJoin(jobAssignments, eq(jobAssignments.visitId, fieldVisits.id))
    .leftJoin(users, eq(users.id, jobAssignments.assigneeUserId))
    .where(eq(fieldVisits.projectId, projectId))
    .orderBy(asc(fieldVisits.scheduledStart), asc(fieldVisits.createdAt));

  const grouped = new Map<string, {
    visit: typeof fieldVisits.$inferSelect;
    assignments: Array<{ assignment: typeof jobAssignments.$inferSelect; assignee: { id: string; name: string | null; email: string } | null }>;
  }>();
  for (const row of visits) {
    const current = grouped.get(row.visit.id) || { visit: row.visit, assignments: [] };
    if (row.assignment) {
      current.assignments.push({
        assignment: row.assignment,
        assignee: row.assignee
          ? { id: row.assignee.id, name: row.assignee.fullName || row.assignee.name, email: row.assignee.email }
          : null,
      });
    }
    grouped.set(row.visit.id, current);
  }

  return [...grouped.values()].map((item) => ({
    visit: serializeVisit(item.visit),
    assignments: item.assignments.map((assignment) => ({
      assignment: serializeAssignment(assignment.assignment),
      assignee: assignment.assignee,
    })),
  }));
}

export async function listScheduleBoard(actor: OpsActor, input: {
  from?: string | null;
  to?: string | null;
  status?: FieldVisitStatus | null;
} = {}) {
  assertCapability(actor, "visit.read", "Schedule access is not permitted.");

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 7);
  const defaultTo = new Date(now);
  defaultTo.setUTCDate(defaultTo.getUTCDate() + 21);
  const from = parseDate(input.from, "from") || defaultFrom;
  const to = parseDate(input.to, "to") || defaultTo;
  if (to <= from) throw new OpsDomainError("INVALID_INPUT", "The schedule end must be after the start.");
  if (to.getTime() - from.getTime() > 62 * 24 * 60 * 60 * 1000) {
    throw new OpsDomainError("INVALID_INPUT", "The schedule window cannot exceed 62 days.");
  }

  const visitFilters = [
    or(
      isNull(fieldVisits.scheduledStart),
      and(
        gte(fieldVisits.scheduledStart, from),
        lte(fieldVisits.scheduledStart, to),
      ),
    ),
  ];
  if (input.status) visitFilters.push(eq(fieldVisits.status, input.status));

  const rows = await db
    .select({
      visit: fieldVisits,
      project: installationWorkflowProjects,
      customer: users,
      site: sites,
    })
    .from(fieldVisits)
    .innerJoin(installationWorkflowProjects, eq(fieldVisits.projectId, installationWorkflowProjects.id))
    .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
    .leftJoin(users, eq(proposals.userId, users.id))
    .leftJoin(sites, eq(fieldVisits.siteId, sites.id))
    .where(and(...visitFilters))
    .orderBy(asc(fieldVisits.scheduledStart), asc(fieldVisits.createdAt))
    .limit(250);

  const visitIds = rows.map((row) => row.visit.id);
  const projectIds = [...new Set(rows.map((row) => row.project.id))];
  const [assignmentRows, materialRows] = await Promise.all([
    visitIds.length === 0
      ? Promise.resolve([])
      : db
        .select({ assignment: jobAssignments, assignee: users })
        .from(jobAssignments)
        .leftJoin(users, eq(jobAssignments.assigneeUserId, users.id))
        .where(inArray(jobAssignments.visitId, visitIds))
        .orderBy(asc(jobAssignments.assignedAt)),
    projectIds.length === 0
      ? Promise.resolve([])
      : db.query.materialRequirements.findMany({
        where: inArray(materialRequirements.projectId, projectIds),
        columns: { projectId: true, status: true },
      }),
  ]);

  const assignmentsByVisit = new Map<string, Array<{
    id: string;
    taskId: string | null;
    status: string;
    assignee: { id: string; name: string; email: string } | null;
  }>>();
  for (const row of assignmentRows) {
    const assignments = assignmentsByVisit.get(row.assignment.visitId) || [];
    assignments.push({
      id: row.assignment.id,
      taskId: row.assignment.taskId,
      status: row.assignment.status,
      assignee: row.assignee
        ? { id: row.assignee.id, name: row.assignee.fullName || row.assignee.name || row.assignee.email, email: row.assignee.email }
        : null,
    });
    assignmentsByVisit.set(row.assignment.visitId, assignments);
  }

  const materialByProject = new Map<string, { total: number; ready: number; blockers: number }>();
  for (const row of materialRows) {
    const summary = materialByProject.get(row.projectId) || { total: 0, ready: 0, blockers: 0 };
    summary.total += 1;
    if (["RESERVED", "PICKED", "ISSUED", "CANCELLED"].includes(row.status)) summary.ready += 1;
    if (["REQUIRED", "SHORT"].includes(row.status)) summary.blockers += 1;
    materialByProject.set(row.projectId, summary);
  }

  const items = rows.map((row) => {
    const materials = materialByProject.get(row.project.id) || { total: 0, ready: 0, blockers: 0 };
    return {
      visit: serializeVisit(row.visit),
      project: {
        id: row.project.id,
        projectCode: row.project.projectCode,
        lifecycleState: row.project.lifecycleState,
        customerName: row.customer?.fullName || row.customer?.name || row.customer?.email || "Customer",
        siteLabel: row.site?.label || row.site?.addressLine1 || "Site details pending",
        siteAddress: row.site?.addressLine1 || null,
      },
      assignments: assignmentsByVisit.get(row.visit.id) || [],
      materials,
    };
  });

  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    items,
    summary: {
      total: items.length,
      unscheduled: items.filter((item) => !item.visit.scheduledStart && !["COMPLETED", "CANCELLED"].includes(item.visit.status)).length,
      scheduled: items.filter((item) => Boolean(item.visit.scheduledStart) && ["CONFIRMED", "IN_PROGRESS"].includes(item.visit.status)).length,
      inProgress: items.filter((item) => item.visit.status === "IN_PROGRESS").length,
      materialBlockers: items.filter((item) => item.materials.blockers > 0).length,
    },
  };
}

export async function listAssignableFieldUsers(actor: OpsActor) {
  assertCapability(actor, "assignment.manage", "Job assignment access is not permitted.");
  const rows = await db.query.users.findMany({
    where: and(
      eq(users.isActive, true),
      inArray(users.role, ["INSTALLER", "STAFF", "ADMIN", "SUPER_ADMIN", "MANAGER"]),
    ),
    columns: { id: true, fullName: true, name: true, email: true, role: true },
    orderBy: [asc(users.fullName), asc(users.email)],
    limit: 200,
  });
  return rows.map((user) => ({
    id: user.id,
    name: user.fullName || user.name || user.email,
    email: user.email,
    role: user.role,
  }));
}

export async function upsertFieldVisit(actor: OpsActor, input: {
  projectId: string;
  visitId?: string | null;
  visitType?: string | null;
  status?: FieldVisitStatus;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  timezone?: string | null;
  crewName?: string | null;
  customerConfirmed?: boolean;
  cancellationReason?: string | null;
  idempotencyKey: string;
}) {
  assertCapability(actor, "visit.schedule", "Scheduling field visits is not permitted.");
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const start = parseDate(input.scheduledStart, "scheduledStart");
  const end = parseDate(input.scheduledEnd, "scheduledEnd");
  if (start && end && end <= start) {
    throw new OpsDomainError("INVALID_INPUT", "The visit end must be after the visit start.");
  }
  const status = input.status || "PLANNED";
  if (status === "CONFIRMED" && !start) {
    throw new OpsDomainError("INVALID_INPUT", "A confirmed visit requires a start time.");
  }
  if (!["PLANNED", "CONFIRMED", "CANCELLED"].includes(status)) {
    throw new OpsDomainError("INVALID_INPUT", "Field visit execution status is managed by the field workflow.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ops-v2:visit:" + input.projectId}))`);
    const project = await getProjectForMutation(tx, input.projectId);
    if (!["READY_TO_SCHEDULE", "SCHEDULED"].includes(project.lifecycleState)) {
      throw new OpsDomainError("DEPENDENCY_BLOCKED", "The project must be ready to schedule before a field visit is planned.");
    }

    const replay = await tx.query.installationAuditEvents.findFirst({
      where: eq(installationAuditEvents.idempotencyKey, idempotencyKey),
    });
    if (replay) {
      const replayVisitId = asText(asObject(replay.payload).visitId);
      const replayVisit = replayVisitId
        ? await tx.query.fieldVisits.findFirst({ where: eq(fieldVisits.id, replayVisitId) })
        : null;
      if (replayVisit) return { visit: serializeVisit(replayVisit), replayed: true };
      throw new OpsDomainError("CONFLICT", "This idempotency key belongs to another operation.");
    }

    let visit: typeof fieldVisits.$inferSelect | undefined;
    const visitId = text(input.visitId);
    if (visitId) {
      visit = await tx.query.fieldVisits.findFirst({
        where: and(eq(fieldVisits.id, visitId), eq(fieldVisits.projectId, project.id)),
      });
      if (!visit) throw new OpsDomainError("NOT_FOUND", "Field visit was not found for this project.");
      if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
        throw new OpsDomainError("CONFLICT", "A completed or cancelled field visit cannot be rescheduled.");
      }
      if (visit.status === "IN_PROGRESS" && status !== "IN_PROGRESS") {
        throw new OpsDomainError("CONFLICT", "An in-progress field visit cannot be rescheduled.");
      }
      const [updated] = await tx.update(fieldVisits).set({
        visitType: text(input.visitType) || visit.visitType,
        status,
        scheduledStart: start,
        scheduledEnd: end,
        timezone: text(input.timezone) || visit.timezone,
        crewName: input.crewName === undefined ? visit.crewName : text(input.crewName) || null,
        customerConfirmedAt: input.customerConfirmed ? new Date() : visit.customerConfirmedAt,
        cancellationReason: status === "CANCELLED"
          ? text(input.cancellationReason) || visit.cancellationReason
          : input.cancellationReason === undefined ? visit.cancellationReason : text(input.cancellationReason) || null,
        updatedAt: new Date(),
      }).where(eq(fieldVisits.id, visit.id)).returning();
      visit = updated;
    } else {
      const [created] = await tx.insert(fieldVisits).values({
        projectId: project.id,
        siteId: project.siteId,
        visitType: text(input.visitType) || "INSTALLATION",
        status,
        scheduledStart: start,
        scheduledEnd: end,
        timezone: text(input.timezone) || "Asia/Bangkok",
        crewName: text(input.crewName) || null,
        customerConfirmedAt: input.customerConfirmed ? new Date() : null,
        cancellationReason: text(input.cancellationReason) || null,
      }).returning();
      visit = created;
    }
    if (!visit) throw new OpsDomainError("CONFLICT", "Field visit could not be saved.");
    if (status === "CONFIRMED") {
      await assertConfirmedVisitReadiness(tx, project.id, Boolean(visit.customerConfirmedAt));
    }

    const now = new Date();
    await tx.insert(installationAuditEvents).values({
      proposalId: project.proposalId,
      eventType: status === "CONFIRMED" ? "FIELD_VISIT_SCHEDULED" : "FIELD_VISIT_PLANNED",
      actorUserId: actor.userId,
      idempotencyKey,
      payload: {
        projectId: project.id,
        visitId: visit.id,
        status,
        scheduledStart: iso(visit.scheduledStart),
        scheduledEnd: iso(visit.scheduledEnd),
        source: "OPS_V2",
      },
      occurredAt: now,
    });

    if (status === "CONFIRMED" && project.lifecycleState === "READY_TO_SCHEDULE") {
      const [updatedProject] = await tx.update(installationWorkflowProjects).set({
        lifecycleState: "SCHEDULED",
        lifecycleVersion: project.lifecycleVersion + 1,
        lastTransitionAt: now,
        updatedAt: now,
      }).where(eq(installationWorkflowProjects.id, project.id)).returning();
      if (!updatedProject) throw new OpsDomainError("CONFLICT", "Project changed while the visit was scheduled.");
      await writeProjectStateAudit(tx, {
        project,
        actor,
        from: project.lifecycleState,
        to: "SCHEDULED",
        idempotencyKey: idempotencyKey + ":project",
        source: "SCHEDULING",
      });
    }

    await enqueueIntegrationEvent(tx, {
      topic: "installation.visit.scheduled",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: project.id,
      correlationId: idempotencyKey,
      payload: { projectId: project.id, visitId: visit.id, status, source: "OPS_V2" },
      dedupeKey: "installation.visit.scheduled:" + idempotencyKey,
    });

    return { visit: serializeVisit(visit), replayed: false };
  });
}

export async function assignJob(actor: OpsActor, input: {
  visitId: string;
  taskId?: string | null;
  assigneeUserId: string;
  role?: string | null;
  idempotencyKey: string;
}) {
  assertCapability(actor, "assignment.manage", "Job assignment changes are not permitted.");
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  if (!text(input.visitId) || !text(input.assigneeUserId)) {
    throw new OpsDomainError("INVALID_INPUT", "A visit and assignee are required.");
  }

  return db.transaction(async (tx) => {
    const replay = await tx.query.installationAuditEvents.findFirst({
      where: eq(installationAuditEvents.idempotencyKey, idempotencyKey),
    });
    if (replay) {
      const assignmentId = asText(asObject(replay.payload).assignmentId);
      const assignment = assignmentId
        ? await tx.query.jobAssignments.findFirst({ where: eq(jobAssignments.id, assignmentId) })
        : null;
      if (assignment) return { assignment: serializeAssignment(assignment), replayed: true };
      throw new OpsDomainError("CONFLICT", "This idempotency key belongs to another operation.");
    }

    const visit = await tx.query.fieldVisits.findFirst({ where: eq(fieldVisits.id, input.visitId) });
    if (!visit) throw new OpsDomainError("NOT_FOUND", "Field visit was not found.");
    if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
      throw new OpsDomainError("CONFLICT", "A completed or cancelled field visit cannot receive an assignment.");
    }
    const assignee = await tx.query.users.findFirst({
      where: and(eq(users.id, input.assigneeUserId), eq(users.isActive, true)),
      columns: { id: true, role: true },
    });
    if (!assignee || ["USER", "CUSTOMER"].includes(assignee.role)) {
      throw new OpsDomainError("INVALID_INPUT", "The selected assignee is not an active operations user.");
    }

    const taskId = text(input.taskId) || null;
    if (taskId) {
      const task = await tx.query.installationTasks.findFirst({
        where: and(eq(installationTasks.id, taskId), eq(installationTasks.projectId, visit.projectId)),
      });
      if (!task) throw new OpsDomainError("NOT_FOUND", "The selected task does not belong to this project.");
      if (task.status === "COMPLETED" || task.status === "CANCELLED") {
        throw new OpsDomainError("CONFLICT", "A completed or cancelled task cannot be assigned.");
      }
    }

    const project = await getProjectForMutation(tx, visit.projectId);
    if (!["READY_TO_SCHEDULE", "SCHEDULED", "IN_PROGRESS"].includes(project.lifecycleState)) {
      throw new OpsDomainError("DEPENDENCY_BLOCKED", "The project must be ready for field scheduling before an assignment is created.");
    }

    const [assignment] = await tx.insert(jobAssignments).values({
      visitId: visit.id,
      taskId,
      assigneeUserId: assignee.id,
      role: text(input.role) || "TECHNICIAN",
      status: "ASSIGNED",
      source: "OPS_V2",
    }).returning();
    if (!assignment) throw new OpsDomainError("CONFLICT", "The job assignment could not be created.");

    if (taskId) {
      await tx.update(jobAssignments).set({
        status: "SUPERSEDED",
        supersededById: assignment.id,
        updatedAt: new Date(),
      }).where(and(
        eq(jobAssignments.taskId, taskId),
        inArray(jobAssignments.status, ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
        ne(jobAssignments.id, assignment.id),
      ));
      await tx.update(installationTasks).set({
        assignedUserId: assignee.id,
        updatedAt: new Date(),
      }).where(eq(installationTasks.id, taskId));
    }

    await tx.insert(installationAuditEvents).values({
      proposalId: project.proposalId,
      taskId,
      eventType: "JOB_ASSIGNMENT_CHANGED",
      actorUserId: actor.userId,
      idempotencyKey,
      payload: {
        visitId: visit.id,
        taskId,
        assignmentId: assignment.id,
        assigneeUserId: assignee.id,
        source: "OPS_V2",
      },
    });
    await enqueueIntegrationEvent(tx, {
      topic: "installation.assignment.changed",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: visit.projectId,
      correlationId: idempotencyKey,
      payload: { projectId: visit.projectId, visitId: visit.id, taskId, assignmentId: assignment.id, source: "OPS_V2" },
      dedupeKey: "installation.assignment.changed:" + idempotencyKey,
    });

    return { assignment: serializeAssignment(assignment), replayed: false };
  });
}

export async function addMaterialRequirement(actor: OpsActor, input: {
  projectId: string;
  taskId?: string | null;
  catalogProductId?: string | null;
  productName: string;
  quantity: string;
  unit?: string | null;
  serialRequired?: boolean;
  notes?: string | null;
  idempotencyKey: string;
}) {
  assertCapability(actor, "material.manage", "Material planning is not permitted.");
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const productName = text(input.productName);
  const quantity = Number(input.quantity);
  if (!productName || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new OpsDomainError("INVALID_INPUT", "A product name and a positive quantity are required.");
  }

  return db.transaction(async (tx) => {
    const project = await getProjectForMutation(tx, input.projectId);
    const replay = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, idempotencyKey) });
    if (replay) {
      const materialId = asText(asObject(replay.payload).materialId);
      const material = materialId ? await tx.query.materialRequirements.findFirst({ where: eq(materialRequirements.id, materialId) }) : null;
      if (material) return { material: serializeMaterial(material), replayed: true };
      throw new OpsDomainError("CONFLICT", "This idempotency key belongs to another operation.");
    }
    const taskId = text(input.taskId);
    if (taskId) {
      const task = await tx.query.installationTasks.findFirst({ where: and(eq(installationTasks.id, taskId), eq(installationTasks.projectId, project.id)) });
      if (!task) throw new OpsDomainError("NOT_FOUND", "The selected task does not belong to this project.");
    }
    const [material] = await tx.insert(materialRequirements).values({
      projectId: project.id,
      taskId: taskId || null,
      catalogProductId: text(input.catalogProductId) || null,
      productName,
      quantity: quantity.toFixed(3),
      unit: text(input.unit) || "unit",
      status: "REQUIRED",
      serialRequired: input.serialRequired === true,
      source: "OPS_V2",
      notes: text(input.notes) || null,
    }).returning();
    if (!material) throw new OpsDomainError("CONFLICT", "Material requirement could not be created.");
    await tx.insert(installationAuditEvents).values({
      proposalId: project.proposalId,
      eventType: "MATERIAL_REQUIREMENT_CREATED",
      actorUserId: actor.userId,
      idempotencyKey,
      payload: { projectId: project.id, materialId: material.id, source: "OPS_V2" },
    });
    await enqueueIntegrationEvent(tx, {
      topic: "installation.materials.updated",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: project.id,
      correlationId: idempotencyKey,
      payload: { projectId: project.id, materialId: material.id, status: material.status, source: "OPS_V2" },
      dedupeKey: "installation.materials.updated:" + idempotencyKey,
    });
    return { material: serializeMaterial(material), replayed: false };
  });
}

export async function listProjectMaterials(actor: OpsActor, projectId: string) {
  assertCapability(actor, "material.read", "Material access is not permitted.");
  const materials = await db.query.materialRequirements.findMany({
    where: eq(materialRequirements.projectId, projectId),
    orderBy: [asc(materialRequirements.createdAt)],
  });
  return materials.map(serializeMaterial);
}

export async function updateMaterialStatus(actor: OpsActor, input: {
  materialId: string;
  status: MaterialRequirementStatus;
  notes?: string | null;
  idempotencyKey: string;
}) {
  assertCapability(actor, "material.manage", "Material updates are not permitted.");
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);

  return db.transaction(async (tx) => {
    const material = await tx.query.materialRequirements.findFirst({ where: eq(materialRequirements.id, input.materialId) });
    if (!material) throw new OpsDomainError("NOT_FOUND", "Material requirement was not found.");
    const project = await getProjectForMutation(tx, material.projectId);
    const replay = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, idempotencyKey) });
    if (replay) return { material: serializeMaterial(material), replayed: true };

    const currentStatus = material.status as MaterialRequirementStatus;
    if (!MATERIAL_STATUS_TRANSITIONS[currentStatus]?.includes(input.status)) {
      throw new OpsDomainError("CONFLICT", "Material status cannot move from " + currentStatus + " to " + input.status + ".");
    }
    const now = new Date();
    const [updated] = await tx.update(materialRequirements).set({
      status: input.status,
      notes: input.notes === undefined ? material.notes : text(input.notes) || null,
      resolvedAt: ["ISSUED", "CANCELLED"].includes(input.status) ? now : material.resolvedAt,
      updatedAt: now,
    }).where(eq(materialRequirements.id, material.id)).returning();
    if (!updated) throw new OpsDomainError("CONFLICT", "Material requirement changed before the update could be saved.");

    await tx.insert(installationAuditEvents).values({
      proposalId: project.proposalId,
      eventType: "MATERIAL_STATUS_CHANGED",
      actorUserId: actor.userId,
      idempotencyKey,
      payload: { projectId: project.id, materialId: material.id, from: currentStatus, to: input.status, source: "OPS_V2" },
    });
    await enqueueIntegrationEvent(tx, {
      topic: "installation.materials.updated",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: project.id,
      correlationId: idempotencyKey,
      payload: { projectId: project.id, materialId: material.id, status: input.status, source: "OPS_V2" },
      dedupeKey: "installation.materials.updated:" + idempotencyKey,
    });
    return { material: serializeMaterial(updated), replayed: false };
  });
}
