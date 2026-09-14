import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  auditEvents,
  fieldVisits,
  installationWarranties,
  installationWorkflowProjects,
  installedAssets,
  productWarranties,
  proposals,
  serviceCases,
  serviceVisits,
  users,
} from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { hasOpsCapability, OpsDomainError } from "@/lib/opsV2State";
import { WARRANTY_DECISIONS, type OpsActor, type ServiceCaseStatus, type WarrantyDecision } from "@/types/ops-v2";

type ServiceCasePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type ServiceCaseType = "REPAIR" | "CLAIM" | "MAINTENANCE" | "QUESTION";
type ServiceVisitStatus = "PLANNED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type OpsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PRIORITIES: readonly ServiceCasePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const TYPES: readonly ServiceCaseType[] = ["REPAIR", "CLAIM", "MAINTENANCE", "QUESTION"];
const STATUS_TRANSITIONS: Readonly<Record<ServiceCaseStatus, readonly ServiceCaseStatus[]>> = {
  NEW: ["NEW", "TRIAGED", "CANCELLED"],
  TRIAGED: ["TRIAGED", "SCHEDULED", "WAITING_CUSTOMER", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["SCHEDULED", "IN_PROGRESS", "WAITING_CUSTOMER", "CANCELLED"],
  IN_PROGRESS: ["IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CANCELLED"],
  WAITING_CUSTOMER: ["WAITING_CUSTOMER", "IN_PROGRESS", "CANCELLED"],
  RESOLVED: ["RESOLVED", "CLOSED"],
  CLOSED: ["CLOSED"],
  CANCELLED: ["CANCELLED"],
};

function text(value: string | null | undefined) {
  return value?.trim() || "";
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() || null;
}

function parseDate(value: string | null | undefined, label: string) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new OpsDomainError("INVALID_INPUT", label + " must be a valid date.");
  return date;
}

function validateKey(value: string) {
  const key = text(value);
  if (!key || key.length > 180) throw new OpsDomainError("INVALID_INPUT", "A bounded idempotency key is required.");
  return key;
}

function assertStaff(actor: OpsActor) {
  if (!hasOpsCapability(actor, "service_case.manage")) {
    throw new OpsDomainError("FORBIDDEN", "After-sales case management is not permitted.");
  }
}

function assertRead(actor: OpsActor) {
  if (!hasOpsCapability(actor, "service_case.read")) {
    throw new OpsDomainError("FORBIDDEN", "After-sales case access is not permitted.");
  }
}

function getSlaHours(priority: ServiceCasePriority) {
  return priority === "URGENT" ? 4 : priority === "HIGH" ? 24 : priority === "LOW" ? 120 : 72;
}

