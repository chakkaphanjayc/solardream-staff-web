"use server";

import { db } from "@/db";
import {
  installationWorkflowProjects,
  installationTasks,
  installationChecklistItems,
  proposals,
  users,
} from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { frappeRequest } from "@/lib/erpnext";
import { uploadFileToDrive } from "@/lib/googleDrive";
import { createGoogleCalendarInstallationEvent } from "@/lib/googleCalendar";
import { generateProjectHandoverPdf } from "@/lib/handoverPdfGenerator";
import { broadcastEvent } from "@/lib/sse-publisher";
import { validateUploadFile } from "@/lib/fileValidation";
import type { DeliveryProject, DeliveryTask, SubmitHandoverPayload } from "@/types/delivery";

function getProposalAddress(proposal?: typeof proposals.$inferSelect | null): string {
  if (!proposal?.configurationData || typeof proposal.configurationData !== "object" || Array.isArray(proposal.configurationData)) {
    return "Customer Site Location";
  }
  const config = proposal.configurationData as Record<string, unknown>;
  const address = (typeof config.installationMapAddress === "string" && config.installationMapAddress)
    || (typeof config.location === "string" && config.location)
    || (typeof config.address === "string" && config.address);
  return address || "Customer Site Location";
}

export async function getDeliveryProjectsAndTasksAction(): Promise<{
  success: boolean;
  projects?: DeliveryProject[];
  tasks?: DeliveryTask[];
  error?: string;
}> {
  try {
    const projectRows = await db.query.installationWorkflowProjects.findMany({
      orderBy: [desc(installationWorkflowProjects.createdAt)],
    });

    const proposalIds = projectRows.map((p) => p.proposalId);
    const proposalMap = new Map();
    if (proposalIds.length > 0) {
      const propRows = await db.query.proposals.findMany({
        where: inArray(proposals.id, proposalIds),
        with: { user: true },
      });
      for (const pr of propRows) proposalMap.set(pr.id, pr);
    }

    const projectIds = projectRows.map((p) => p.id);
    const taskRows = projectIds.length > 0
      ? await db.query.installationTasks.findMany({
          where: inArray(installationTasks.projectId, projectIds),
          orderBy: [installationTasks.sequence],
        })
      : [];

    const userIds = taskRows.map((t) => t.assignedUserId).filter(Boolean) as string[];
    const userMap = new Map();
    if (userIds.length > 0) {
      const uRows = await db.query.users.findMany({
        where: inArray(users.id, userIds),
      });
      for (const u of uRows) userMap.set(u.id, u);
    }

    const formattedTasks: DeliveryTask[] = taskRows.map((t) => {
      const proj = projectRows.find((p) => p.id === t.projectId);
      const prop = proj ? proposalMap.get(proj.proposalId) : null;
      const assignee = t.assignedUserId ? userMap.get(t.assignedUserId) : null;

      return {
        id: t.id,
        projectId: t.projectId,
        projectCode: proj?.projectCode || "PRJ",
        erpnextTaskId: t.erpnextTaskId,
        taskCode: t.taskCode,
        title: t.title,
        sequence: t.sequence,
        status: (t.status || "OPEN") as DeliveryTask["status"],
        assignedUserId: t.assignedUserId,
        assignee: assignee ? { id: assignee.id, name: assignee.fullName || assignee.name, email: assignee.email } : null,
        customerName: prop?.user?.fullName || prop?.user?.name || "Customer",
        customerEmail: prop?.user?.email,
        customerPhone: prop?.user?.phoneNumber,
        installationAddress: getProposalAddress(prop),
        systemSizeKwp: prop?.systemSizeKwp || 5.5,
        panelCount: prop?.panelCount || 10,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    const formattedProjects: DeliveryProject[] = projectRows.map((p) => {
      const prop = proposalMap.get(p.proposalId);
      const pTasks = formattedTasks.filter((t) => t.projectId === p.id);

      return {
        id: p.id,
        proposalId: p.proposalId,
        erpnextProjectId: p.erpnextProjectId,
        projectCode: p.projectCode,
        customerName: prop?.user?.fullName || prop?.user?.name || "Customer",
        customerEmail: prop?.user?.email,
        customerPhone: prop?.user?.phoneNumber,
        installationAddress: getProposalAddress(prop),
        systemSizeKwp: prop?.systemSizeKwp || 5.5,
        status: (p.status || "OPEN") as DeliveryProject["status"],
        tasks: pTasks,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    return {
      success: true,
      projects: formattedProjects,
      tasks: formattedTasks,
    };
  } catch (error: unknown) {
    console.error("[getDeliveryProjectsAndTasksAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch delivery projects",
    };
  }
}

export async function assignDeliveryTaskAction(input: {
  taskId: string;
  technicianUserId: string;
  startDate: string;
  endDate: string;
}): Promise<{
  success: boolean;
  eventLink?: string;
  error?: string;
}> {
  try {
    const task = await db.query.installationTasks.findFirst({
      where: eq(installationTasks.id, input.taskId),
    });

    if (!task) return { success: false, error: "Task not found" };

    const project = await db.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.id, task.projectId),
    });

    if (!project) return { success: false, error: "Project not found" };

    const techUser = await db.query.users.findFirst({
      where: eq(users.id, input.technicianUserId),
    });

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, project.proposalId),
      with: { user: true },
    });

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // 1. Create Google Calendar Multi-day Event Sync
    const gcalResult = await createGoogleCalendarInstallationEvent({
      taskId: task.id,
      taskTitle: task.title,
      customerName: proposal?.user?.fullName || proposal?.user?.name || "Customer",
      customerEmail: proposal?.user?.email,
      technicianEmail: techUser?.email,
      installationAddress: getProposalAddress(proposal),
      scheduledStartDate: startDate,
      scheduledEndDate: endDate,
      systemSizeKwp: proposal?.systemSizeKwp,
      workOrderUrl: `/th/tech/work-orders/${task.id}`,
    });

    // 2. Update Local Task Record
    await db
      .update(installationTasks)
      .set({
        assignedUserId: input.technicianUserId,
        status: "SCHEDULED",
        updatedAt: new Date(),
      })
      .where(eq(installationTasks.id, input.taskId));

    // Existing legacy projects may already have an ERPNext Task. New local-
    // first projects intentionally remain usable before that projection exists.
    if (task.erpnextTaskId) {
      try {
        await frappeRequest("PUT", `/api/resource/Task/${encodeURIComponent(task.erpnextTaskId)}`, {
          exp_start_date: startDate.toISOString().split("T")[0],
          exp_end_date: endDate.toISOString().split("T")[0],
          status: "Working",
        });
      } catch (erpError) {
        console.warn("[assignDeliveryTaskAction] ERPNext task update warning:", erpError);
      }
    }

    revalidatePath("/admin/delivery");
    revalidatePath("/th/admin/delivery");

    return {
      success: true,
      eventLink: gcalResult.eventLink,
    };
  } catch (error: unknown) {
    console.error("[assignDeliveryTaskAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign task",
    };
  }
}

