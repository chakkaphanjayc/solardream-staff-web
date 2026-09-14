import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { fieldVisits, installationJobTickets, installationTasks, installationWorkflowProjects, jobAssignments, proposals, users } from "@/db/schema";
import { canReviewInstallation, getInstallationActor, type InstallationActor } from "@/lib/installationAccess";
import { isOpsProjectDependencySatisfied } from "@/lib/opsV2State";

export type TechnicianTaskAccess = {
  actor: InstallationActor;
  task: typeof installationTasks.$inferSelect;
  project: typeof installationWorkflowProjects.$inferSelect;
  proposal: typeof proposals.$inferSelect;
  customer: typeof users.$inferSelect;
  jobTicket: typeof installationJobTickets.$inferSelect | null;
  fieldVisitId: string | null;
};

export type TechnicianTaskAccessResult =
  | { kind: "OK"; access: TechnicianTaskAccess }
  | { kind: "UNAUTHENTICATED" }
  | { kind: "NOT_FOUND" }
  | { kind: "FORBIDDEN"; reason: "INSTALLER_ROLE_REQUIRED" | "TASK_NOT_ASSIGNED" }
  | { kind: "CONFLICT"; reason: "TASK_STATE" | "DEPENDENCY_INCOMPLETE"; status: string };

export type TechnicianDashboardAccessResult =
  | { kind: "OK"; actor: InstallationActor; readOnly: boolean }
  | { kind: "UNAUTHENTICATED" }
  | { kind: "FORBIDDEN"; reason: "TECHNICIAN_OR_REVIEWER_ROLE_REQUIRED" };

/**
 * The field portal has two safe access modes:
 *
 * - INSTALLER accounts see their assigned route and can execute field work.
 * - installation reviewers can inspect the current route in read-only mode.
 *
 * Keeping this separate from getTechnicianActor() is intentional. Mutation
 * endpoints must continue to require the assigned installer account.
 */
export async function getTechnicianDashboardAccess(): Promise<TechnicianDashboardAccessResult> {
  const actor = await getInstallationActor();
  if (!actor) return { kind: "UNAUTHENTICATED" };
  if (actor.role === "INSTALLER") return { kind: "OK", actor, readOnly: false };
  if (canReviewInstallation(actor)) return { kind: "OK", actor, readOnly: true };
  return { kind: "FORBIDDEN", reason: "TECHNICIAN_OR_REVIEWER_ROLE_REQUIRED" };
}

export async function getTechnicianActor() {
  const actor = await getInstallationActor();
  if (!actor) return { kind: "UNAUTHENTICATED" as const };
  if (actor.role !== "INSTALLER") {
    return { kind: "FORBIDDEN" as const, reason: "INSTALLER_ROLE_REQUIRED" as const };
  }
  return { kind: "OK" as const, actor };
}