function serializeCase(item: typeof serviceCases.$inferSelect) {
  return {
    ...item,
    slaDueAt: iso(item.slaDueAt),
    resolvedAt: iso(item.resolvedAt),
    closedAt: iso(item.closedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeVisit(item: typeof serviceVisits.$inferSelect) {
  return {
    ...item,
    scheduledStart: iso(item.scheduledStart),
    scheduledEnd: iso(item.scheduledEnd),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function loadCase(tx: OpsTransaction, caseId: string) {
  const item = await tx.query.serviceCases.findFirst({ where: eq(serviceCases.id, caseId) });
  if (!item) throw new OpsDomainError("NOT_FOUND", "Service case was not found.");
  return item;
}

async function assertCustomerResource(
  tx: OpsTransaction,
  input: { customerUserId: string; projectId?: string | null; assetId?: string | null; installationWarrantyId?: string | null; productWarrantyId?: string | null },
) {
  const customer = await tx.query.users.findFirst({ where: and(eq(users.id, input.customerUserId), eq(users.isActive, true)), columns: { id: true } });
  if (!customer) throw new OpsDomainError("NOT_FOUND", "The customer account was not found.");

  let projectId = text(input.projectId);
  let siteId: string | null = null;
  let assetId = text(input.assetId);
  let productWarrantyId = text(input.productWarrantyId);
  let installationWarrantyId = text(input.installationWarrantyId);
  let asset: { id: string; customerId: string; projectId: string | null; siteId: string | null } | null = null;
  let productWarranty: typeof productWarranties.$inferSelect | null = null;
  let installationWarranty: typeof installationWarranties.$inferSelect | null = null;

  if (projectId) {
    const project = await tx.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.id, projectId),
      columns: { id: true, customerId: true, proposalId: true, siteId: true },
    });
    const proposal = project?.customerId === null && project.proposalId
      ? await tx.query.proposals.findFirst({
          where: eq(proposals.id, project.proposalId),
          columns: { userId: true },
        })
      : null;
    const isOwned = project && (
      project.customerId === input.customerUserId
      || (project.customerId === null && proposal?.userId === input.customerUserId)
    );
    if (!isOwned) throw new OpsDomainError("FORBIDDEN", "The selected project is not owned by this customer.");
    siteId = project.siteId;
  }

  if (assetId) {
    asset = await tx.query.installedAssets.findFirst({
      where: eq(installedAssets.id, assetId),
      columns: { id: true, customerId: true, projectId: true, siteId: true },
    }) || null;
    if (!asset || asset.customerId !== input.customerUserId) throw new OpsDomainError("FORBIDDEN", "The selected asset is not owned by this customer.");
    if (!projectId && asset.projectId) projectId = asset.projectId;
    if (projectId && asset.projectId && projectId !== asset.projectId) throw new OpsDomainError("INVALID_INPUT", "The asset and project do not belong together.");
    if (!siteId) siteId = asset.siteId;
  }

  if (installationWarrantyId) {
    installationWarranty = await tx.query.installationWarranties.findFirst({ where: eq(installationWarranties.id, installationWarrantyId) }) || null;
    const warranty = installationWarranty;
    if (!warranty || warranty.customerId !== input.customerUserId || (projectId && warranty.projectId !== projectId)) throw new OpsDomainError("FORBIDDEN", "The selected installation warranty is not owned by this customer.");
    if (!projectId) projectId = warranty.projectId;
    if (!siteId) siteId = warranty.siteId;
  }

  if (productWarrantyId) {
    const warrantyRows = await tx.select({ warranty: productWarranties, asset: installedAssets }).from(productWarranties).innerJoin(installedAssets, eq(productWarranties.assetId, installedAssets.id)).where(eq(productWarranties.id, productWarrantyId)).limit(1);
    const warrantyRow = warrantyRows[0];
    if (!warrantyRow || warrantyRow.asset.customerId !== input.customerUserId || (assetId && warrantyRow.asset.id !== assetId)) throw new OpsDomainError("FORBIDDEN", "The selected product warranty is not owned by this customer.");
    productWarranty = warrantyRow.warranty;
    if (!assetId) {
      assetId = warrantyRow.asset.id;
      asset = warrantyRow.asset;
    }
    if (!projectId && warrantyRow.asset.projectId) projectId = warrantyRow.asset.projectId;
    if (projectId && warrantyRow.asset.projectId && projectId !== warrantyRow.asset.projectId) throw new OpsDomainError("INVALID_INPUT", "The product warranty and project do not belong together.");
    if (!siteId) siteId = warrantyRow.asset.siteId;
  }

  if (!productWarranty && assetId) {
    productWarranty = await tx.query.productWarranties.findFirst({
      where: eq(productWarranties.assetId, assetId),
      orderBy: [desc(productWarranties.createdAt)],
    }) || null;
    if (productWarranty) productWarrantyId = productWarranty.id;
  }

  if (!installationWarranty && projectId) {
    installationWarranty = await tx.query.installationWarranties.findFirst({
      where: eq(installationWarranties.projectId, projectId),
      orderBy: [desc(installationWarranties.createdAt)],
    }) || null;
    if (installationWarranty) installationWarrantyId = installationWarranty.id;
    if (!siteId && installationWarranty) siteId = installationWarranty.siteId;
  }

  const now = new Date();
  const isCovered = (warranty: { status: string; startsAt: Date | null; endsAt: Date | null } | null) => Boolean(
    warranty
    && warranty.status === "ACTIVE"
    && (!warranty.startsAt || warranty.startsAt <= now)
    && (!warranty.endsAt || warranty.endsAt >= now),
  );
  const hasWarrantyRecord = Boolean(productWarranty || installationWarranty);
  const warrantyDecision: WarrantyDecision = isCovered(productWarranty) || isCovered(installationWarranty)
    ? "COVERED"
    : hasWarrantyRecord && [productWarranty, installationWarranty].some((warranty) => warranty?.status === "EXPIRED" || Boolean(warranty?.endsAt && warranty.endsAt < now))
      ? "EXPIRED"
      : hasWarrantyRecord
        ? "NOT_COVERED"
        : "REVIEW_REQUIRED";

  return {
    projectId: projectId || null,
    siteId,
    assetId: assetId || null,
    productWarrantyId: productWarrantyId || null,
    installationWarrantyId: installationWarrantyId || null,
    warrantyDecision,
  };
}

export async function createServiceCase(actor: OpsActor, input: {
  customerUserId?: string | null;
  projectId?: string | null;
  assetId?: string | null;
  productWarrantyId?: string | null;
  installationWarrantyId?: string | null;
  type: ServiceCaseType;
  priority: ServiceCasePriority;
  channel?: string | null;
  subject: string;
  description: string;
  idempotencyKey: string;
}) {
  const customerActor = actor.role === "CUSTOMER" || actor.role === "USER";
  if (!customerActor) assertRead(actor);
  const customerUserId = actor.role === "CUSTOMER" || actor.role === "USER"
    ? actor.userId
    : text(input.customerUserId);
  if (!customerUserId) throw new OpsDomainError("INVALID_INPUT", "A customer account is required.");
  if (!TYPES.includes(input.type) || !PRIORITIES.includes(input.priority)) throw new OpsDomainError("INVALID_INPUT", "The service case type or priority is invalid.");
  const subject = text(input.subject);
  const description = text(input.description);
  if (!subject || !description) throw new OpsDomainError("INVALID_INPUT", "A service case subject and description are required.");
  const idempotencyKey = validateKey(input.idempotencyKey);

  return db.transaction(async (tx) => {
    const replay = await tx.query.auditEvents.findFirst({ where: eq(auditEvents.requestId, idempotencyKey) });
    if (replay?.resourceId) {
      const existing = await tx.query.serviceCases.findFirst({ where: eq(serviceCases.id, replay.resourceId) });
      if (existing) return { serviceCase: serializeCase(existing), replayed: true };
    }
    if (!customerActor) assertStaff(actor);
    const resource = await assertCustomerResource(tx, {
      customerUserId,
      projectId: input.projectId,
      assetId: input.assetId,
      productWarrantyId: input.productWarrantyId,
      installationWarrantyId: input.installationWarrantyId,
    });
    const now = new Date();
    const priority = input.priority;
    const slaDueAt = new Date(now.getTime() + getSlaHours(priority) * 60 * 60 * 1000);
    const [created] = await tx.insert(serviceCases).values({
      caseNumber: "SC-" + now.toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomUUID().slice(0, 8).toUpperCase(),
      customerUserId,
      projectId: resource.projectId,
      siteId: resource.siteId,
      assetId: resource.assetId,
      productWarrantyId: resource.productWarrantyId,
      installationWarrantyId: resource.installationWarrantyId,
      type: input.type,
      priority,
      channel: text(input.channel) || ((actor.role === "CUSTOMER" || actor.role === "USER") ? "PORTAL" : "OPS"),
      subject,
      description,
      status: "NEW",
      warrantyDecision: resource.warrantyDecision,
      slaDueAt,
      metadata: { source: "OPS_V2", idempotencyKey, warrantyDecision: resource.warrantyDecision },
    }).returning();
    if (!created) throw new OpsDomainError("CONFLICT", "Service case could not be created.");

    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      actorType: "USER",
      action: "SERVICE_CASE_CREATED",
      resourceType: "SERVICE_CASE",
      resourceId: created.id,
      requestId: idempotencyKey,
      outcome: "SUCCESS",
      metadata: {
        caseNumber: created.caseNumber,
        customerUserId,
        projectId: resource.projectId,
        assetId: resource.assetId,
        warrantyDecision: resource.warrantyDecision,
      },
    });
    await enqueueIntegrationEvent(tx, {
      topic: "service.case.created",
      aggregateType: "SERVICE_CASE",
      aggregateId: created.id,
      correlationId: idempotencyKey,
      payload: { serviceCaseId: created.id, projectId: resource.projectId, customerUserId, source: "OPS_V2" },
      dedupeKey: "service.case.created:" + idempotencyKey,
    });
    return { serviceCase: serializeCase(created), replayed: false };
  });
}

