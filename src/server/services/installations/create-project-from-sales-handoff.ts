import "server-only";

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  installationAuditEvents,
  installationChecklistItems,
  installationTasks,
  installationWarranties,
  installationWorkflowProjects,
  materialRequirements,
  proposals,
  salesHandoffs,
  sites,
} from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { OpsDomainError } from "@/lib/opsV2State";
import { evaluateHandoffReadiness } from "@/server/services/sales/handoff-readiness";
import type { ValidatedSalesHandoff } from "@/server/services/sales/sales-handoff";

const INITIAL_TASKS = [
  { code: "SITE_REVIEW", title: "Site review", sequence: 10, evidence: true },
  { code: "ENGINEERING", title: "Engineering review", sequence: 20, evidence: true },
  { code: "MATERIAL_PREPARATION", title: "Material preparation", sequence: 30, evidence: false },
  { code: "INSTALLATION_EXECUTION", title: "Field installation", sequence: 40, evidence: true },
  { code: "QA_COMMISSIONING", title: "QA and commissioning", sequence: 50, evidence: true },
  { code: "HANDOVER", title: "Customer handover", sequence: 60, evidence: true },
] as const;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function projectCodeForProposal(proposalId: string) {
  const digest = createHash("sha256").update(proposalId).digest("hex").slice(0, 10).toUpperCase();
  return "SD-" + digest;
}

async function resolveOrCreateSite(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  proposal: typeof proposals.$inferSelect,
  handoff: ValidatedSalesHandoff,
) {
  if (handoff.site.id || proposal.siteId) {
    const existing = await tx.query.sites.findFirst({
      where: and(eq(sites.id, handoff.site.id || proposal.siteId!), eq(sites.customerId, handoff.customer.userId)),
    });
    if (existing) return existing;
  }

  const sourceKey = "proposal-site:" + proposal.id;
  const keyed = await tx.query.sites.findFirst({
    where: eq(sites.sourceKey, sourceKey),
  });
  if (keyed) return keyed;

  const [site] = await tx.insert(sites).values({
    customerId: handoff.customer.userId,
    label: handoff.site.label,
    addressLine1: handoff.site.addressLine1,
    city: handoff.site.city || null,
    province: handoff.site.province || null,
    postalCode: handoff.site.postalCode || null,
    country: handoff.site.country,
    latitude: handoff.site.latitude ?? null,
    longitude: handoff.site.longitude ?? null,
    accessNotes: handoff.site.accessNote || null,
    sourceKey,
    sourceReferences: { proposalId: proposal.id, handoffIdempotencyKey: handoff.idempotencyKey, source: "SALES_HANDOFF" },
  }).returning();
  if (!site) throw new OpsDomainError("CONFLICT", "Installation site could not be created.");
  await tx.update(proposals).set({ siteId: site.id, updatedAt: new Date() }).where(eq(proposals.id, proposal.id));
  return site;
}

async function ensureInitialProjectRecords(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: string,
  shouldSeed: boolean,
) {
  const existingTasks = await tx.query.installationTasks.findMany({
    where: eq(installationTasks.projectId, projectId),
  });
  const tasksByCode = new Map(existingTasks.map((task) => [task.taskCode, task]));
  const taskRows = [];
  for (const definition of INITIAL_TASKS) {
    const dependsOnTaskCode = definition.sequence > 10
      ? INITIAL_TASKS.find((candidate) => candidate.sequence === definition.sequence - 10)?.code || null
      : null;
    let task = tasksByCode.get(definition.code);
    if (!task && shouldSeed) {
      const [createdTask] = await tx.insert(installationTasks).values({
        projectId,
        taskCode: definition.code,
        title: definition.title,
        sequence: definition.sequence,
        dependsOnTaskCode,
        status: "OPEN",
        erpnextSyncStatus: "PENDING",
      }).returning();
      if (!createdTask) throw new OpsDomainError("CONFLICT", "Initial installation task could not be created.");
      task = createdTask;
      tasksByCode.set(task.taskCode, task);
    }
    if (!task) continue;

    taskRows.push(task);
    if (!shouldSeed) continue;
    const checklistItem = await tx.query.installationChecklistItems.findFirst({
      where: and(
        eq(installationChecklistItems.taskId, task.id),
        eq(installationChecklistItems.itemCode, definition.code + "_READY"),
      ),
    });
    if (!checklistItem) {
      await tx.insert(installationChecklistItems).values({
        taskId: task.id,
        itemCode: definition.code + "_READY",
        label: definition.title + " ready for review",
        sequence: 10,
        required: true,
        evidenceRequired: definition.evidence,
        allowsNa: false,
        status: "OPEN",
      });
    }
  }
  return taskRows;
}