export async function uploadQcEvidenceToDriveAction(
  formData: FormData
): Promise<{
  success: boolean;
  fileUrl?: string;
  driveUrl?: string;
  error?: string;
}> {
  try {
    const taskId = formData.get("taskId") as string;
    const category = (formData.get("category") as string) || "GENERAL";
    const file = formData.get("file") as File;

    if (!taskId || !file) {
      return { success: false, error: "Task ID and file are required" };
    }

    const task = await db.query.installationTasks.findFirst({
      where: eq(installationTasks.id, taskId),
    });

    if (!task) return { success: false, error: "Task not found" };

    const project = await db.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.id, task.projectId),
    });

    if (!project) return { success: false, error: "Project not found" };

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: ["jpeg", "png", "webp", "heic"],
      fallbackName: file.name,
      maxBytes: 10 * 1024 * 1024,
    });

    const googleFilename = `QC_${category}_${task.taskCode}_${Date.now()}.${validatedFile.extension}`;
    const targetFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "root";

    // Upload directly to Google Drive Customer Project Folder using uploadFileToDrive
    const driveFileId = await uploadFileToDrive(
      targetFolderId,
      fileBuffer,
      validatedFile.contentType,
      googleFilename
    );

    const fileUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

    // Attach Comment / Drive Link to ERPNext Task Doctype
    if (task.erpnextTaskId) {
      try {
        await frappeRequest("POST", "/api/resource/Comment", {
          comment_type: "Comment",
          reference_doctype: "Task",
          reference_name: task.erpnextTaskId,
          content: `[QC Photo Uploaded - ${category}]\nFile: ${googleFilename}\nDrive Link: ${fileUrl}`,
        });
      } catch (erpErr) {
        console.warn("[uploadQcEvidenceToDriveAction] ERPNext comment attachment warning:", erpErr);
      }
    }

    return {
      success: true,
      fileUrl,
      driveUrl: fileUrl,
    };
  } catch (error: unknown) {
    console.error("[uploadQcEvidenceToDriveAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload QC photo",
    };
  }
}

