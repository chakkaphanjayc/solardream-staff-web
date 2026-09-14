"use server";

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ensureUserExists } from "@/app/actions/auth";
import { db } from "@/db";
import {
  activityLogs,
  formSubmissions,
  installationJobTickets,
  jobWorkflows,
  userNotifications,
  users,
  workflowStages,
  workflowTemplates,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import {
  jobTypes,
  workflowFieldTypes,
  type JobType,
  type WorkflowFormField,
  type WorkflowStageInput,
} from "@/lib/workflow-types";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";
import { createAdminClient, createClient } from "@/utils/supabase/server";
import type { LocalizedContent } from "@/lib/localization/content";
import { getLocalizedValue } from "@/lib/localization/content";
import type { Locale } from "@/i18n/locales";

const MAX_WORKFLOW_EVIDENCE_BYTES = 12 * 1024 * 1024;
const WORKFLOW_PHOTO_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic"];
const WORKFLOW_SIGNATURE_FILE_KINDS: readonly UploadFileKind[] = ["png"];

const formFieldSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  type: z.enum(workflowFieldTypes),
  isRequired: z.boolean(),
});

const workflowStageSchema = z.object({
  id: z.string().uuid().optional(),
  stageName: z.string().trim().min(1).max(200),
  isMandatory: z.boolean(),
  formSchema: z.array(formFieldSchema).max(100),
});

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  targetJobType: z.enum(jobTypes).default("INSTALLATION"),
  isActive: z.boolean().default(true),
});

const templateTranslationsSchema = z.record(
  z.enum(["en", "th"]),
  z.object({
    name: z.string().trim().max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  }),
);

const stageTranslationsSchema = z.record(
  z.enum(["en", "th"]),
  z.object({ stageName: z.string().trim().max(200).optional() }),
);

