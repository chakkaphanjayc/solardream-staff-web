import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { installationAuditEvents, installationChecklistItems, installationEvidence, installationTasks, installationWorkflowProjects } from "@/db/schema";
import type { InstallationActor } from "@/lib/installationAccess";
import { deriveChecklistReadiness, deriveProjectTaskAccess, type InstallationSnapshotActor } from "@/lib/projectTaskAccess";
import { canReviewInstallation } from "@/lib/installationAccess";
import { assertInstallationAuditReplay } from "@/lib/installationIdempotency";
import { isOpsProjectDependencySatisfied } from "@/lib/opsV2State";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";


export async function loadInstallationSnapshot(proposalId: string, actor: InstallationSnapshotActor) {
  const project = await db.query.installationWorkflowProjects.findFirst({ where: eq(installationWorkflowProjects.proposalId, proposalId) });
  if (!project) return null;
  const tasks = await db.query.installationTasks.findMany({ where: eq(installationTasks.projectId, project.id), orderBy: [asc(installationTasks.sequence)] });
  const taskStatus = new Map(tasks.map((task) => [task.taskCode, task.status]));
  const items = tasks.length > 0
    ? await db.query.installationChecklistItems.findMany({
      where: inArray(installationChecklistItems.taskId, tasks.map((task) => task.id)),
      orderBy: [asc(installationChecklistItems.taskId), asc(installationChecklistItems.sequence)],
    })
    : [];
  const evidenceRows = items.length > 0
    ? await db.query.installationEvidence.findMany({
      where: inArray(installationEvidence.checklistItemId, items.map((item) => item.id)),
    })
    : [];
  const evidenceByItem = new Map<string, typeof evidenceRows>();
  for (const evidence of evidenceRows) {
    const current = evidenceByItem.get(evidence.checklistItemId) || [];
    current.push(evidence);
    evidenceByItem.set(evidence.checklistItemId, current);
  }
  const itemsByTask = new Map<string, typeof items>();
  for (const item of items) {
    const current = itemsByTask.get(item.taskId) || [];
    current.push(item);
    itemsByTask.set(item.taskId, current);
  }
  const result = tasks.map((task) => {
    const checklist = (itemsByTask.get(task.id) || []).map((item) => ({
      ...item,
      evidence: (evidenceByItem.get(item.id) || []).map((evidence) => ({
        id: evidence.id, contentType: evidence.contentType, byteSize: evidence.byteSize, sha256: evidence.sha256,
        status: evidence.status, latitude: evidence.latitude, longitude: evidence.longitude, capturedAt: evidence.capturedAt, createdAt: evidence.createdAt,
      })),
    }));
    const dependencyReady = !task.dependsOnTaskCode
      || taskStatus.get(task.dependsOnTaskCode) === "COMPLETED"
      || isOpsProjectDependencySatisfied(project.lifecycleState, task.dependsOnTaskCode);
    const { evidenceReady, checklistReady } = deriveChecklistReadiness(checklist.map((item) => ({
      required: item.required, evidenceRequired: item.evidenceRequired, status: item.status, outcome: item.outcome,
      evidenceReady: item.evidence.some((evidence) => evidence.status === "READY"),
    })));
    const capabilities = deriveProjectTaskAccess({ actor, assignedUserId: task.assignedUserId, taskStatus: task.status, dependencyReady, evidenceReady, checklistReady });
    return { ...task, checklist, capabilities };
  });
  return { project, actor: { mode: actor.mode, role: actor.role }, tasks: result.filter((task) => task.capabilities.canView) };
}

