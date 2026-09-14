import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  activityLogs,
  installationWorkflowProjects,
  projectWarrantyRegistrations,
  quotationWorkflows,
} from "@/db/schema";
import { portalJson, resolvePortalAccess } from "@/lib/portalAccess";


const registrationSchema = z.object({
  proposalId: z.string().trim().min(1),
  customerName: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40),
  installationAddress: z.string().trim().min(1).max(500),
  systemSerialNumber: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = registrationSchema.parse(await request.json());
    const access = await resolvePortalAccess({
      request,
      proposalId: input.proposalId,
      capability: "documents:write",
      mutation: true,
    });
    if (!access) {
      return portalJson(
        { success: false, error: "You are not authorized to register this project." },
        { status: 401 },
      );
    }

    const project = await db.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.proposalId, access.proposal.id),
    });
    if (!project) {
      return portalJson(
        { success: false, error: "The Field Project has not been created yet." },
        { status: 409 },
      );
    }
    if (project.status !== "FINISHED") {
      return portalJson(
        { success: false, error: "Warranty registration opens after project handover is complete." },
        { status: 409 },
      );
    }

    const now = new Date();
    const details = {
      ...(input.systemSerialNumber ? { systemSerialNumber: input.systemSerialNumber } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    };
    await db.transaction(async (tx) => {
      await tx
        .insert(projectWarrantyRegistrations)
        .values({
          projectId: project.id,
          registeredByUserId: access.actorUserId,
          customerName: input.customerName,
          phone: input.phone,
          installationAddress: input.installationAddress,
          details,
          registeredAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: projectWarrantyRegistrations.projectId,
          set: {
            registeredByUserId: access.actorUserId,
            customerName: input.customerName,
            phone: input.phone,
            installationAddress: input.installationAddress,
            details,
            registeredAt: now,
            updatedAt: now,
          },
        });
      await tx
        .insert(quotationWorkflows)
        .values({
          proposalId: access.proposal.id,
          currentStep: 5,
          warrantyRegisteredAt: now,
          completedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: quotationWorkflows.proposalId,
          set: {
            currentStep: 5,
            warrantyRegisteredAt: now,
            completedAt: now,
            updatedAt: now,
          },
        });
      await tx.insert(activityLogs).values({
        entityId: access.proposal.id,
        entityType: "QUOTATION",
        action: "CUSTOMER_WARRANTY_REGISTERED",
        description: "Customer registered the completed project warranty.",
        userId: access.actorUserId,
      });
    });

    for (const path of [
      `/proposals/${access.proposal.magicTokenSlug}`,
      `/th/proposals/${access.proposal.magicTokenSlug}`,
      `/en/proposals/${access.proposal.magicTokenSlug}`,
      `/admin/crm/${access.proposal.id}`,
      `/th/admin/crm/${access.proposal.id}`,
      `/en/admin/crm/${access.proposal.id}`,
    ]) {
      revalidatePath(path);
    }

    return portalJson({ success: true, registeredAt: now.toISOString() });
  } catch (error) {
    console.error("[Project Warranty Registration]:", error);
    return portalJson(
      { success: false, error: "We could not save your warranty registration. Please try again." },
      { status: 500 },
    );
  }
}