export async function listServiceCases(actor: OpsActor, input: { customerUserId?: string; status?: ServiceCaseStatus } = {}) {
  const customerActor = actor.role === "CUSTOMER" || actor.role === "USER";
  if (!customerActor) assertRead(actor);
  const customerUserId = customerActor ? actor.userId : text(input.customerUserId);
  const filters = [];
  if (customerUserId) filters.push(eq(serviceCases.customerUserId, customerUserId));
  if (input.status) filters.push(eq(serviceCases.status, input.status));
  const rows = await db.query.serviceCases.findMany({
    where: filters.length ? and(...filters) : undefined,
    orderBy: [desc(serviceCases.createdAt)],
    limit: 100,
  });
  return rows.map(serializeCase);
}

export async function getServiceCase(actor: OpsActor, caseId: string) {
  const customerActor = actor.role === "CUSTOMER" || actor.role === "USER";
  if (!customerActor) assertRead(actor);
  const item = await db.query.serviceCases.findFirst({ where: eq(serviceCases.id, caseId) });
  if (!item) throw new OpsDomainError("NOT_FOUND", "Service case was not found.");
  if (customerActor && item.customerUserId !== actor.userId) throw new OpsDomainError("FORBIDDEN", "Service case access is not permitted.");
  const visits = await db.query.serviceVisits.findMany({ where: eq(serviceVisits.caseId, item.id), orderBy: [asc(serviceVisits.scheduledStart), asc(serviceVisits.createdAt)] });
  return { serviceCase: serializeCase(item), visits: visits.map(serializeVisit) };
}

