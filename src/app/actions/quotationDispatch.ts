"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { consultationLeads, proposals } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { issuePortalDispatchLink } from "@/lib/portalTokens";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { SALES_NOTIFICATION_TOPICS } from "@/lib/salesNotificationConfig";

type DispatchQuotationResult =
  | {
      success: true;
      proposalId: string;
      dispatchStatus: "DISPATCHED";
      signingUrl: string;
      magicLink: string;
      magicTokenSlug: string;
    }
  | {
      success: false;
      error: string;
    };

type StaffSignatureStatusResult =
  | {
      success: true;
      proposalId: string;
      status: string;
      staffSignatureComplete: boolean;
      magicLink: string;
      customerEmbedUrl: string | null;
    }
  | {
      success: false;
      error: string;
    };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function buildPortalPath(proposalId: string) {
  return `/th/portal/${encodeURIComponent(proposalId)}`;
}

async function findQuotationProposal(quotationId: string) {
  const byProposalId = await db.query.proposals.findFirst({
    where: eq(proposals.id, quotationId),
    with: {
      user: {
        columns: {
          name: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (byProposalId) return byProposalId;

  return db.query.proposals.findFirst({
    where: eq(proposals.erpnextQuotationId, quotationId),
    with: {
      user: {
        columns: {
          name: true,
          fullName: true,
          email: true,
        },
      },
    },
  });
}

export type DispatchConfigInput = {
  expiresInDays?: number;
  locale?: "th" | "en";
  requireIdUpload?: boolean;
  requireDeposit?: boolean;
  customNote?: string;
};

export async function dispatchQuotationForSigning(
  quotationId: string,
  wizardLeadId?: string | null,
  configInput?: DispatchConfigInput,
): Promise<DispatchQuotationResult> {
  try {
    const actor = await requireStaff();
    const cleanQuotationId = quotationId.trim();
    const cleanWizardLeadId = wizardLeadId?.trim() || null;

    if (!cleanQuotationId) return { success: false, error: "A quotation ID is required." };

    const [proposal, wizardLead] = await Promise.all([
      findQuotationProposal(cleanQuotationId),
      cleanWizardLeadId
        ? db.query.consultationLeads.findFirst({
            where: eq(consultationLeads.id, cleanWizardLeadId),
          })
        : Promise.resolve(null),
    ]);

    if (!proposal) return { success: false, error: "Quotation was not found." };
    if (cleanWizardLeadId && !wizardLead) return { success: false, error: "Linked consultation lead was not found." };

    const existingConfig = asRecord(proposal.configurationData);
    const dispatchedAt = new Date().toISOString();
    const expiresInDays = configInput?.expiresInDays ?? 14;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const magicLink = await issuePortalDispatchLink({
      proposalId: proposal.id,
      actorUserId: actor.id,
      expiresAt,
    });
    const portalPath = buildPortalPath(proposal.id);
    const isAlreadySigned = ["SIGNED", "APPROVED", "FULLY_SIGNED"].includes(proposal.status.toUpperCase());

    const dispatchMetadata = {
      ...asRecord(existingConfig.dispatch),
      status: "AWAITING_CLIENT_SIGNATURE",
      dispatchedAt,
      dispatchedBy: actor.id,
      portalPath,
      expiresInDays,
      expiresAt: expiresAt.toISOString(),
      locale: configInput?.locale || "th",
      requireIdUpload: Boolean(configInput?.requireIdUpload),
      requireDeposit: Boolean(configInput?.requireDeposit),
      customNote: configInput?.customNote || "",
      magicLink: null,
    };

    const [updatedProposal] = await db
      .update(proposals)
      .set({
        wizardLeadId: wizardLead?.id || proposal.wizardLeadId,
        dispatchStatus: "DISPATCHED",
        status: isAlreadySigned ? proposal.status : "AWAITING_CLIENT_SIGNATURE",
        configurationData: {
          ...existingConfig,
          linkedWizardLead: {
            wizardLeadId: wizardLead?.id || null,
            quotationId: proposal.id,
            erpnextQuotationId: proposal.erpnextQuotationId,
            linkedAt: dispatchedAt,
            linkedBy: actor.id,
          },
          dispatch: dispatchMetadata,
        },
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposal.id))
      .returning();

    revalidatePath("/admin/quotations");
    revalidatePath("/admin/quotations/dispatch");
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath(`/proposals/${updatedProposal.magicTokenSlug}`);

    await enqueueIntegrationEvent(db, {
      topic: SALES_NOTIFICATION_TOPICS.quotationReady,
      aggregateType: "PROPOSAL",
      aggregateId: proposal.id,
      payload: { source: "dispatch_for_signing" },
      dedupeKey: `sales.quotation.ready:${proposal.id}`,
    });
    await processOutboxBestEffort(proposal.id);

    return {
      success: true,
      proposalId: updatedProposal.id,
      dispatchStatus: "DISPATCHED",
      signingUrl: portalPath,
      magicLink,
      magicTokenSlug: updatedProposal.magicTokenSlug,
    };
  } catch (error) {
    console.error("[dispatchQuotationForSigning] Failed to dispatch quotation:", error);
    return {
      success: false,
      error: "Failed to dispatch quotation.",
    };
  }
}

export async function refreshStaffSignatureStatus(
  proposalId: string,
): Promise<StaffSignatureStatusResult> {
  try {
    await requireStaff();
    const cleanProposalId = proposalId.trim();
    if (!cleanProposalId) return { success: false, error: "A proposal ID is required." };

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, cleanProposalId),
    });

    if (!proposal) return { success: false, error: "Quotation was not found." };

    const magicLink = buildPortalPath(proposal.id);
    return {
      success: true,
      proposalId: proposal.id,
      status: proposal.status,
      staffSignatureComplete: true,
      magicLink,
      customerEmbedUrl: null,
    };
  } catch (error) {
    console.error("[refreshStaffSignatureStatus] Failed to refresh dispatch status:", error);
    return {
      success: false,
      error: "Failed to refresh dispatch status.",
    };
  }
}
