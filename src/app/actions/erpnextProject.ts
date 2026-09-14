"use server";

import { db } from "@/db";
import {
  installationChecklistItems,
  installationTasks,
  installationWorkflowProjects,
  proposals,
} from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { buildErpnextBomItems, segmentBomItems } from "@/lib/erpnextBom";
import { requireStaff } from "@/lib/auth-guard";
import { INSTALLATION_FIELD_STAGES } from "@/types/techPortal";
import { asc, eq } from "drizzle-orm";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function buildLocalExecutionTask(projectCode: string) {
  return {
    taskCode: `${projectCode}:INSTALLATION_EXECUTION`,
    title: "Solar installation execution",
    sequence: 1,
    dependsOnTaskCode: null,
    checklist: INSTALLATION_FIELD_STAGES.map((stage) => ({
      itemCode: stage.itemCode,
      label: `${stage.title} (${stage.titleTh})`,
      sequence: stage.sequence,
      evidenceRequired: stage.evidenceRequired,
    })),
  };
}

/**
 * Creates the local field project first. ERPNext receives a projection event
 * after this transaction, so field operations do not depend on ERPNext uptime.
 */
export async function generateErpnextProjectForProposal(proposalId: string) {
  try {
    await requireStaff();

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
      with: { user: true },
    });

    if (!proposal) return { success: false, error: "Proposal not found." };
    if (!["VERIFIED_IN_PROGRESS", "SIGNED", "FULLY_SIGNED", "PAID"].includes(proposal.status.toUpperCase())) {
      return {
        success: false,
        error: `Proposal must be approved before the Field Project can be created. Current status: ${proposal.status}`,
      };
    }

    const config = asRecord(proposal.configurationData);
    const bomItems = buildErpnextBomItems(config);
    const segmented = segmentBomItems(bomItems);
    const projectCode = `SD-${proposal.id}`;
    const projectTitle = `SolarDream ${proposal.systemSizeKwp}kWp - ${proposal.user?.name || proposal.user?.email || "Unknown User"}`;
    const executionTask = buildLocalExecutionTask(projectCode);

    const result = await db.transaction(async (tx) => {
      let localProject = await tx.query.installationWorkflowProjects.findFirst({
        where: eq(installationWorkflowProjects.proposalId, proposal.id),
      });

      // Never silently convert a running version 1 project. Historical jobs
      // retain their four-phase contract; new projects use version 2.
      if (localProject && localProject.sourceVersion < 2) {
        return {
          project: localProject,
          tasks: await tx.query.installationTasks.findMany({
            where: eq(installationTasks.projectId, localProject.id),
            orderBy: [asc(installationTasks.sequence)],
          }),
          reusedLegacy: true,
        };
      }

      if (!localProject) {
        const [createdProject] = await tx.insert(installationWorkflowProjects).values({
          proposalId: proposal.id,
          projectCode,
          sourceVersion: 2,
          status: "OPEN",
          erpnextSyncStatus: "PENDING",
          permitStatus: "NOT_STARTED",
        }).returning();
        if (!createdProject) throw new Error("The local installation project could not be created.");
        localProject = createdProject;
      }

      const [task] = await tx.insert(installationTasks).values({
        projectId: localProject.id,
        taskCode: executionTask.taskCode,
        title: executionTask.title,
        sequence: executionTask.sequence,
        dependsOnTaskCode: executionTask.dependsOnTaskCode,
        status: "OPEN",
        erpnextSyncStatus: "PENDING",
      }).onConflictDoUpdate({
        target: [installationTasks.projectId, installationTasks.taskCode],
        set: {
          title: executionTask.title,
          sequence: executionTask.sequence,
          dependsOnTaskCode: executionTask.dependsOnTaskCode,
          updatedAt: new Date(),
        },
      }).returning();
      if (!task) throw new Error(`The local installation task ${executionTask.taskCode} could not be created.`);

      for (const checklist of executionTask.checklist) {
        const [checklistItem] = await tx.insert(installationChecklistItems).values({
          taskId: task.id,
          itemCode: checklist.itemCode,
          label: checklist.label,
          sequence: checklist.sequence,
          required: true,
          evidenceRequired: checklist.evidenceRequired,
          allowsNa: false,
          status: "OPEN",
        }).onConflictDoUpdate({
          target: [installationChecklistItems.taskId, installationChecklistItems.itemCode],
          set: {
            label: checklist.label,
            sequence: checklist.sequence,
            evidenceRequired: checklist.evidenceRequired,
          },
        }).returning();
        if (!checklistItem) throw new Error(`The checklist for ${executionTask.taskCode} could not be created.`);
      }
      const localTasks = [task];

      await enqueueIntegrationEvent(tx, {
        topic: "installation.project.requested",
        aggregateType: "INSTALLATION_PROJECT",
        aggregateId: proposal.id,
        payload: {
          localProjectId: localProject.id,
          proposalId: proposal.id,
          projectCode,
          projectTitle,
          sourceVersion: 2,
          materialItemCount: segmented.materials.length,
          operationItemCount: segmented.operations.length,
          stageCodes: INSTALLATION_FIELD_STAGES.map((stage) => stage.code),
        },
        dedupeKey: `installation.project.requested:${proposal.id}:v2`,
      });

      await tx.update(proposals).set({
        configurationData: {
          ...config,
          erpProjectSync: {
            status: "LOCAL_READY",
            localProjectId: localProject.id,
            erpnextProjectId: localProject.erpnextProjectId,
            materialItemCount: segmented.materials.length,
            operationItemCount: segmented.operations.length,
            stageCodes: INSTALLATION_FIELD_STAGES.map((stage) => stage.code),
            updatedAt: new Date().toISOString(),
          },
        },
      }).where(eq(proposals.id, proposal.id));

      return { project: localProject, tasks: localTasks, reusedLegacy: false };
    });

    return {
      success: true,
      projectId: result.project.id,
      erpnextProjectId: result.project.erpnextProjectId,
      taskIds: result.tasks.map((task) => task.id),
      erpnextTaskIds: result.tasks.map((task) => task.erpnextTaskId).filter((id): id is string => Boolean(id)),
      syncStatus: result.project.erpnextSyncStatus,
      workflowVersion: result.project.sourceVersion,
      reusedLegacy: result.reusedLegacy,
    };
  } catch (error: unknown) {
    console.error("[Local Installation Project Factory]:", error);
    return { success: false, error: "Failed to create the local installation project." };
  }
}
