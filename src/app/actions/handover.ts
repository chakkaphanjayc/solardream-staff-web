"use server";

import { db } from "@/db";
import {
  proposals,
  installationJobTickets,
  jobWorkflows,
  workflowTemplates,
  workflowStages,
  activityLogs,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireStaff } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { jobTypes, type JobType } from "@/lib/workflow-types";

type CustomerDocument = {
  id: string;
  name: string;
  url: string;
  verified: boolean;
  sizeBytes?: number;
  size?: number;
  mimeType?: string;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function resolveJobType(
  configurationData: Record<string, unknown>,
  fulfillmentType: string | null,
): JobType {
  const candidates = [
    configurationData.jobType,
    configurationData.targetJobType,
    configurationData.branch,
    configurationData.routingBranch,
    fulfillmentType,
  ];

  const matched = candidates.find(
    (value): value is JobType => typeof value === "string" && jobTypes.includes(value as JobType),
  );

  return matched || "INSTALLATION";
}

function toJobTicketSnapshot(ticket: typeof installationJobTickets.$inferSelect) {
  return {
    id: ticket.id,
    quotationId: ticket.quotationId,
    jobType: ticket.jobType,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

/**
 * Validates customer details, marks the proposal as SIGNED/COMPLETED, 
 * creates a Job Ticket, and assigns the active Workflow template.
 */
export async function approveAndCreateJobTicketAction(proposalId: string) {
  try {
    const actor = await requireStaff();

    // 1. Fetch proposal
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
      with: {
        user: {
          columns: {
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!proposal) {
      return { success: false, error: "Quotation/Proposal not found." };
    }

    const configData = asRecord(proposal.configurationData);
    
    // Validation of customer metadata
    const customerName = proposal.user?.name || configData.name || null;
    const customerPhone = proposal.user?.phoneNumber || configData.phone || null;
    const customerAddress = configData.location || null;
    const isPriceValid = proposal.totalPrice > 0;

    if (!customerName || !customerPhone || !customerAddress || !isPriceValid) {
      return { 
        success: false, 
        error: "Mandatory customer details (Name, Phone, Address/Location) are missing or investment value is invalid." 
      };
    }

    const jobType = resolveJobType(configData, proposal.fulfillmentType);

    // 2. Perform DB Updates in Transaction
    const ticket = await db.transaction(async (tx) => {
      // A. Confirm the quotation before creating the operational pipeline.
      await tx.update(proposals)
        .set({
          status: "SIGNED",
          verifiedAt: new Date(),
          verifiedByAdminId: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      // B. Create installation job ticket if not existing
      let jobTicket = await tx.query.installationJobTickets.findFirst({
        where: eq(installationJobTickets.quotationId, proposalId),
      });

      if (!jobTicket) {
        const [createdTicket] = await tx.insert(installationJobTickets)
          .values({
            quotationId: proposalId,
            jobType,
            status: "PENDING_ASSIGNMENT",
            installationNotes: typeof configData.notes === "string" ? configData.notes : null,
          })
          .returning();
        jobTicket = createdTicket;
      }

      // C. Query and assign active Workflow template
      const existingWorkflow = await tx.query.jobWorkflows.findFirst({
        where: eq(jobWorkflows.jobTicketId, jobTicket.id),
      });

      if (!existingWorkflow) {
        const activeTemplate = await tx.query.workflowTemplates.findFirst({
          where: and(
            eq(workflowTemplates.targetJobType, jobType),
            eq(workflowTemplates.isActive, true)
          ),
          with: {
            stages: {
              orderBy: [asc(workflowStages.stepOrder)],
            },
          },
        });

        if (!activeTemplate?.stages[0]) {
          throw new Error(`No active workflow with at least one stage is configured for ${jobType}.`);
        }

        await tx.insert(jobWorkflows).values({
          jobTicketId: jobTicket.id,
          templateId: activeTemplate.id,
          currentStageId: activeTemplate.stages[0].id,
          status: "IN_PROGRESS",
        });

        await tx.insert(activityLogs).values({
          entityId: jobTicket.id,
          entityType: "JOB_TICKET",
          action: "WORKFLOW_AUTO_ASSIGNED",
          description: `Workflow template "${activeTemplate.name}" auto-assigned for ${jobType} job type during handover.`,
          userId: actor.id,
        });
      }

      // Record Activity Log
      await tx.insert(activityLogs).values({
        entityId: proposalId,
        entityType: "QUOTATION",
        action: "HANDOVER_COMPLETED",
        description: `Quotation confirmed as SIGNED and ${jobType} job workflow initialized.`,
        userId: actor.id,
      });

      return jobTicket;
    });

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposalId}`);
    revalidatePath("/admin/tickets");

    return { success: true, ticket: toJobTicketSnapshot(ticket) };
  } catch (err: unknown) {
    console.error("Error in approveAndCreateJobTicketAction:", err);
    return {
      success: false,
      error: "Failed to complete quotation handover.",
    };
  }
}

/**
 * Updates the verification state of a specific customer document in the proposal JSON metadata.
 */
export async function toggleCustomerDocumentVerificationAction(
  proposalId: string,
  docId: string,
  verifiedStatus: boolean
) {
  try {
    const actor = await requireStaff();

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });

    if (!proposal) {
      return { success: false, error: "Quotation/Proposal not found." };
    }

    const configData = asRecord(proposal.configurationData);
    const docs = configData.customerDocuments;
    const finalDocs: CustomerDocument[] = Array.isArray(docs)
      ? (docs as CustomerDocument[])
      : [];

    if (!finalDocs.some((document) => document.id === docId)) {
      return { success: false, error: "Customer document not found." };
    }

    // Map and update the target document's verified field
    const updatedDocs = finalDocs.map((doc) => {
      if (doc.id === docId) {
        return { ...doc, verified: verifiedStatus };
      }
      return doc;
    });

    const updatedConfigData = {
      ...configData,
      customerDocuments: updatedDocs,
    };

    await db.update(proposals)
      .set({
        configurationData: updatedConfigData,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId));

    await db.insert(activityLogs).values({
      entityId: proposalId,
      entityType: "QUOTATION",
      action: "DOCUMENT_VERIFICATION_TOGGLED",
      description: `${actor.name || actor.email} toggled verification status of "${docId}" document to ${verifiedStatus}.`,
      userId: actor.id,
    });

    revalidatePath(`/admin/crm/${proposalId}`);
    return { success: true, documents: updatedDocs };
  } catch (err: unknown) {
    console.error("Error in toggleCustomerDocumentVerificationAction:", err);
    return {
      success: false,
      error: "Failed to toggle document verification state.",
    };
  }
}