export async function updateServiceCase(actor: OpsActor, input: {
  caseId: string;
  status?: ServiceCaseStatus;
  priority?: ServiceCasePriority;
  assignedUserId?: string | null;
  warrantyDecision?: WarrantyDecision | null;
  idempotencyKey: string;
}) {
  assertStaff(actor);
  const idempotencyKey = validateKey(input.idempotencyKey);
  return db.transaction(async (tx) => {
    const item = await loadCase(tx, input.caseId);
    const replay = await tx.query.auditEvents.findFirst({ where: eq(auditEvents.requestId, idempotencyKey) });
    if (replay?.resourceId === item.id) return { serviceCase: serializeCase(item), replayed: true };
    const nextStatus = input.status || item.status as ServiceCaseStatus;
    if (!STATUS_TRANSITIONS[item.status as ServiceCaseStatus]?.includes(nextStatus)) throw new OpsDomainError("CONFLICT", "Service case status cannot move from " + item.status + " to " + nextStatus + ".");
    if (input.priority && !PRIORITIES.includes(input.priority)) throw new OpsDomainError("INVALID_INPUT", "The service case priority is invalid.");
    if (input.warrantyDecision && !WARRANTY_DECISIONS.includes(input.warrantyDecision)) throw new OpsDomainError("INVALID_INPUT", "The warranty decision is invalid.");
    if (input.assignedUserId) {
      const assignee = await tx.query.users.findFirst({ where: and(eq(users.id, input.assignedUserId), eq(users.isActive, true)), columns: { id: true, role: true } });
      if (!assignee || ["USER", "CUSTOMER"].includes(assignee.role)) throw new OpsDomainError("INVALID_INPUT", "The assignee is not an active operations user.");
    }
    const now = new Date();
    const [updated] = await tx.update(serviceCases).set({
      status: nextStatus,
      priority: input.priority || item.priority,
      assignedUserId: input.assignedUserId === undefined ? item.assignedUserId : input.assignedUserId || null,
      warrantyDecision: input.warrantyDecision === undefined ? item.warrantyDecision : text(input.warrantyDecision) || null,
      resolvedAt: ["RESOLVED", "CLOSED"].includes(nextStatus) ? item.resolvedAt || now : item.resolvedAt,
      closedAt: nextStatus === "CLOSED" ? item.closedAt || now : item.closedAt,
      updatedAt: now,
    }).where(eq(serviceCases.id, item.id)).returning();
    if (!updated) throw new OpsDomainError("CONFLICT", "Service case changed before the update could be saved.");
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      actorType: "USER",
      action: "SERVICE_CASE_UPDATED",
      resourceType: "SERVICE_CASE",
      resourceId: item.id,
      requestId: idempotencyKey,
      outcome: "SUCCESS",
      metadata: { fromStatus: item.status, toStatus: nextStatus, priority: updated.priority },
    });
    await enqueueIntegrationEvent(tx, {
      topic: "service.case.updated",
      aggregateType: "SERVICE_CASE",
      aggregateId: item.id,
      correlationId: idempotencyKey,
      payload: { serviceCaseId: item.id, status: nextStatus, source: "OPS_V2" },
      dedupeKey: "service.case.updated:" + idempotencyKey,
    });
    return { serviceCase: serializeCase(updated), replayed: false };
  });
}