function parseFormSchema(value: unknown): WorkflowFormField[] {
  const parsed = z.array(formFieldSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

async function getAuthenticatedInstaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const dbUser = await ensureUserExists(user);
  if (!dbUser) {
    throw new Error("Installer profile not found.");
  }

  return dbUser;
}

function localizeWorkflowTemplate<T extends {
  name: string;
  description: string | null;
  translations: LocalizedContent<{ name: string; description: string | null }>;
  stages: Array<{
    stageName: string;
    translations: LocalizedContent<{ stageName: string }>;
  }>;
}>(template: T, locale: Locale, fallbackLocale: Locale): T {
  return {
    ...template,
    name: getLocalizedValue(template.translations, locale, "name", template.name, fallbackLocale),
    description: getLocalizedValue(template.translations, locale, "description", template.description, fallbackLocale),
    stages: template.stages.map((stage) => ({
      ...stage,
      stageName: getLocalizedValue(stage.translations, locale, "stageName", stage.stageName, fallbackLocale),
    })),
  };
}

export async function getWorkflowTemplates(locale?: Locale) {
  await requireStaff();

  const templates = await db.query.workflowTemplates.findMany({
    with: {
      stages: {
        orderBy: [asc(workflowStages.stepOrder)],
      },
    },
    orderBy: [desc(workflowTemplates.createdAt)],
  });
  if (!locale) return templates;
  const { getLocalizationConfig } = await import("@/app/actions/systemSettings");
  const { defaultLocale: fallbackLocale } = await getLocalizationConfig();
  return templates.map((template) => localizeWorkflowTemplate(template, locale, fallbackLocale));
}

export async function saveWorkflowTemplate(input: {
  id?: string;
  name: string;
  description?: string | null;
  targetJobType: JobType;
  isActive?: boolean;
  translations?: LocalizedContent<{ name: string; description: string | null }>;
}) {
  await requireStaff();

  try {
    const parsed = templateSchema.parse(input);
    const translations = templateTranslationsSchema.parse(input.translations ?? {});

    const template = await db.transaction(async (tx) => {
      if (parsed.isActive) {
        const activeConditions = [
          eq(workflowTemplates.targetJobType, parsed.targetJobType),
          eq(workflowTemplates.isActive, true),
        ];
        if (parsed.id) {
          activeConditions.push(ne(workflowTemplates.id, parsed.id));
        }
        await tx
          .update(workflowTemplates)
          .set({ isActive: false })
          .where(and(...activeConditions));
      }

      if (parsed.id) {
        const [updated] = await tx
          .update(workflowTemplates)
          .set({
            name: parsed.name,
            description: parsed.description || null,
            targetJobType: parsed.targetJobType,
            isActive: parsed.isActive,
            translations,
          })
          .where(eq(workflowTemplates.id, parsed.id))
          .returning();
        if (!updated) throw new Error("Workflow template not found.");
        return updated;
      }

      const [created] = await tx
        .insert(workflowTemplates)
        .values({
          name: parsed.name,
          description: parsed.description || null,
          targetJobType: parsed.targetJobType,
          isActive: parsed.isActive,
          translations,
        })
        .returning();
      if (!created) throw new Error("Workflow template could not be created.");
      return created;
    });

    revalidatePath("/admin/workflows/builder");
    return { success: true, template };
  } catch (error) {
    console.error("Failed to save workflow template:", error);
    return {
      success: false,
      error: "Failed to save workflow template.",
    };
  }
}

export async function updateWorkflowStages(
  templateId: string,
  stagesArray: (WorkflowStageInput & {
    translations?: LocalizedContent<{ stageName: string }>;
  })[],
) {
  await requireStaff();

  try {
    const templateIdValue = z.string().uuid().parse(templateId);
    const stages = z.array(workflowStageSchema).max(100).parse(stagesArray);

    await db.transaction(async (tx) => {
      const template = await tx.query.workflowTemplates.findFirst({
        where: eq(workflowTemplates.id, templateIdValue),
      });
      if (!template) throw new Error("Workflow template not found.");

      const existing = await tx.query.workflowStages.findMany({
        where: eq(workflowStages.templateId, templateIdValue),
      });
      const existingIds = new Set(existing.map((stage) => stage.id));
      const retainedIds: string[] = [];

      for (const [index, stage] of stages.entries()) {
        const translations = stageTranslationsSchema.parse(stagesArray[index]?.translations ?? {});
        if (stage.id && existingIds.has(stage.id)) {
          retainedIds.push(stage.id);
          const [updated] = await tx
            .update(workflowStages)
            .set({
              stageName: stage.stageName,
              stepOrder: index + 1,
              isMandatory: stage.isMandatory,
              formSchema: stage.formSchema,
              translations,
            })
            .where(
              and(
                eq(workflowStages.id, stage.id),
                eq(workflowStages.templateId, templateIdValue),
              ),
            )
            .returning({ id: workflowStages.id });
          if (!updated) throw new Error("Workflow stage not found.");
        } else {
          const [created] = await tx
            .insert(workflowStages)
            .values({
              templateId: templateIdValue,
              stageName: stage.stageName,
              stepOrder: index + 1,
              isMandatory: stage.isMandatory,
              formSchema: stage.formSchema,
              translations,
            })
            .returning({ id: workflowStages.id });
          if (!created) throw new Error("Workflow stage could not be created.");
          retainedIds.push(created.id);
        }
      }

      const removedIds = existing
        .map((stage) => stage.id)
        .filter((id) => !retainedIds.includes(id));

      if (removedIds.length > 0) {
        const referencedWorkflow = await tx.query.jobWorkflows.findFirst({
          where: inArray(jobWorkflows.currentStageId, removedIds),
        });
        const referencedSubmission = await tx.query.formSubmissions.findFirst({
          where: inArray(formSubmissions.stageId, removedIds),
        });

        if (referencedWorkflow || referencedSubmission) {
          throw new Error(
            "A stage with execution history cannot be deleted. Disable the template and create a new version instead.",
          );
        }

        await tx.delete(workflowStages).where(inArray(workflowStages.id, removedIds));
      }
    });

    revalidatePath("/admin/workflows/builder");
    return { success: true };
  } catch (error) {
    console.error("Failed to update workflow stages:", error);
    return {
      success: false,
      error: "Failed to update workflow stages.",
    };
  }
}

export async function getInstallerWorkflow(jobTicketId: string) {
  const installer = await getAuthenticatedInstaller();
  const jobId = z.string().uuid().parse(jobTicketId);

  const ticket = await db.query.installationJobTickets.findFirst({
    where: eq(installationJobTickets.id, jobId),
    with: {
      quotation: {
        with: {
          user: true,
        },
      },
      workflows: {
        with: {
          template: {
            with: {
              stages: {
                orderBy: [asc(workflowStages.stepOrder)],
              },
            },
          },
          currentStage: true,
          formSubmissions: {
            orderBy: [desc(formSubmissions.submittedAt)],
          },
        },
        orderBy: [desc(jobWorkflows.startedAt)],
        limit: 1,
      },
    },
  });

  if (!ticket) throw new Error("Job ticket not found.");
  if (ticket.installerId !== installer.id && !["ADMIN", "STAFF"].includes(installer.role)) {
    throw new Error("This job is not assigned to your account.");
  }

  return ticket;
}

export async function submitStageForm(
  jobWorkflowId: string,
  stageId: string,
  formData: Record<string, unknown>,
  gpsLocation: string,
) {
  try {
    const installer = await getAuthenticatedInstaller();
    const workflowId = z.string().uuid().parse(jobWorkflowId);
    const stageIdValue = z.string().uuid().parse(stageId);
    const location = z.string().trim().min(3).max(200).parse(gpsLocation);
    const submittedData = z.record(z.string(), z.unknown()).parse(formData);

    const result = await db.transaction(async (tx) => {
      const workflow = await tx.query.jobWorkflows.findFirst({
        where: eq(jobWorkflows.id, workflowId),
        with: {
          jobTicket: true,
          template: {
            with: {
              stages: {
                orderBy: [asc(workflowStages.stepOrder)],
              },
            },
          },
        },
      });

      if (!workflow) throw new Error("Workflow not found.");
      if (
        workflow.jobTicket.installerId !== installer.id &&
        !["ADMIN", "STAFF"].includes(installer.role)
      ) {
        throw new Error("This job is not assigned to your account.");
      }
      if (workflow.status === "COMPLETED") throw new Error("This workflow is already complete.");
      if (workflow.currentStageId !== stageIdValue) {
        throw new Error("Only the current stage can be submitted.");
      }

      const stageIndex = workflow.template.stages.findIndex(
        (stage) => stage.id === stageIdValue,
      );
      if (stageIndex < 0) throw new Error("Stage does not belong to this workflow.");

      const stage = workflow.template.stages[stageIndex];
      const fields = parseFormSchema(stage.formSchema);
      for (const field of fields.filter((item) => item.isRequired)) {
        const value = submittedData[field.id];
        const isMissing =
          value === undefined ||
          value === null ||
          value === "" ||
          (field.type === "CHECKBOX" && value !== true);
        if (isMissing) throw new Error(`Complete required field: ${field.label}`);
      }

      const [submission] = await tx
        .insert(formSubmissions)
        .values({
          jobWorkflowId: workflowId,
          stageId: stageIdValue,
          submittedBy: installer.id,
          formData: submittedData,
          gpsLocation: location,
        })
        .returning();

      const nextStage = workflow.template.stages[stageIndex + 1];
      if (nextStage) {
        await tx
          .update(jobWorkflows)
          .set({ currentStageId: nextStage.id, status: "IN_PROGRESS", completedAt: null })
          .where(eq(jobWorkflows.id, workflowId));
      } else {
        await tx
          .update(jobWorkflows)
          .set({ currentStageId: null, status: "COMPLETED", completedAt: new Date() })
          .where(eq(jobWorkflows.id, workflowId));
        await tx
          .update(installationJobTickets)
          .set({ status: "COMPLETED" })
          .where(eq(installationJobTickets.id, workflow.jobTicketId));
      }

      await tx.insert(activityLogs).values({
        entityId: workflow.jobTicketId,
        entityType: "JOB_TICKET",
        action: "WORKFLOW_STAGE_SUBMITTED",
        description: `${installer.name || installer.email || "Installer"} submitted stage: ${stage.stageName}.`,
        userId: installer.id,
      });

      return {
        submission,
        completed: !nextStage,
        jobTicketId: workflow.jobTicketId,
      };
    });

    revalidatePath("/installer");
    revalidatePath(`/installer/jobs/${result.jobTicketId}/execute`);
    revalidatePath("/admin/job-tickets");
    return { success: true, ...result };
  } catch (error) {
    console.error("Failed to submit workflow stage:", error);
    return {
      success: false,
      error: "Failed to submit workflow stage.",
    };
  }
}

export async function uploadWorkflowEvidence(
  jobWorkflowId: string,
  stageId: string,
  fieldId: string,
  evidenceType: "photo" | "signature",
  formData: FormData,
) {
  try {
    const installer = await getAuthenticatedInstaller();
    const workflowId = z.string().uuid().parse(jobWorkflowId);
    const stageIdValue = z.string().uuid().parse(stageId);
    const fieldIdValue = z.string().trim().min(1).max(120).parse(fieldId);
    const normalizedEvidenceType = z.enum(["photo", "signature"]).parse(evidenceType);
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return { success: false, error: "Evidence file is required." };
    }

    const workflow = await db.query.jobWorkflows.findFirst({
      where: eq(jobWorkflows.id, workflowId),
      with: {
        jobTicket: true,
        currentStage: true,
      },
    });

    if (!workflow) {
      return { success: false, error: "Workflow not found." };
    }

    if (
      workflow.jobTicket.installerId !== installer.id &&
      !["ADMIN", "STAFF"].includes(installer.role)
    ) {
      return { success: false, error: "This job is not assigned to your account." };
    }

    if (workflow.status === "COMPLETED") {
      return { success: false, error: "This workflow is already complete." };
    }

    if (workflow.currentStageId !== stageIdValue || workflow.currentStage?.id !== stageIdValue) {
      return { success: false, error: "Evidence can only be uploaded for the current stage." };
    }

    const currentStageFields = parseFormSchema(workflow.currentStage.formSchema);
    const field = currentStageFields.find((item) => item.id === fieldIdValue);
    if (!field) {
      return { success: false, error: "Workflow field not found on current stage." };
    }

    const expectedFieldType = normalizedEvidenceType === "photo" ? "PHOTO_UPLOAD" : "SIGNATURE";
    if (field.type !== expectedFieldType) {
      return { success: false, error: "Evidence type does not match the workflow field." };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: normalizedEvidenceType === "photo"
        ? WORKFLOW_PHOTO_FILE_KINDS
        : WORKFLOW_SIGNATURE_FILE_KINDS,
      fallbackName: normalizedEvidenceType === "photo" ? "workflow-photo" : "workflow-signature",
      maxBytes: MAX_WORKFLOW_EVIDENCE_BYTES,
    });

    const storagePath = [
      "workflow-evidence",
      workflow.jobTicketId,
      workflow.id,
      `${fieldIdValue}-${crypto.randomUUID()}.${validatedFile.extension}`,
    ].join("/");

    const supabaseAdmin = createAdminClient();
    const upload = await supabaseAdmin.storage
      .from("proposals")
      .upload(storagePath, file, {
        contentType: validatedFile.contentType,
        cacheControl: "3600",
        upsert: true,
      });

    if (upload.error) {
      console.error("Failed to upload workflow evidence to storage:", upload.error);
      return { success: false, error: "Failed to upload workflow evidence." };
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("proposals")
      .getPublicUrl(storagePath);

    await db.insert(activityLogs).values({
      entityId: workflow.jobTicketId,
      entityType: "JOB_TICKET",
      action: normalizedEvidenceType === "photo"
        ? "WORKFLOW_PHOTO_UPLOADED"
        : "WORKFLOW_SIGNATURE_UPLOADED",
      description: `${installer.name || installer.email || "Installer"} uploaded evidence for ${field.label}.`,
      userId: installer.id,
    });

    revalidatePath("/installer");
    revalidatePath(`/installer/jobs/${workflow.jobTicketId}/execute`);

    return {
      success: true,
      url: publicUrl,
      storagePath,
    };
  } catch (error) {
    console.error("Failed to upload workflow evidence:", error);
    return {
      success: false,
      error: "Failed to upload workflow evidence.",
    };
  }
}

