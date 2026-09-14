import "server-only";

import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import {
  installationChecklistItems,
  installationJobTickets,
  installationTasks,
  installationWorkflowProjects,
  integrationOutbox,
  installedAssets,
  proposals,
  users,
} from "@/db/schema";
import { erpNextGateway } from "@/server/services/integrations/erpnext-gateway";
import {
  createErpnextQualityInspection,
} from "@/lib/techPortalErpnext";
import type { TechPortalPhaseCode, TechTestValues } from "@/types/techPortal";
import { registerWarrantyAfterHandover } from "@/lib/services/warranty-registrar";
import type { TechnicianGps } from "@/types/techPortal";

export const INSTALLATION_ERPNEXT_TOPICS = [
  "installation.project.requested",
  "installation.project.state_changed",
  "installation.visit.scheduled",
  "installation.assignment.changed",
  "installation.materials.updated",
  "installation.asset.registered",
  "installation.asset.resolved",
  "installation.warranty.activated",
  "installation.job.started",
  "installation.evidence.ready",
  "installation.evidence.reviewed",
  "installation.qc.completed",
  "installation.checklist.verified",
  "installation.checklist.amended",
  "installation.task.completed",
  "installation.handover.completed",
  "installation.warranty.requested",
] as const;

export type InstallationErpnextTopic = (typeof INSTALLATION_ERPNEXT_TOPICS)[number];
export type InstallationOutboxEvent = typeof integrationOutbox.$inferSelect;

export function isInstallationErpnextSyncEnabled() {
  return process.env.ERPNEXT_INSTALLATION_SYNC_ENABLED?.trim().toLowerCase() === "true"
    && Boolean((process.env.ERPNEXT_BASE_URL || process.env.ERPNEXT_URL)?.trim())
    && Boolean(process.env.ERPNEXT_API_KEY?.trim())
    && Boolean(process.env.ERPNEXT_API_SECRET?.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseGpsPayload(value: unknown): TechnicianGps | null {
  const payload = asRecord(value);
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return null;
  }
  const accuracy = Number(payload.accuracy);
  return {
    latitude,
    longitude,
    ...(Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}),
    capturedAt: getText(payload.capturedAt) || new Date().toISOString(),
  };
}

function truncateError(error: unknown) {
  return (error instanceof Error ? error.message : "ERPNext synchronization failed.").slice(0, 2000);
}

async function addMarkedComment(input: { taskId: string; marker: string; content: string }) {
  const eventId = input.marker
    .replace("[SolarDream-Event:", "")
    .replace("]", "")
    .trim();
  await erpNextGateway.appendTaskComment({
    taskProviderId: input.taskId,
    eventId,
    content: input.content,
  });
}

async function loadLocalProject(proposalId: string) {
  const project = await db.query.installationWorkflowProjects.findFirst({
    where: eq(installationWorkflowProjects.proposalId, proposalId),
  });
  if (!project) throw new Error("Local installation project not found.");
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, proposalId),
    columns: { id: true, systemSizeKwp: true, erpnextCustomerId: true, erpnextQuotationId: true },
  });
  if (!proposal) throw new Error("Installation proposal not found.");
  return { project, proposal };
}