export async function createServiceVisit(actor: OpsActor, input: {
  caseId: string;
  fieldVisitId?: string | null;
  assignedUserId?: string | null;
  status?: ServiceVisitStatus;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  notes?: string | null;
  idempotencyKey: string;
}) {
  assertStaff(actor);
  const idempotencyKey = validateKey(input.idempotencyKey);
  const scheduledStart = parseDate(input.scheduledStart, "scheduledStart");
  const scheduledEnd = parseDate(input.scheduledEnd, "scheduledEnd");
  if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) throw new OpsDomainError("INVALID_INPUT", "The service visit end must be after the start.");
  return db.transaction(async (tx) => {
    const serviceCase = await loadCase(tx, input.caseId);
    if (["RESOLVED", "CLOSED", "CANCELLED"].includes(serviceCase.status)) {
      throw new OpsDomainError("CONFLICT", "A resolved or closed service case cannot receive a new visit.");
    }
    const replay = await tx.query.auditEvents.findFirst({ where: eq(auditEvents.requestId, idempotencyKey) });
    if (replay?.resourceId) {
      const existing = await tx.query.serviceVisits.findFirst({ where: eq(serviceVisits.id, replay.resourceId) });
      if (existing) return { serviceVisit: serializeVisit(existing), replayed: true };
    }
    if (input.fieldVisitId) {
      const fieldVisit = await tx.query.fieldVisits.findFirst({ where: eq(fieldVisits.id, input.fieldVisitId), columns: { id: true, projectId: true } });
      if (!fieldVisit) throw new OpsDomainError("NOT_FOUND", "The linked field visit was not found.");
      if (!serviceCase.projectId || fieldVisit.projectId !== serviceCase.projectId) {
        throw new OpsDomainError("FORBIDDEN", "The linked field visit does not belong to this service case.");
      }
    }
    if (input.assignedUserId) {
      const user = await tx.query.users.findFirst({ where: and(eq(users.id, input.assignedUserId), eq(users.isActive, true)), columns: { id: true, role: true } });
      if (!user || ["USER", "CUSTOMER"].includes(user.role)) throw new OpsDomainError("INVALID_INPUT", "The service visit assignee is not valid.");
    }
    const status = input.status || "PLANNED";
    const [created] = await tx.insert(serviceVisits).values({
      caseId: serviceCase.id,
      fieldVisitId: text(input.fieldVisitId) || null,
      assignedUserId: text(input.assignedUserId) || null,
      status,
      scheduledStart,
      scheduledEnd,
      notes: text(input.notes) || null,
    }).returning();
    if (!created) throw new OpsDomainError("CONFLICT", "Service visit could not be created.");
    await tx.update(serviceCases).set({ status: "SCHEDULED", updatedAt: new Date() }).where(eq(serviceCases.id, serviceCase.id));
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      actorType: "USER",
      action: "SERVICE_VISIT_CREATED",
      resourceType: "SERVICE_VISIT",
      resourceId: created.id,
      requestId: idempotencyKey,
      outcome: "SUCCESS",
      metadata: { serviceCaseId: serviceCase.id, fieldVisitId: input.fieldVisitId || null },
    });
    await enqueueIntegrationEvent(tx, {
      topic: "service.visit.created",
      aggregateType: "SERVICE_VISIT",
      aggregateId: created.id,
      correlationId: idempotencyKey,
      payload: { serviceVisitId: created.id, serviceCaseId: serviceCase.id, source: "OPS_V2" },
      dedupeKey: "service.visit.created:" + idempotencyKey,
    });
    return { serviceVisit: serializeVisit(created), replayed: false };
  });
}

export async function listServiceVisits(actor: OpsActor, caseId: string) {
  assertRead(actor);
  const serviceCase = await db.query.serviceCases.findFirst({ where: eq(serviceCases.id, caseId), columns: { id: true, customerUserId: true } });
  if (!serviceCase) throw new OpsDomainError("NOT_FOUND", "Service case was not found.");
  if ((actor.role === "CUSTOMER" || actor.role === "USER") && serviceCase.customerUserId !== actor.userId) throw new OpsDomainError("FORBIDDEN", "Service case access is not permitted.");
  const visits = await db.query.serviceVisits.findMany({ where: eq(serviceVisits.caseId, caseId), orderBy: [asc(serviceVisits.scheduledStart), asc(serviceVisits.createdAt)] });
  return visits.map(serializeVisit);
}
