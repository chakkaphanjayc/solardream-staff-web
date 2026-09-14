import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { installationTasks, installationWorkflowProjects, users } from "@/db/schema";
import { createClient } from "@/utils/supabase/server";
import { isOpsProjectDependencySatisfied } from "@/lib/opsV2State";

const REVIEW_ROLES = new Set(["STAFF", "MANAGER", "ADMIN", "SUPER_ADMIN"]);

export type InstallationActor = { userId: string; role: typeof users.$inferSelect["role"] };

export async function getInstallationActor(): Promise<InstallationActor | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const row = await db.query.users.findFirst({ where: and(eq(users.id, user.id), eq(users.isActive, true)), columns: { id: true, role: true } });
  return row ? { userId: row.id, role: row.role } : null;
}

export function canReviewInstallation(actor: InstallationActor) {
  return REVIEW_ROLES.has(actor.role);
}

export async function resolveInstallationProjectActor(proposalId: string) {
  const actor = await getInstallationActor();
  if (!actor) return null;
  const project = await db.query.installationWorkflowProjects.findFirst({
    where: eq(installationWorkflowProjects.proposalId, proposalId),
  });
  if (!project) return null;
  if (canReviewInstallation(actor)) return { actor, project, mode: "REVIEWER" as const };
  if (actor.role !== "INSTALLER") return null;
  const assignedTask = await db.query.installationTasks.findFirst({
    where: and(eq(installationTasks.projectId, project.id), eq(installationTasks.assignedUserId, actor.userId)),
  });
  return assignedTask ? { actor, project, mode: "INSTALLER" as const } : null;
}

export async function requireTaskMutationAccess(taskId: string) {
  const actor = await getInstallationActor();
  if (!actor) return null;
  const rows = await db.select({ task: installationTasks, proposalId: installationWorkflowProjects.proposalId, lifecycleState: installationWorkflowProjects.lifecycleState })
    .from(installationTasks).innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
    .where(eq(installationTasks.id, taskId)).limit(1);
  const context = rows[0];
  if (!context) return null;
  if (actor.role !== "INSTALLER" || context.task.assignedUserId !== actor.userId || context.task.status !== "OPEN") return null;
  if (context.task.dependsOnTaskCode) {
    const dependency = await db.query.installationTasks.findFirst({
      where: and(
        eq(installationTasks.projectId, context.task.projectId),
        eq(installationTasks.taskCode, context.task.dependsOnTaskCode),
      ),
    });
    const dependencySatisfiedByProjectState = dependency
      ? isOpsProjectDependencySatisfied(context.lifecycleState, dependency.taskCode)
      : false;
    if (!dependency || (dependency.status !== "COMPLETED" && !dependencySatisfiedByProjectState)) return null;
  }
  return { actor, ...context };
}

export async function requireTaskReviewAccess(taskId: string) {
  const actor = await getInstallationActor();
  if (!actor || !canReviewInstallation(actor)) return null;
  const rows = await db.select({ task: installationTasks, proposalId: installationWorkflowProjects.proposalId })
    .from(installationTasks).innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
    .where(eq(installationTasks.id, taskId)).limit(1);
  return rows[0] ? { actor, ...rows[0] } : null;
}

export function requestIdempotencyKey(request: NextRequest, fallback?: string) {
  return request.headers.get("idempotency-key")?.trim() || fallback || "";
}