export async function getTechnicianTaskAccess(
  taskId: string,
  allowedStatuses: readonly string[],
  fieldVisitId?: string,
): Promise<TechnicianTaskAccessResult> {
  const actorResult = await getTechnicianActor();
  if (actorResult.kind !== "OK") return actorResult;

  const rows = await db.select({
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
    .where(eq(installationTasks.id, taskId))
    .limit(1);

  const row = rows[0];
  if (!row) return { kind: "NOT_FOUND" };
  const canonicalAssignmentRows = await db.select({ assignment: jobAssignments })
    .from(jobAssignments)
    .innerJoin(fieldVisits, eq(jobAssignments.visitId, fieldVisits.id))
    .where(and(
      fieldVisitId
        ? eq(jobAssignments.visitId, fieldVisitId)
        : eq(jobAssignments.taskId, row.task.id),
      eq(fieldVisits.projectId, row.task.projectId),
      eq(jobAssignments.assigneeUserId, actorResult.actor.userId),
      inArray(jobAssignments.status, allowedStatuses.includes("COMPLETED")
        ? ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"]
        : ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
    ))
    .limit(1);
  const canonicalAssignment = canonicalAssignmentRows[0]?.assignment;
  if (row.task.assignedUserId !== actorResult.actor.userId && !canonicalAssignment) {
    return { kind: "FORBIDDEN", reason: "TASK_NOT_ASSIGNED" };
  }
  if (!allowedStatuses.includes(row.task.status)) {
    return { kind: "CONFLICT", reason: "TASK_STATE", status: row.task.status };
  }

  if (row.task.dependsOnTaskCode) {
    const dependency = await db.query.installationTasks.findFirst({
      where: and(
        eq(installationTasks.projectId, row.task.projectId),
        eq(installationTasks.taskCode, row.task.dependsOnTaskCode),
      ),
    });
    const dependencySatisfiedByProjectState = dependency
      ? isOpsProjectDependencySatisfied(row.project.lifecycleState, dependency.taskCode)
      : false;
    if (!dependency || (dependency.status !== "COMPLETED" && !dependencySatisfiedByProjectState)) {
      return { kind: "CONFLICT", reason: "DEPENDENCY_INCOMPLETE", status: row.task.status };
    }
  }

  return {
    kind: "OK",
    access: {
      ...row,
      actor: actorResult.actor,
      fieldVisitId: canonicalAssignment?.visitId || null,
    },
  };
}

export function getPreferredTaskCodesForVisitType(visitType: string): readonly string[] {
  const normalizedVisitType = visitType.toUpperCase();
  if (normalizedVisitType.includes("SURVEY")) return ["SITE_REVIEW"];
  if (normalizedVisitType.includes("GRID") || normalizedVisitType.includes("QC")) {
    return ["QA_COMMISSIONING", "INSTALLATION_EXECUTION"];
  }
  if (normalizedVisitType.includes("WARRANTY") || normalizedVisitType.includes("SERVICE")) {
    return ["HANDOVER", "INSTALLATION_EXECUTION"];
  }
  return ["INSTALLATION_EXECUTION"];
}

export async function getTechnicianVisitTaskAccess(
  visitId: string,
  allowedStatuses: readonly string[],
): Promise<TechnicianTaskAccessResult> {
  const actorResult = await getTechnicianActor();
  if (actorResult.kind !== "OK") return actorResult;

  const visit = await db.query.fieldVisits.findFirst({
    where: eq(fieldVisits.id, visitId),
    columns: { id: true, projectId: true, visitType: true, status: true },
  });
  if (!visit) return { kind: "NOT_FOUND" };
  if (!allowedStatuses.includes("COMPLETED") && ["COMPLETED", "CANCELLED"].includes(visit.status)) {
    return { kind: "CONFLICT", reason: "TASK_STATE", status: visit.status };
  }
  const assignment = await db.query.jobAssignments.findFirst({
    where: and(
      eq(jobAssignments.visitId, visitId),
      eq(jobAssignments.assigneeUserId, actorResult.actor.userId),
      inArray(jobAssignments.status, allowedStatuses.includes("COMPLETED")
        ? ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"]
        : ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
    ),
    orderBy: [asc(jobAssignments.assignedAt)],
  });
  if (!assignment) return { kind: "FORBIDDEN", reason: "TASK_NOT_ASSIGNED" };

  let taskId = assignment.taskId;
  if (!taskId) {
    const preferredTaskCodes = getPreferredTaskCodesForVisitType(visit.visitType);
    const task = await db.query.installationTasks.findFirst({
      where: and(
        eq(installationTasks.projectId, visit.projectId),
        inArray(installationTasks.taskCode, preferredTaskCodes),
        inArray(installationTasks.status, [...allowedStatuses]),
      ),
      orderBy: [asc(installationTasks.sequence)],
      columns: { id: true },
    });
    taskId = task?.id || null;
  }
  if (!taskId) return { kind: "FORBIDDEN", reason: "TASK_NOT_ASSIGNED" };
  return getTechnicianTaskAccess(taskId, allowedStatuses, visit.id);
}

export async function listTechnicianFieldVisits(actor: InstallationActor) {
  const readOnly = canReviewInstallation(actor);
  const rows = await db.select({
    visit: fieldVisits,
    assignment: jobAssignments,
    task: installationTasks,
    project: installationWorkflowProjects,
  })
    .from(fieldVisits)
    .leftJoin(jobAssignments, eq(jobAssignments.visitId, fieldVisits.id))
    .leftJoin(installationTasks, eq(jobAssignments.taskId, installationTasks.id))
    .innerJoin(installationWorkflowProjects, eq(fieldVisits.projectId, installationWorkflowProjects.id))
    .where(readOnly
      ? inArray(fieldVisits.status, ["PLANNED", "CONFIRMED", "IN_PROGRESS"])
      : and(
        eq(jobAssignments.assigneeUserId, actor.userId),
        inArray(jobAssignments.status, ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
        inArray(fieldVisits.status, ["PLANNED", "CONFIRMED", "IN_PROGRESS"]),
      ))
    .orderBy(asc(fieldVisits.scheduledStart), asc(fieldVisits.createdAt));

  const visits = new Map<string, {
    id: string;
    projectId: string;
    projectCode: string;
    visitType: string;
    status: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    timezone: string;
    crewName: string | null;
    assignments: Array<{ id: string; taskId: string | null; assigneeUserId: string; role: string; status: string }>;
  }>();
  for (const row of rows) {
    const visit = visits.get(row.visit.id) || {
      id: row.visit.id,
      projectId: row.visit.projectId,
      projectCode: row.project.projectCode,
      visitType: row.visit.visitType,
      status: row.visit.status,
      scheduledStart: row.visit.scheduledStart?.toISOString() || null,
      scheduledEnd: row.visit.scheduledEnd?.toISOString() || null,
      timezone: row.visit.timezone,
      crewName: row.visit.crewName,
      assignments: [],
    };
    if (row.assignment && !visit.assignments.some((item) => item.id === row.assignment?.id)) {
      visit.assignments.push({
        id: row.assignment.id,
        taskId: row.assignment.taskId,
        assigneeUserId: row.assignment.assigneeUserId,
        role: row.assignment.role,
        status: row.assignment.status,
      });
    }
    visits.set(row.visit.id, visit);
  }
  return { readOnly, visits: [...visits.values()] };
}