export async function skipWorkflowStage(
  jobWorkflowId: string,
  stageId: string,
  reason: string,
  gpsLocation?: string,
) {
  try {
    const installer = await getAuthenticatedInstaller();
    const workflowId = z.string().uuid().parse(jobWorkflowId);
    const stageIdValue = z.string().uuid().parse(stageId);
    const skipReason = z.string().trim().min(5).max(1000).parse(reason);
    const location = gpsLocation
      ? z.string().trim().min(3).max(200).parse(gpsLocation)
      : null;

    const result = await db.transaction(async (tx) => {
      const workflow = await tx.query.jobWorkflows.findFirst({
        where: eq(jobWorkflows.id, workflowId),
        with: {
          jobTicket: true,
          template: {
            with: {
              stages: {
                orderBy: [asc(workflowStages.stepOrder)],
              },
            },
          },
        },
      });

      if (!workflow) throw new Error("Workflow not found.");
      if (
        workflow.jobTicket.installerId !== installer.id &&
        !["ADMIN", "STAFF"].includes(installer.role)
      ) {
        throw new Error("This job is not assigned to your account.");
      }
      if (workflow.status === "COMPLETED") throw new Error("This workflow is already complete.");
      if (workflow.currentStageId !== stageIdValue) {
        throw new Error("Only the current stage can be skipped.");
      }

      const stageIndex = workflow.template.stages.findIndex(
        (stage) => stage.id === stageIdValue,
      );
      if (stageIndex < 0) throw new Error("Stage does not belong to this workflow.");

      const stage = workflow.template.stages[stageIndex];
      const [submission] = await tx
        .insert(formSubmissions)
        .values({
          jobWorkflowId: workflowId,
          stageId: stageIdValue,
          submittedBy: installer.id,
          formData: {},
          gpsLocation: location,
          isSkipped: true,
          skipReason,
        })
        .returning();

      const nextStage = workflow.template.stages[stageIndex + 1];
      if (nextStage) {
        await tx
          .update(jobWorkflows)
          .set({ currentStageId: nextStage.id, status: "IN_PROGRESS", completedAt: null })
          .where(eq(jobWorkflows.id, workflowId));
      } else {
        await tx
          .update(jobWorkflows)
          .set({ currentStageId: null, status: "COMPLETED", completedAt: new Date() })
          .where(eq(jobWorkflows.id, workflowId));
        await tx
          .update(installationJobTickets)
          .set({ status: "COMPLETED" })
          .where(eq(installationJobTickets.id, workflow.jobTicketId));
      }

      await tx.insert(activityLogs).values({
        entityId: workflow.jobTicketId,
        entityType: "JOB_TICKET",
        action: "WORKFLOW_STAGE_SKIPPED",
        description: `${installer.name || installer.email || "Installer"} skipped stage: ${stage.stageName}. Reason: ${skipReason}`,
        userId: installer.id,
      });

      return {
        submission,
        completed: !nextStage,
        jobTicketId: workflow.jobTicketId,
      };
    });

    revalidatePath("/installer");
    revalidatePath(`/installer/jobs/${result.jobTicketId}/execute`);
    revalidatePath(`/admin/projects/${result.jobTicketId}/audit`);
    return { success: true, ...result };
  } catch (error) {
    console.error("Failed to skip workflow stage:", error);
    return {
      success: false,
      error: "Failed to skip workflow stage.",
    };
  }
}