export async function completeChecklistItem(input: { itemId: string; actor: InstallationActor; idempotencyKey: string; outcome: "PASS" | "FAIL" | "NA"; remarks?: string }) {
  const rows = await db.select({ item: installationChecklistItems, task: installationTasks, proposalId: installationWorkflowProjects.proposalId })
    .from(installationChecklistItems).innerJoin(installationTasks, eq(installationChecklistItems.taskId, installationTasks.id))
    .innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
    .where(eq(installationChecklistItems.id, input.itemId)).limit(1);
  const context = rows[0];
  if (!context) throw new Error("Checklist item not found.");
  if (input.outcome === "NA" && (!input.remarks || (!context.item.allowsNa && !canReviewInstallation(input.actor)))) throw new Error("N/A is not permitted for this checklist item.");
  const evidence = input.outcome === "NA" ? null : await db.query.installationEvidence.findFirst({ where: and(eq(installationEvidence.checklistItemId, input.itemId), eq(installationEvidence.status, "READY")) });
  if (input.outcome !== "NA" && context.item.evidenceRequired && !evidence) throw new Error("Required evidence is not ready.");
  const now = new Date();
  const verificationHash = createHash("sha256").update(`${context.task.taskCode}:${context.item.itemCode}:${input.outcome}:${input.remarks || ""}:${evidence?.sha256 || ""}:${input.idempotencyKey}`).digest("hex");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`installation:item:${input.itemId}`}))`);
    const existing = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, input.idempotencyKey) });
    if (assertInstallationAuditReplay(existing, {
      eventType: "CHECKLIST_VERIFIED",
      proposalId: context.proposalId,
      taskId: context.task.id,
      checklistItemId: input.itemId,
      payload: { outcome: input.outcome, remarks: input.remarks || null, evidenceSha256: evidence?.sha256 || null },
    })) return;
    const [updatedItem] = await tx.update(installationChecklistItems).set({ status: "VERIFIED", outcome: input.outcome, remarks: input.remarks || null, verifiedAt: now, verifiedByUserId: input.actor.userId, verificationHash })
      .where(and(eq(installationChecklistItems.id, input.itemId), ne(installationChecklistItems.status, "VERIFIED"))).returning({ id: installationChecklistItems.id });
    if (!updatedItem) throw new Error("Checklist item is already verified.");
    const [auditEvent] = await tx.insert(installationAuditEvents).values({ proposalId: context.proposalId, taskId: context.task.id, checklistItemId: input.itemId, eventType: "CHECKLIST_VERIFIED", actorUserId: input.actor.userId, idempotencyKey: input.idempotencyKey, payload: { outcome: input.outcome, remarks: input.remarks || null, evidenceSha256: evidence?.sha256 || null, afterHash: verificationHash } }).returning({ id: installationAuditEvents.id });
    if (!auditEvent) throw new Error("Checklist audit event could not be created.");
    await enqueueIntegrationEvent(tx, {
      topic: "installation.checklist.verified",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: context.proposalId,
      payload: { auditEventId: auditEvent.id, localTaskId: context.task.id, checklistItemId: input.itemId, itemCode: context.item.itemCode, outcome: input.outcome, remarks: input.remarks || null, evidenceSha256: evidence?.sha256 || null, evidenceMime: evidence?.contentType || null },
      dedupeKey: `installation.checklist.verified:${input.idempotencyKey}`,
    });
  });
  return { itemId: input.itemId, status: "VERIFIED" as const, outcome: input.outcome, remarks: input.remarks || null, verificationHash };
}

export async function completeInstallationTask(input: { taskId: string; actor: InstallationActor; idempotencyKey: string }) {
  const context = await db.select({ task: installationTasks, proposalId: installationWorkflowProjects.proposalId, lifecycleState: installationWorkflowProjects.lifecycleState }).from(installationTasks)
    .innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id)).where(eq(installationTasks.id, input.taskId)).limit(1);
  const row = context[0];
  if (!row) throw new Error("Task not found.");
  const requiredItems = await db.query.installationChecklistItems.findMany({ where: and(eq(installationChecklistItems.taskId, input.taskId), eq(installationChecklistItems.required, true)) });
  if (requiredItems.some((item) => item.status !== "VERIFIED" || (item.outcome !== "PASS" && item.outcome !== "NA"))) throw new Error("Required checklist items have not passed.");
  if (row.task.dependsOnTaskCode) {
    const dependency = await db.query.installationTasks.findFirst({ where: and(eq(installationTasks.projectId, row.task.projectId), eq(installationTasks.taskCode, row.task.dependsOnTaskCode)) });
    if (!dependency || (dependency.status !== "COMPLETED" && !isOpsProjectDependencySatisfied(row.lifecycleState, dependency.taskCode))) {
      throw new Error("Dependent task is incomplete.");
    }
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`installation:task:${input.taskId}`}))`);
    const existing = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, input.idempotencyKey) });
    if (assertInstallationAuditReplay(existing, {
      eventType: "TASK_COMPLETED",
      proposalId: row.proposalId,
      taskId: input.taskId,
      payload: {},
    })) return;
    const [updatedTask] = await tx.update(installationTasks).set({ status: "COMPLETED", completedAt: new Date(), completedByUserId: input.actor.userId, updatedAt: new Date() })
      .where(and(eq(installationTasks.id, input.taskId), ne(installationTasks.status, "COMPLETED"))).returning({ id: installationTasks.id });
    if (!updatedTask) throw new Error("Task is already completed.");
    const [auditEvent] = await tx.insert(installationAuditEvents).values({ proposalId: row.proposalId, taskId: input.taskId, eventType: "TASK_COMPLETED", actorUserId: input.actor.userId, idempotencyKey: input.idempotencyKey, payload: {} }).returning({ id: installationAuditEvents.id });
    if (!auditEvent) throw new Error("Task audit event could not be created.");
    await enqueueIntegrationEvent(tx, {
      topic: "installation.task.completed",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: row.proposalId,
      payload: { auditEventId: auditEvent.id, localTaskId: input.taskId },
      dedupeKey: `installation.task.completed:${input.idempotencyKey}`,
    });
  });
  return { taskId: input.taskId, status: "COMPLETED" as const };
}