export async function submitTaskHandoverAction(
  payload: SubmitHandoverPayload
): Promise<{
  success: boolean;
  pdfUrl?: string;
  error?: string;
}> {
  try {
    const task = await db.query.installationTasks.findFirst({
      where: eq(installationTasks.id, payload.taskId),
    });

    if (!task) return { success: false, error: "Task not found" };

    const project = await db.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.id, task.projectId),
    });

    if (!project) return { success: false, error: "Project not found" };

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, project.proposalId),
      with: { user: true },
    });

    // 1. Generate Handover PDF Certificate with Embedded E-Signature
    const pdfResult = await generateProjectHandoverPdf({
      projectCode: project.projectCode,
      taskTitle: task.title,
      customerName: proposal?.user?.fullName || proposal?.user?.name || "Customer",
      customerPhone: proposal?.user?.phoneNumber,
      installationAddress: getProposalAddress(proposal),
      systemSizeKwp: proposal?.systemSizeKwp,
      panelCount: proposal?.panelCount,
      completedAt: new Date(),
      customerSignatureBase64: payload.customerSignatureBase64,
      qcVerifiedItems: payload.verifiedItems,
    });

    // 2. Upload Handover PDF to Google Drive
    const targetFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "root";
    const driveFileId = await uploadFileToDrive(
      targetFolderId,
      pdfResult.pdfBuffer,
      "application/pdf",
      pdfResult.filename
    );

    const pdfDriveUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

    // 3. Complete ERPNext Task Doctype
    if (task.erpnextTaskId) {
      try {
        await frappeRequest("PUT", `/api/resource/Task/${encodeURIComponent(task.erpnextTaskId)}`, {
          status: "Completed",
          progress: 100,
        });

        await frappeRequest("POST", "/api/resource/Comment", {
          comment_type: "Comment",
          reference_doctype: "Task",
          reference_name: task.erpnextTaskId,
          content: `[Project Handover Completed]\nCertificate: ${pdfResult.filename}\nSHA256: ${pdfResult.sha256Hash}\nDrive PDF: ${pdfDriveUrl}`,
        });
      } catch (erpErr) {
        console.warn("[submitTaskHandoverAction] ERPNext completion sync warning:", erpErr);
      }
    }

    // 4. Update Local Database Status
    await db
      .update(installationTasks)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(installationTasks.id, task.id));

    // 5. Broadcast SSE Real-time Notification to Admin
    await broadcastEvent("PROJECT_STATUS_CHANGED", {
      id: task.id,
      title: `[Handover Completed] Task ${task.taskCode} for Project ${project.projectCode}`,
      status: "COMPLETED",
    });

    revalidatePath("/admin/delivery");
    revalidatePath(`/tech/work-orders/${task.id}`);

    return {
      success: true,
      pdfUrl: pdfDriveUrl,
    };
  } catch (error: unknown) {
    console.error("[submitTaskHandoverAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit handover",
    };
  }
}