export async function getWorkflowAudit(jobTicketId: string) {
  await requireStaff();
  const jobId = z.string().uuid().parse(jobTicketId);

  return db.query.installationJobTickets.findFirst({
    where: eq(installationJobTickets.id, jobId),
    with: {
      quotation: {
        with: {
          user: true,
        },
      },
      workflows: {
        with: {
          template: {
            with: {
              stages: {
                orderBy: [asc(workflowStages.stepOrder)],
              },
            },
          },
          currentStage: true,
          formSubmissions: {
            with: {
              submitter: true,
              reviewer: true,
              stage: true,
            },
            orderBy: [desc(formSubmissions.submittedAt)],
          },
        },
        orderBy: [desc(jobWorkflows.startedAt)],
      },
    },
  });
}

export async function reviewStageSubmission(
  submissionId: string,
  decision: "APPROVED" | "REJECTED",
  rejectionReason?: string,
) {
  try {
    const actor = await requireStaff();
    const submissionIdValue = z.string().uuid().parse(submissionId);
    const reason =
      decision === "REJECTED"
        ? z.string().trim().min(3).max(1000).parse(rejectionReason)
        : null;

    const result = await db.transaction(async (tx) => {
      const submission = await tx.query.formSubmissions.findFirst({
        where: eq(formSubmissions.id, submissionIdValue),
        with: {
          stage: true,
          jobWorkflow: {
            with: {
              jobTicket: true,
            },
          },
        },
      });
      if (!submission) throw new Error("Submission not found.");

      await tx
        .update(formSubmissions)
        .set({
          reviewStatus: decision,
          reviewedBy: actor.id,
          reviewedAt: new Date(),
          rejectionReason: reason,
        })
        .where(eq(formSubmissions.id, submissionIdValue));

      if (decision === "REJECTED") {
        await tx
          .update(jobWorkflows)
          .set({
            currentStageId: submission.stageId,
            status: "IN_PROGRESS",
            completedAt: null,
          })
          .where(eq(jobWorkflows.id, submission.jobWorkflowId));
        await tx
          .update(installationJobTickets)
          .set({ status: "IN_PROGRESS" })
          .where(eq(installationJobTickets.id, submission.jobWorkflow.jobTicketId));

        if (submission.jobWorkflow.jobTicket.installerId) {
          await tx.insert(userNotifications).values({
            userId: submission.jobWorkflow.jobTicket.installerId,
            featureKey: "WORKFLOW_REVIEW",
            title: "Workflow stage requires correction",
            message: `${submission.stage.stageName}: ${reason}`,
            link: `/installer/jobs/${submission.jobWorkflow.jobTicketId}/execute`,
          });
        }
      }

      await tx.insert(activityLogs).values({
        entityId: submission.jobWorkflow.jobTicketId,
        entityType: "JOB_TICKET",
        action: `WORKFLOW_STAGE_${decision}`,
        description:
          decision === "APPROVED"
            ? submission.isSkipped
              ? `${actor.name || actor.email || "Staff"} acknowledged ISO deviation for Stage: ${submission.stage.stageName}. Reason: ${submission.skipReason}`
              : `${actor.name || actor.email || "Staff"} verified and approved Stage: ${submission.stage.stageName}.`
            : `${actor.name || actor.email || "Staff"} rejected Stage: ${submission.stage.stageName}. Reason: ${reason}`,
        userId: actor.id,
      });

      return {
        jobTicketId: submission.jobWorkflow.jobTicketId,
        installerId: submission.jobWorkflow.jobTicket.installerId,
        stageName: submission.stage.stageName,
      };
    });

    if (decision === "REJECTED" && result.installerId) {
      try {
        const { pusherServer } = await import("@/lib/pusher");
        await pusherServer.trigger(
          `installer-${result.installerId}`,
          "workflow-stage-rejected",
          {
            jobTicketId: result.jobTicketId,
            stageName: result.stageName,
            reason,
          },
        );
      } catch (pusherError) {
        console.error("Failed to send workflow rejection notification:", pusherError);
      }
    }

    revalidatePath(`/admin/projects/${result.jobTicketId}/audit`);
    revalidatePath(`/admin/job-tickets/${result.jobTicketId}`);
    revalidatePath(`/installer/jobs/${result.jobTicketId}/execute`);
    return { success: true };
  } catch (error) {
    console.error("Failed to review stage submission:", error);
    return {
      success: false,
      error: "Failed to review stage submission.",
    };
  }
}

export async function getInstallerJobList() {
  const installer = await getAuthenticatedInstaller();

  return db.query.installationJobTickets.findMany({
    where: eq(installationJobTickets.installerId, installer.id),
    with: {
      quotation: {
        with: {
          user: true,
        },
      },
      workflows: {
        with: {
          template: true,
          currentStage: true,
        },
        orderBy: [desc(jobWorkflows.startedAt)],
      },
    },
    orderBy: [desc(installationJobTickets.scheduledDate)],
  });
}

export async function getInstallerById(userId: string) {
  await requireStaff();
  return db.query.users.findFirst({ where: eq(users.id, userId) });
}
