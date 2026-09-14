"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { consultationLeads, proposals } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";

type LinkQuotationToLeadResult =
  | {
      success: true;
      proposal: {
        id: string;
        wizardLeadId: string | null;
        dispatchStatus: string | null;
        updatedAt: Date;
      };
    }
  | {
      success: false;
      error: string;
    };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function findQuotationProposal(quotationId: string) {
  const byProposalId = await db.query.proposals.findFirst({
    where: eq(proposals.id, quotationId),
  });

  if (byProposalId) return byProposalId;

  return db.query.proposals.findFirst({
    where: eq(proposals.erpnextQuotationId, quotationId),
  });
}

export async function linkQuotationToLead(
  quotationId: string,
  wizardLeadId: string,
): Promise<LinkQuotationToLeadResult> {
  try {
    const actor = await requireStaff();
    const cleanQuotationId = quotationId.trim();
    const cleanWizardLeadId = wizardLeadId.trim();

    if (!cleanQuotationId) {
      return { success: false, error: "A quotation ID is required." };
    }

    if (!cleanWizardLeadId) {
      return { success: false, error: "A wizard lead ID is required." };
    }

    const [proposal, wizardLead] = await Promise.all([
      findQuotationProposal(cleanQuotationId),
      db.query.consultationLeads.findFirst({
        where: eq(consultationLeads.id, cleanWizardLeadId),
      }),
    ]);

    if (!proposal) {
      return { success: false, error: "Quotation was not found." };
    }

    if (!wizardLead) {
      return { success: false, error: "Wizard lead was not found." };
    }

    const existingConfig = asRecord(proposal.configurationData);
    const [updatedProposal] = await db
      .update(proposals)
      .set({
        wizardLeadId: wizardLead.id,
        dispatchStatus: "PENDING_DISPATCH",
        configurationData: {
          ...existingConfig,
          linkedWizardLead: {
            wizardLeadId: wizardLead.id,
            quotationId: proposal.id,
            erpnextQuotationId: proposal.erpnextQuotationId,
            linkedAt: new Date().toISOString(),
            linkedBy: actor.id,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposal.id))
      .returning();

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath("/admin/quotations");
    revalidatePath("/proposals");

    return {
      success: true,
      proposal: {
        id: updatedProposal.id,
        wizardLeadId: updatedProposal.wizardLeadId,
        dispatchStatus: updatedProposal.dispatchStatus,
        updatedAt: updatedProposal.updatedAt,
      },
    };
  } catch (error) {
    console.error("[linkQuotationToLead] Failed to link quotation to lead:", error);
    return {
      success: false,
      error: "Failed to link quotation to wizard lead.",
    };
  }
}