async function ensureRemoteProjection(proposalId: string) {
  const { project, proposal } = await loadLocalProject(proposalId);
  const localTasks = await db.query.installationTasks.findMany({
    where: eq(installationTasks.projectId, project.id),
    orderBy: [asc(installationTasks.sequence)],
  });
  const projectTitle = `SolarDream ${proposal.systemSizeKwp || "Custom"}kWp - ${project.projectCode}`;
  const remoteProject = await erpNextGateway.upsertInstallationProject({
    projectCode: project.projectCode,
    proposalId: proposal.id,
    title: projectTitle,
    customerId: proposal.erpnextCustomerId,
    quotationId: proposal.erpnextQuotationId,
    expectedStartDate: new Date().toISOString().slice(0, 10),
    existingProviderId: project.erpnextProjectId,
  });
  const remoteProjectId = remoteProject.providerId;

  await db.update(installationWorkflowProjects).set({
    erpnextProjectId: remoteProjectId,
    erpnextSyncStatus: "SYNCING",
    erpnextSyncError: null,
    updatedAt: new Date(),
  }).where(eq(installationWorkflowProjects.id, project.id));

  let previousRemoteTaskId: string | null = null;
  for (const localTask of localTasks) {
    const taskCode = localTask.taskCode;
    let remoteTaskId = localTask.erpnextTaskId;
    const checklist = await db.query.installationChecklistItems.findMany({
      where: eq(installationChecklistItems.taskId, localTask.id),
      orderBy: [asc(installationChecklistItems.sequence)],
    });
    const remoteTask = await erpNextGateway.upsertInstallationTask({
      taskCode,
      title: localTask.title,
      projectProviderId: remoteProjectId,
      proposalId: proposal.id,
      quotationId: proposal.erpnextQuotationId,
      dependencyProviderId: previousRemoteTaskId,
      existingProviderId: remoteTaskId,
      completed: localTask.status === "COMPLETED",
      checklist: checklist.map((item) => ({
        itemCode: item.itemCode,
        label: item.label,
        evidenceRequired: item.evidenceRequired,
      })),
    });
    remoteTaskId = remoteTask.providerId;
    await db.update(installationTasks).set({
      erpnextTaskId: remoteTaskId,
      erpnextSyncStatus: "SYNCED",
      erpnextSyncError: null,
      erpnextLastSyncedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(installationTasks.id, localTask.id));
    previousRemoteTaskId = remoteTaskId;
  }

  const syncedAt = new Date();
  await db.update(installationWorkflowProjects).set({
    erpnextProjectId: remoteProjectId,
    erpnextSyncStatus: "SYNCED",
    erpnextSyncError: null,
    lastSyncedAt: syncedAt,
    updatedAt: syncedAt,
  }).where(eq(installationWorkflowProjects.id, project.id));
  return {
    project: { ...project, erpnextProjectId: remoteProjectId },
    tasks: await db.query.installationTasks.findMany({
      where: eq(installationTasks.projectId, project.id),
      orderBy: [asc(installationTasks.sequence)],
    }),
  };
}

async function ensureRemoteProjectionForProject(projectId: string) {
  const project = await db.query.installationWorkflowProjects.findFirst({
    where: eq(installationWorkflowProjects.id, projectId),
    columns: { proposalId: true },
  });
  if (!project) throw new Error("Local installation project not found.");
  return ensureRemoteProjection(project.proposalId);
}

async function syncAssetRegistered(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const projectId = getText(payload.projectId) || event.aggregateId;
  const assetId = getText(payload.assetId);
  if (!projectId || !assetId) throw new Error("Asset event is missing its local project or asset ID.");
  const rows = await db.select({
    asset: installedAssets,
    project: installationWorkflowProjects,
    proposal: proposals,
  })
    .from(installedAssets)
    .innerJoin(installationWorkflowProjects, eq(installedAssets.projectId, installationWorkflowProjects.id))
    .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
    .where(and(eq(installedAssets.id, assetId), eq(installationWorkflowProjects.id, projectId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Asset event references missing local records.");
  if (row.asset.status === "UNKNOWN") return;
  await ensureRemoteProjection(row.project.proposalId);
  const result = await erpNextGateway.registerSerial({
    serialNumber: row.asset.serialNumber,
    itemCode: row.asset.catalogProductId,
    productName: row.asset.productName,
    projectCode: row.project.projectCode,
    customerId: row.proposal.erpnextCustomerId,
    warrantyExpiryDate: row.asset.warrantyExpiryDate.toISOString().slice(0, 10),
    existingProviderId: row.asset.erpnextSerialId,
  });
  await db.update(installedAssets).set({
    erpnextSerialId: result.providerId,
    updatedAt: new Date(),
  }).where(eq(installedAssets.id, row.asset.id));
}

async function markProjectFailure(proposalId: string, error: unknown) {
  const message = truncateError(error);
  const project = await db.query.installationWorkflowProjects.findFirst({
    where: or(
      eq(installationWorkflowProjects.proposalId, proposalId),
      eq(installationWorkflowProjects.id, proposalId),
    ),
    columns: { id: true },
  });
  if (!project) return;
  await db.update(installationWorkflowProjects).set({
    erpnextSyncStatus: "FAILED",
    erpnextSyncError: message,
    updatedAt: new Date(),
  }).where(eq(installationWorkflowProjects.id, project.id));
}

async function syncProjectStateChanged(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const projectId = getText(payload.projectId) || event.aggregateId;
  const rows = await db
    .select({
      project: installationWorkflowProjects,
      proposal: proposals,
    })
    .from(installationWorkflowProjects)
    .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
    .where(eq(installationWorkflowProjects.id, projectId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Installation project state event references a missing local project.");

  const result = await erpNextGateway.upsertInstallationProject({
    projectCode: row.project.projectCode,
    proposalId: row.proposal.id,
    title: "SolarDream " + (row.proposal.systemSizeKwp || "Custom") + "kWp - " + row.project.projectCode,
    customerId: row.proposal.erpnextCustomerId,
    existingProviderId: row.project.erpnextProjectId,
  });
  const now = new Date();
  await db.update(installationWorkflowProjects).set({
    erpnextProjectId: result.providerId,
    erpnextSyncStatus: "SYNCED",
    erpnextSyncError: null,
    lastSyncedAt: now,
    updatedAt: now,
  }).where(eq(installationWorkflowProjects.id, row.project.id));
}

async function getRemoteTask(proposalId: string, localTaskId: string) {
  const projection = await ensureRemoteProjection(proposalId);
  const task = projection.tasks.find((candidate) => candidate.id === localTaskId);
  if (!task?.erpnextTaskId) throw new Error("ERPNext Task projection is not available yet.");
  return { ...projection, task };
}

type RemoteTaskProjection = Awaited<ReturnType<typeof getRemoteTask>>;

function requireRemoteIds(projection: RemoteTaskProjection) {
  const projectId = projection.project.erpnextProjectId;
  const taskId = projection.task.erpnextTaskId;
  if (!projectId || !taskId) {
    throw new Error("ERPNext installation projection is missing its Project or Task ID.");
  }
  return { projectId, taskId };
}

async function syncJobStarted(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  if (!localTaskId) throw new Error("Installation start event is missing its local task ID.");
  const projection = await getRemoteTask(event.aggregateId, localTaskId);
  const remote = requireRemoteIds(projection);
  const actorId = getText(payload.actorUserId);
  const actor = actorId ? await db.query.users.findFirst({ where: eq(users.id, actorId), columns: { email: true } }) : null;
  if (!actor?.email) throw new Error("Technician email is unavailable for ERPNext Employee mapping.");
  const employee = await erpNextGateway.getEmployeeForUser({ email: actor.email });
  if (!employee) throw new Error("No active ERPNext Employee is mapped to the technician email.");
  const startedAt = new Date(getText(payload.startedAt) || event.createdAt.toISOString());
  const timesheet = await erpNextGateway.createTimesheet({
    employeeId: employee.id,
    employeeName: employee.name,
    projectId: remote.projectId,
    taskId: remote.taskId,
    startedAt,
    technicianEmail: actor.email,
    idempotencyKey: event.dedupeKey || event.id,
  });
  await addMarkedComment({
    taskId: remote.taskId,
    marker: `[SolarDream-Event:${event.id}]`,
    content: [
      "[SolarDream JOB_STARTED]",
      `UTC: ${startedAt.toISOString()}`,
      `Employee: ${employee.id}`,
      `Timesheet: ${timesheet.id}`,
      `JSA version: ${getText(payload.preflightVersion) || "unknown"}`,
      `Checks: ${JSON.stringify(payload.checks || {})}`,
    ].join("\n"),
  });
  await erpNextGateway.updateTaskStatus({ taskId: remote.taskId, status: "Working", progress: 0 });
  await db.update(installationTasks).set({
    erpnextTimesheetId: timesheet.id,
    erpnextSyncStatus: "SYNCED",
    erpnextSyncError: null,
    erpnextLastSyncedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(installationTasks.id, localTaskId));
}

async function syncEvidence(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  const evidenceId = getText(payload.evidenceId);
  if (!localTaskId || !evidenceId) throw new Error("Installation evidence event is incomplete.");
  const projection = await getRemoteTask(event.aggregateId, localTaskId);
  const remote = requireRemoteIds(projection);
  await addMarkedComment({
    taskId: remote.taskId,
    marker: `[SolarDream-Event:${event.id}]`,
    content: [
      "[SolarDream EVIDENCE_READY]",
      `Evidence: ${evidenceId}`,
      `Phase: ${getText(payload.phase)}`,
      `Drive URL: ${getText(payload.fileUrl) || "not available"}`,
      `Storage file: ${getText(payload.storageFileId) || "not available"}`,
      `SHA-256: ${getText(payload.sha256) || "not available"}`,
    ].join("\n"),
  });
}

async function syncEvidenceReviewed(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  if (!localTaskId) throw new Error("Evidence review event is missing its local task ID.");
  const projection = await getRemoteTask(event.aggregateId, localTaskId);
  const remote = requireRemoteIds(projection);
  await addMarkedComment({
    taskId: remote.taskId,
    marker: `[SolarDream-Event:${event.id}]`,
    content: [
      "[SolarDream EVIDENCE_REVIEWED]",
      `Evidence: ${getText(payload.evidenceId)}`,
      `Decision: ${getText(payload.decision)}`,
      `Reason: ${getText(payload.reason) || "none"}`,
      `SHA-256: ${getText(payload.sha256) || "not available"}`,
    ].join("\n"),
  });
}

async function syncQcCompleted(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  const checklistItemId = getText(payload.checklistItemId);
  const phase = getText(payload.phase) as TechPortalPhaseCode;
  if (!localTaskId || !checklistItemId || !phase) throw new Error("Installation QC event is incomplete.");
  const projection = await getRemoteTask(event.aggregateId, localTaskId);
  const remote = requireRemoteIds(projection);
  const testValues = asRecord(payload.testValues) as TechTestValues;
  const evidenceHashes = Array.isArray(payload.evidenceHashes)
    ? payload.evidenceHashes.filter((value): value is string => typeof value === "string")
    : [];
  const inspection = await createErpnextQualityInspection({
    projectId: remote.projectId,
    taskId: remote.taskId,
    phase,
    testValues,
    evidenceHashes,
    idempotencyKey: event.dedupeKey || event.id,
  });
  await addMarkedComment({
    taskId: remote.taskId,
    marker: `[SolarDream-Event:${event.id}]`,
    content: [
      "[SolarDream QC_PHASE_COMPLETED]",
      `Phase: ${phase}`,
      `Quality Inspection: ${inspection.id}`,
      `Test values: ${JSON.stringify(testValues)}`,
      `Evidence SHA-256: ${evidenceHashes.join(", ") || "none"}`,
    ].join("\n"),
  });
  await db.update(installationChecklistItems).set({
    erpnextQualityInspectionId: inspection.id,
  }).where(eq(installationChecklistItems.id, checklistItemId));
}

async function syncChecklistVerified(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  if (!localTaskId) throw new Error("Checklist event is missing its local task ID.");
  const projection = await getRemoteTask(event.aggregateId, localTaskId);
  const remote = requireRemoteIds(projection);
  await addMarkedComment({
    taskId: remote.taskId,
    marker: `[SolarDream-Event:${event.id}]`,
    content: [
      "[SolarDream CHECKLIST_VERIFIED]",
      `Checklist item: ${getText(payload.checklistItemId)}`,
      `Outcome: ${getText(payload.outcome)}`,
      `Remarks: ${getText(payload.remarks) || "none"}`,
    ].join("\n"),
  });
}

async function syncChecklistAmended(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  if (!localTaskId) throw new Error("Checklist amendment event is missing its local task ID.");
  const projection = await getRemoteTask(event.aggregateId, localTaskId);
  const remote = requireRemoteIds(projection);
  await addMarkedComment({
    taskId: remote.taskId,
    marker: `[SolarDream-Event:${event.id}]`,
    content: [
      "[SolarDream CHECKLIST_AMENDED]",
      `Item: ${getText(payload.itemCode)}`,
      `Label: ${getText(payload.label)}`,
      `Reason: ${getText(payload.reason) || "none"}`,
    ].join("\n"),
  });
}

async function syncTaskCompleted(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  if (!localTaskId) throw new Error("Task completion event is missing its local task ID.");
  const projection = await getRemoteTask(event.aggregateId, localTaskId);
  const remote = requireRemoteIds(projection);
  await erpNextGateway.updateTaskStatus({ taskId: remote.taskId, status: "Completed", progress: 100 });
  await addMarkedComment({
    taskId: remote.taskId,
    marker: `[SolarDream-Event:${event.id}]`,
    content: "[SolarDream TASK_COMPLETED]",
  });
}

async function syncHandover(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  if (!localTaskId) throw new Error("Handover event is missing its local task ID.");
  const projection = await getRemoteTask(event.aggregateId, localTaskId);
  const remote = requireRemoteIds(projection);
  if (projection.task.erpnextTimesheetId) {
    await erpNextGateway.completeTimesheet({ timesheetId: projection.task.erpnextTimesheetId, completedAt: event.createdAt });
  }
  await erpNextGateway.updateTaskStatus({ taskId: remote.taskId, status: "Completed", progress: 100 });
  await erpNextGateway.completeProject(remote.projectId);
  await addMarkedComment({
    taskId: remote.taskId,
    marker: `[SolarDream-Event:${event.id}]`,
    content: [
      "[SolarDream HANDOVER_COMPLETED]",
      `Certificate: ${getText(payload.filename) || "not available"}`,
      `SHA-256: ${getText(payload.sha256) || "not available"}`,
      `Drive PDF: ${getText(payload.drivePdfUrl) || "not available"}`,
    ].join("\n"),
  });
}

async function loadWarrantyAccess(proposalId: string, taskId: string, actorUserId: string) {
  const [rows, actor] = await Promise.all([
    db.select({
      task: installationTasks,
      project: installationWorkflowProjects,
      proposal: proposals,
      customer: users,
      jobTicket: installationJobTickets,
    })
      .from(installationTasks)
      .innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
      .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
      .innerJoin(users, eq(proposals.userId, users.id))
      .leftJoin(installationJobTickets, eq(installationWorkflowProjects.proposalId, installationJobTickets.quotationId))
      .where(and(eq(installationTasks.id, taskId), eq(installationWorkflowProjects.proposalId, proposalId)))
      .limit(1),
    db.query.users.findFirst({ where: eq(users.id, actorUserId) }),
  ]);
  const row = rows[0];
  if (!row || !actor) throw new Error("Installation handover warranty event references missing local records.");
  return { ...row, actor: { userId: actor.id, role: actor.role }, fieldVisitId: null };
}

async function syncWarranty(event: InstallationOutboxEvent) {
  const payload = asRecord(event.payload);
  const localTaskId = getText(payload.localTaskId);
  const actorUserId = getText(payload.actorUserId);
  const gps = parseGpsPayload(payload.gps);
  if (!localTaskId || !actorUserId || !gps) throw new Error("Warranty event is missing its local task, actor, or GPS data.");
  await ensureRemoteProjection(event.aggregateId);
  const access = await loadWarrantyAccess(event.aggregateId, localTaskId, actorUserId);
  await registerWarrantyAfterHandover({
    access,
    handoverDate: new Date(getText(payload.completedAt) || event.createdAt.toISOString()),
    gps,
    handoverPdfUrl: getText(payload.drivePdfUrl) || null,
    handoverSha256: getText(payload.sha256),
    idempotencyKey: getText(payload.handoverIdempotencyKey) || event.dedupeKey || event.id,
  });
}

export async function deliverInstallationErpnextEvent(event: InstallationOutboxEvent) {
  if (!INSTALLATION_ERPNEXT_TOPICS.includes(event.topic as InstallationErpnextTopic)) return;
  if (!isInstallationErpnextSyncEnabled()) return;

  try {
    switch (event.topic as InstallationErpnextTopic) {
      case "installation.project.requested":
        await ensureRemoteProjection(event.aggregateId);
        return;
      case "installation.project.state_changed":
        await syncProjectStateChanged(event);
        return;
      case "installation.visit.scheduled":
      case "installation.assignment.changed":
      case "installation.materials.updated":
      case "installation.warranty.activated":
        await ensureRemoteProjectionForProject(event.aggregateId);
        return;
      case "installation.asset.registered":
      case "installation.asset.resolved":
        await syncAssetRegistered(event);
        return;
      case "installation.job.started":
        await syncJobStarted(event);
        return;
      case "installation.evidence.ready":
        await syncEvidence(event);
        return;
      case "installation.evidence.reviewed":
        await syncEvidenceReviewed(event);
        return;
      case "installation.qc.completed":
        await syncQcCompleted(event);
        return;
      case "installation.checklist.verified":
        await syncChecklistVerified(event);
        return;
      case "installation.checklist.amended":
        await syncChecklistAmended(event);
        return;
      case "installation.task.completed":
        await syncTaskCompleted(event);
        return;
      case "installation.handover.completed":
        await syncHandover(event);
        return;
      case "installation.warranty.requested":
        await syncWarranty(event);
        return;
    }
  } catch (error: unknown) {
    await markProjectFailure(event.aggregateId, error);
    throw error;
  }
}