async function ensureInitialProjectSupportRecords(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  project: typeof installationWorkflowProjects.$inferSelect,
  customerId: string,
  siteId: string,
  taskRows: Array<typeof installationTasks.$inferSelect>,
) {
  if (project.lifecycleState === "COMPLETED") return;

  const existingMaterial = await tx.query.materialRequirements.findFirst({
    where: eq(materialRequirements.projectId, project.id),
  });
  if (!existingMaterial) {
    await tx.insert(materialRequirements).values({
      projectId: project.id,
      taskId: taskRows.find((task) => task.taskCode === "MATERIAL_PREPARATION")?.id || null,
      productName: "Solar installation system package",
      quantity: "1.000",
      unit: "package",
      status: "REQUIRED",
      serialRequired: false,
      source: "SALES_HANDOFF",
    });
  }

  const existingWarranty = await tx.query.installationWarranties.findFirst({
    where: eq(installationWarranties.projectId, project.id),
  });
  if (!existingWarranty) {
    await tx.insert(installationWarranties).values({
      projectId: project.id,
      customerId,
      siteId,
      status: "PENDING_ACTIVATION",
      policyVersion: "SD-INSTALL-2026-V1",
      durationMonths: 24,
      details: { source: "SALES_HANDOFF" },
    });
  } else if (existingWarranty.customerId !== customerId || existingWarranty.siteId !== siteId) {
    await tx.update(installationWarranties).set({
      customerId,
      siteId,
      updatedAt: new Date(),
    }).where(eq(installationWarranties.id, existingWarranty.id));
  }
}

