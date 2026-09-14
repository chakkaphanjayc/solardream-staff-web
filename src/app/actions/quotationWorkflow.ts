"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  installationWorkflowProjects,
  projectWarrantyRegistrations,
  proposals,
  quotationDeliveryDocuments,
  quotationWorkflows,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { deriveQuotationWorkflowState } from "@/lib/quotationWorkflow";

function revalidateWorkflow(proposalId: string) {
  for (const path of [`/admin/crm/${proposalId}`, `/th/admin/crm/${proposalId}`, `/en/admin/crm/${proposalId}`]) {
    revalidatePath(path);
  }
}

export async function getQuotationWorkflowState(proposalId: string) {
  await requireStaff();
  const [proposal, workflow, quotation, project] = await Promise.all([
    db.query.proposals.findFirst({ where: eq(proposals.id, proposalId) }),
    db.query.quotationWorkflows.findFirst({ where: eq(quotationWorkflows.proposalId, proposalId) }),
    db.query.quotationDeliveryDocuments.findFirst({
      where: and(eq(quotationDeliveryDocuments.quotationId, proposalId), eq(quotationDeliveryDocuments.deliveryType, "FINAL_QUOTATION"), eq(quotationDeliveryDocuments.status, "READY")),
    }),
    db.query.installationWorkflowProjects.findFirst({ where: eq(installationWorkflowProjects.proposalId, proposalId) }),
  ]);
  if (!proposal) throw new Error("Quotation not found.");
  const warranty = project
    ? await db.query.projectWarrantyRegistrations.findFirst({ where: eq(projectWarrantyRegistrations.projectId, project.id) })
    : null;
  const facts = {
    erpQuotationId: proposal.erpnextQuotationId,
    technicalReviewedAt: workflow?.technicalReviewedAt || null,
    completedQuotationAttached: Boolean(quotation),
    quotationDispatchedAt: workflow?.quotationDispatchedAt || null,
    clientApprovedAt: workflow?.clientApprovedAt || proposal.signedAt || null,
    paymentConfirmedAt: workflow?.paymentConfirmedAt || proposal.paidAt || null,
    fieldProjectId: project?.id || null,
    fieldProjectFinished: project?.status === "FINISHED",
    projectDocumentationComplete: Boolean(workflow?.projectDocumentationCompletedAt),
    warrantyRegisteredAt: workflow?.warrantyRegisteredAt || warranty?.registeredAt || null,
  };
  return { state: deriveQuotationWorkflowState(facts), facts, workflow };
}

export async function confirmTechnicalConfiguration(proposalId: string) {
  await requireStaff();
  const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, proposalId), columns: { id: true, erpnextQuotationId: true } });
  if (!proposal?.erpnextQuotationId) return { success: false, error: "Create the ERPNext quotation before completing technical configuration." };
  const now = new Date();
  await db.insert(quotationWorkflows).values({ proposalId, technicalReviewedAt: now, erpQuotationVerifiedAt: now, currentStep: 2, updatedAt: now })
    .onConflictDoUpdate({ target: quotationWorkflows.proposalId, set: { technicalReviewedAt: now, erpQuotationVerifiedAt: now, currentStep: 2, updatedAt: now } });
  revalidateWorkflow(proposalId);
  return { success: true };
}

const warrantyRegistrationSchema = z.object({
  projectId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).optional(),
  installationAddress: z.string().trim().max(500).optional(),
  details: z.record(z.string(), z.string().trim().max(500)).default({}),
});

export async function registerProjectWarranty(input: z.infer<typeof warrantyRegistrationSchema>) {
  const actor = await requireStaff();
  const parsed = warrantyRegistrationSchema.parse(input);
  const project = await db.query.installationWorkflowProjects.findFirst({ where: eq(installationWorkflowProjects.id, parsed.projectId) });
  if (!project || project.status !== "FINISHED") return { success: false, error: "Finish the Field Project before registering its warranty." };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(projectWarrantyRegistrations).values({ ...parsed, registeredByUserId: actor.id, registeredAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: projectWarrantyRegistrations.projectId, set: { customerName: parsed.customerName, phone: parsed.phone || null, installationAddress: parsed.installationAddress || null, details: parsed.details, registeredByUserId: actor.id, registeredAt: now, updatedAt: now } });
    await tx.insert(quotationWorkflows).values({ proposalId: project.proposalId, currentStep: 5, warrantyRegisteredAt: now, completedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: quotationWorkflows.proposalId, set: { currentStep: 5, warrantyRegisteredAt: now, completedAt: now, updatedAt: now } });
  });
  revalidateWorkflow(project.proposalId);
  return { success: true };
}