export async function createInstallationProjectFromSalesHandoff(handoff: ValidatedSalesHandoff) {
  const readiness = evaluateHandoffReadiness(handoff);
  if (!readiness.ready) throw new OpsDomainError("DEPENDENCY_BLOCKED", `Sales handoff is not ready: ${readiness.unmetConditions.map((condition) => condition.code).join(", ")}`);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ "sales-handoff:" + handoff.idempotencyKey }))`);
    const proposal = await tx.query.proposals.findFirst({
      where: eq(proposals.id, handoff.acceptedProposalRevision.proposalId),
    });
    if (!proposal) throw new OpsDomainError("NOT_FOUND", "Sales handoff references a missing proposal.");
    if (proposal.userId !== handoff.customer.userId) throw new OpsDomainError("CONFLICT", "Sales handoff customer does not match the proposal.");
    const existingHandoff = await tx.query.salesHandoffs.findFirst({ where: eq(salesHandoffs.idempotencyKey, handoff.idempotencyKey) });
    if (existingHandoff && (
      existingHandoff.dealId !== handoff.dealId
      || !isDeepStrictEqual(existingHandoff.acceptedProposalRevision, handoff.acceptedProposalRevision)
      || !isDeepStrictEqual(existingHandoff.customer, handoff.customer)
      || !isDeepStrictEqual(existingHandoff.configurationSnapshot, handoff.configurationSnapshot)
    )) throw new OpsDomainError("CONFLICT", "This handoff idempotency key belongs to different handoff content.");
    const handoffRow = existingHandoff || (await tx.insert(salesHandoffs).values({ ...handoff }).returning())[0];
    if (!handoffRow) throw new OpsDomainError("CONFLICT", "Sales handoff could not be persisted.");
    const site = await resolveOrCreateSite(tx, proposal, handoff);
    const existing = await tx.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.proposalId, proposal.id),
    });
    if (existing) {
      const updates: {
        customerId?: string;
        siteId?: string;
        configurationSnapshot?: unknown;
        sourceEventKey?: string;
        updatedAt: Date;
      } = {
        customerId: handoff.customer.userId,
        siteId: site.id,
        updatedAt: new Date(),
      };
      if (Object.keys(asObject(existing.configurationSnapshot)).length === 0) {
        updates.configurationSnapshot = handoff.configurationSnapshot;
      }
      if (!existing.sourceEventKey) updates.sourceEventKey = handoff.idempotencyKey;
      const [updated] = await tx.update(installationWorkflowProjects)
        .set(updates)
        .where(eq(installationWorkflowProjects.id, existing.id))
        .returning();
      const project = updated || existing;
      const taskRows = await ensureInitialProjectRecords(tx, project.id, project.lifecycleState !== "COMPLETED");
      await ensureInitialProjectSupportRecords(tx, project, handoff.customer.userId, site.id, taskRows);
      await tx.update(proposals).set({
        siteId: site.id,
        fulfillmentType: "INSTALLATION",
        isInstallationRequired: true,
        updatedAt: new Date(),
      }).where(eq(proposals.id, proposal.id));

      const replay = await tx.query.installationAuditEvents.findFirst({
        where: eq(installationAuditEvents.idempotencyKey, handoff.idempotencyKey),
      });
      if (replay) {
        const replayProjectId = text(asObject(replay.payload).projectId);
        if (replayProjectId && replayProjectId !== project.id) {
          throw new OpsDomainError("CONFLICT", "This handoff idempotency key belongs to another installation project.");
        }
        await tx.update(salesHandoffs).set({ status: "CONSUMED", installationProjectId: project.id, consumedAt: handoffRow.consumedAt || new Date(), updatedAt: new Date() }).where(eq(salesHandoffs.id, handoffRow.id));
        return { project, created: false, replayed: true, readiness };
      }

      const [audit] = await tx.insert(installationAuditEvents).values({
        proposalId: proposal.id,
        eventType: "PROJECT_SALES_HANDOFF_RECONCILED",
        actorUserId: null,
        idempotencyKey: handoff.idempotencyKey,
        payload: {
          projectId: project.id,
          handoffId: handoffRow.id,
          source: "SALES_HANDOFF",
        },
      }).returning({ id: installationAuditEvents.id });
      if (!audit) throw new OpsDomainError("CONFLICT", "Sales handoff reconciliation audit event could not be recorded.");

      await enqueueIntegrationEvent(tx, {
        topic: "installation.project.requested",
        aggregateType: "INSTALLATION_PROJECT",
        aggregateId: proposal.id,
        correlationId: handoff.idempotencyKey,
        payload: {
          projectId: project.id,
          proposalId: proposal.id,
          source: "SALES_HANDOFF",
          auditEventId: audit.id,
        },
        dedupeKey: "installation.project.requested:" + project.id,
      });

      await tx.update(salesHandoffs).set({ status: "CONSUMED", installationProjectId: project.id, consumedAt: new Date(), updatedAt: new Date() }).where(eq(salesHandoffs.id, handoffRow.id));
      return { project, created: false, replayed: false, readiness };
    }

    const projectCode = projectCodeForProposal(proposal.id);
    const [project] = await tx.insert(installationWorkflowProjects).values({
      proposalId: proposal.id,
      customerId: handoff.customer.userId,
      siteId: site.id,
      projectCode,
      status: "OPEN",
      lifecycleState: "NEW",
      sourceEventKey: handoff.idempotencyKey,
      configurationSnapshot: handoff.configurationSnapshot,
      sourceVersion: 2,
      erpnextSyncStatus: "PENDING",
      permitStatus: "NOT_STARTED",
    }).returning();
    if (!project) throw new OpsDomainError("CONFLICT", "Installation project could not be created.");

    const taskRows = await ensureInitialProjectRecords(tx, project.id, true);
    await ensureInitialProjectSupportRecords(tx, project, handoff.customer.userId, site.id, taskRows);
    await tx.update(proposals).set({
      siteId: site.id,
      fulfillmentType: "INSTALLATION",
      isInstallationRequired: true,
      updatedAt: new Date(),
    }).where(eq(proposals.id, proposal.id));
    const [audit] = await tx.insert(installationAuditEvents).values({
      proposalId: proposal.id,
      eventType: "PROJECT_CREATED_FROM_SALES_HANDOFF",
      actorUserId: null,
      idempotencyKey: handoff.idempotencyKey,
      payload: {
        projectId: project.id,
        handoffId: handoffRow.id,
        source: "SALES_HANDOFF",
      },
    }).returning({ id: installationAuditEvents.id });
    if (!audit) throw new OpsDomainError("CONFLICT", "Sales handoff project audit event could not be recorded.");

    await enqueueIntegrationEvent(tx, {
      topic: "installation.project.requested",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: proposal.id,
      correlationId: handoff.idempotencyKey,
      payload: {
        projectId: project.id,
        proposalId: proposal.id,
        source: "SALES_HANDOFF",
        auditEventId: audit.id,
      },
      dedupeKey: "installation.project.requested:" + project.id,
    });

    await tx.update(salesHandoffs).set({ status: "CONSUMED", installationProjectId: project.id, consumedAt: new Date(), updatedAt: new Date() }).where(eq(salesHandoffs.id, handoffRow.id));
    return { project, created: true, readiness };
  });
}
