"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activityLogs, proposals, jobTickets, userNotifications, installationWorkflowProjects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth-guard";
import { FULFILLMENT_INSTALLATION, FULFILLMENT_PURCHASE_ONLY, FIELD_MILESTONES, canRouteProposal } from "@/lib/fulfillment";
import { createErpnextQuotation } from "@/app/actions/erpnextQuotation";
import { generateErpnextProjectForProposal } from "@/app/actions/erpnextProject";
import { sendDynamicQuotationRevisionEmail } from "@/lib/email";
import { addSystemComment } from "@/app/actions/quotationComments";
import { getConfiguredAdminSiteUrl } from "@/lib/siteUrl";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asJsonValue(value: unknown): unknown {
  if (value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(asJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, asJsonValue(item)])
    );
  }
  return null;
}

function getPublicError(error: unknown, fallback: string) {
  return error instanceof Error && error.name.endsWith("ValidationError") ? error.message : fallback;
}

function getConfigString(config: Record<string, unknown>, key: string) {
  return typeof config[key] === "string" ? config[key] as string : null;
}

function toFulfillmentProposalSnapshot(proposal: typeof proposals.$inferSelect) {
  return {
    id: proposal.id,
    status: proposal.status,
    fulfillmentType: proposal.fulfillmentType,
    totalPrice: proposal.totalPrice,
    revisionNumber: proposal.revisionNumber,
    currentMilestoneStep: proposal.currentMilestoneStep,
    shippingTrackingNumber: proposal.shippingTrackingNumber,
    configurationData: proposal.configurationData,
    updatedAt: proposal.updatedAt,
  };
}

function normalizeRevisionItem(item: Record<string, unknown>) {
  return {
    productId: typeof item.productId === "string" ? item.productId : null,
    item_code: typeof item.item_code === "string" ? item.item_code : "",
    brand: typeof item.brand === "string" ? item.brand : "",
    model: typeof item.model === "string" ? item.model : "",
    description: typeof item.description === "string" ? item.description : "",
    qty: Number(item.qty ?? item.quantity ?? 0),
    rate: Number(item.rate ?? item.unitPrice ?? 0),
    amount: Number(item.amount ?? 0),
  };
}

function normalizeRevisionFee(item: Record<string, unknown>) {
  return {
    serviceFeeId: typeof item.serviceFeeId === "string" ? item.serviceFeeId : typeof item.id === "string" ? item.id : null,
    name: typeof item.name === "string" ? item.name : "",
    erpItemCode: typeof item.erpItemCode === "string" ? item.erpItemCode : typeof item.erp_item_code === "string" ? item.erp_item_code : "",
    basePrice: Number(item.basePrice ?? item.rate ?? 0),
    qty: Number(item.qty ?? 0),
    amount: Number(item.amount ?? 0),
  };
}

function serializeRevisionPayload(items: Array<Record<string, unknown>> = [], serviceFees: Array<Record<string, unknown>> = []) {
  return {
    items: items.map(normalizeRevisionItem),
    serviceFees: serviceFees.map(normalizeRevisionFee),
  };
}

function hasRevisionChanges(
  current: { items: Array<Record<string, unknown>>; serviceFees: Array<Record<string, unknown>> },
  next: { items: Array<Record<string, unknown>>; serviceFees: Array<Record<string, unknown>> }
) {
  return JSON.stringify(serializeRevisionPayload(current.items, current.serviceFees)) !== JSON.stringify(serializeRevisionPayload(next.items, next.serviceFees));
}

function requiresFreshSignature(status: string) {
  return ["SIGNED", "ACCEPTED", "SIGNED_WAITING_VERIFY"].includes(status.toUpperCase());
}

function isPendingSalesReview(status: string) {
  const normalized = status.toUpperCase();
  return normalized === "PENDING_SALES_REVIEW" || normalized === "PENDING_EVALUATION";
}

export async function routeProposalToInstallation(proposalId: string) {
  try {
    const actor = await requireStaff();

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });
    if (!proposal) return { error: "Proposal not found." };
    if (!canRouteProposal(proposal.status)) {
      return { error: `Proposal must be signed before installation routing. Current status: ${proposal.status}` };
    }

    const config = asRecord(proposal.configurationData);
    const latitude = typeof config.latitude === "number" ? config.latitude : null;
    const longitude = typeof config.longitude === "number" ? config.longitude : null;
    const coordinates = latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : undefined;

    const ticket = await db.transaction(async (tx) => {
      await tx.update(proposals)
        .set({
          status: "VERIFIED_IN_PROGRESS",
          fulfillmentType: FULFILLMENT_INSTALLATION,
          currentMilestoneStep: 1,
          fieldChecklistData: {},
        })
        .where(eq(proposals.id, proposalId));

      const existingTicket = await tx.query.jobTickets.findFirst({
        where: eq(jobTickets.proposalId, proposalId),
      });
      if (existingTicket) return existingTicket;

      const [newTicket] = await tx.insert(jobTickets)
        .values({
          proposalId,
          customerPhone: getConfigString(config, "phone"),
          customerAddress: getConfigString(config, "location"),
          coordinates,
          signedDocumentDriveUrl: proposal.signedDocumentDriveUrl,
          status: "PENDING",
        })
        .returning();

      return newTicket;
    });

    const projectResult = await generateErpnextProjectForProposal(proposalId);

    await db.insert(activityLogs)
      .values({
        entityId: proposalId,
        entityType: "QUOTATION",
        action: "STATUS_CHANGED",
        description: `${actor.name || actor.email || "Staff"} routed quotation to installation workflow.`,
        userId: actor.id,
      });

    revalidatePath("/admin/crm");
    revalidatePath("/admin/tickets");
    revalidatePath("/proposals");
    return { success: true, ticket, projectResult };
  } catch (error: unknown) {
    console.error("Failed to route proposal to installation:", error);
    return { error: getPublicError(error, "Failed to route proposal to installation.") };
  }
}

export async function routeProposalToPurchaseOnly(proposalId: string) {
  try {
    const actor = await requireStaff();

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });
    if (!proposal) return { error: "Proposal not found." };
    if (!canRouteProposal(proposal.status)) {
      return { error: `Proposal must be signed before purchase-only routing. Current status: ${proposal.status}` };
    }

    await db.update(proposals)
      .set({
        fulfillmentType: FULFILLMENT_PURCHASE_ONLY,
      })
      .where(eq(proposals.id, proposalId));

    const quotationResult = await createErpnextQuotation(proposalId);
    if (!quotationResult.success) return { error: quotationResult.error || "ERPNext quotation sync failed." };

    const [updatedProposal] = await db.update(proposals)
      .set({
        status: "SENT",
        fulfillmentType: FULFILLMENT_PURCHASE_ONLY,
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    await db.insert(activityLogs)
      .values({
        entityId: updatedProposal.id,
        entityType: "QUOTATION",
        action: "STATUS_CHANGED",
        description: `${actor.name || actor.email || "Staff"} routed quotation to purchase-only workflow and sent it to ERPNext.`,
        userId: actor.id,
      });

    revalidatePath("/admin/crm");
    revalidatePath("/proposals");
    return {
      success: true,
      proposal: toFulfillmentProposalSnapshot(updatedProposal),
      quotationResult,
    };
  } catch (error: unknown) {
    console.error("Failed to route proposal to purchase only:", error);
    return { error: getPublicError(error, "Failed to route proposal to purchase only.") };
  }
}

export async function updateShippingTracking(
  proposalId: string,
  data: {
    carrier?: string | null;
    trackingNumber?: string | null;
  }
) {
  try {
    const actor = await requireStaff();

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });
    if (!proposal) return { error: "Proposal not found." };

    const config = asRecord(proposal.configurationData);
    const [updatedProposal] = await db.update(proposals)
      .set({
        shippingTrackingNumber: data.trackingNumber?.trim() || null,
        configurationData: {
          ...config,
          shippingCarrier: data.carrier?.trim() || null,
          logisticsUpdatedAt: new Date().toISOString(),
        },
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    await db.insert(activityLogs)
      .values({
        entityId: updatedProposal.id,
        entityType: "QUOTATION",
        action: "UPDATED",
        description: `${actor.name || actor.email || "Staff"} updated shipping tracking information.`,
        userId: actor.id,
      });

    revalidatePath("/admin/crm");
    revalidatePath("/proposals");
    return { success: true, proposal: toFulfillmentProposalSnapshot(updatedProposal) };
  } catch (error: unknown) {
    console.error("Failed to update shipping tracking:", error);
    return { error: getPublicError(error, "Failed to update shipping tracking.") };
  }
}

export async function submitMilestoneStep(
  proposalId: string,
  step: number,
  checklist: unknown
) {
  try {
    const actor = await requireStaff();

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });
    if (!proposal) return { error: "Proposal not found." };
    if (proposal.fulfillmentType !== FULFILLMENT_INSTALLATION) return { error: "Proposal is not on the installation track." };
    const installationProject = await db.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.proposalId, proposalId),
      columns: { sourceVersion: true },
    });
    if (installationProject?.sourceVersion && installationProject.sourceVersion >= 2) {
      return { error: "This project uses the canonical technician seven-stage workflow. Complete stages from the technician portal." };
    }
    const normalizedStep = Number.isInteger(step) ? step : Number.NaN;
    if (normalizedStep !== proposal.currentMilestoneStep) {
      return { error: `Step ${proposal.currentMilestoneStep} must be completed before step ${step}.` };
    }
    if (normalizedStep < 1 || normalizedStep > FIELD_MILESTONES.length) {
      return { error: "Invalid milestone step." };
    }

    const fieldChecklistData = asRecord(proposal.fieldChecklistData);
    const safeChecklist = asJsonValue(checklist);
    const nextStep = Math.min(normalizedStep + 1, FIELD_MILESTONES.length);
    const [updatedProposal] = await db.update(proposals)
      .set({
        currentMilestoneStep: nextStep,
        status: normalizedStep === FIELD_MILESTONES.length ? "COMPLETED" : proposal.status,
        fieldChecklistData: {
          ...fieldChecklistData,
          [`step_${normalizedStep}`]: {
            title: FIELD_MILESTONES[normalizedStep - 1],
            checklist: safeChecklist,
            completedAt: new Date().toISOString(),
          },
        },
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    await db.insert(activityLogs)
      .values({
        entityId: updatedProposal.id,
        entityType: "QUOTATION",
        action: normalizedStep === FIELD_MILESTONES.length ? "COMPLETED" : "STATUS_CHANGED",
        description: `${actor.name || actor.email || "Staff"} completed installation milestone ${normalizedStep}: ${FIELD_MILESTONES[normalizedStep - 1]}.`,
        userId: actor.id,
      });

    revalidatePath("/admin/crm");
    revalidatePath("/proposals");
    return { success: true, proposal: toFulfillmentProposalSnapshot(updatedProposal) };
  } catch (error: unknown) {
    console.error("Failed to submit milestone step:", error);
    return { error: getPublicError(error, "Failed to submit milestone step.") };
  }
}

export async function updateRevisionMatrix(
  proposalId: string,
  data: {
    items: Array<Record<string, unknown>>;
    serviceFees?: Array<Record<string, unknown>>;
    totalPrice?: number | null;
    notes?: string | null;
  }
) {
  try {
    const actor = await requireStaff();

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
      with: {
        user: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
    });
    if (!proposal) return { error: "Proposal not found." };

    const signedStatuses = ["SIGNED", "SIGNED_WAITING_VERIFY", "MILESTONE_1_ACTIVE", "COMPLETED", "PAID", "DELIVERED"];
    if (signedStatuses.includes(proposal.status.toUpperCase())) {
      return { error: "This proposal has already been signed and its scope/pricing cannot be modified." };
    }

    const config = asRecord(proposal.configurationData);
    const history = Array.isArray(config.revisionMatrixHistory) ? config.revisionMatrixHistory : [];
    const currentItems = Array.isArray(config.items) ? config.items as Array<Record<string, unknown>> : [];
    const currentServiceFees = Array.isArray(config.serviceFees)
      ? config.serviceFees as Array<Record<string, unknown>>
      : Array.isArray(config.service_fees)
        ? config.service_fees as Array<Record<string, unknown>>
        : [];
    const incomingItems = data.items;
    const incomingServiceFees = Array.isArray(data.serviceFees) ? data.serviceFees : [];
    const revisionChanged = hasRevisionChanges(
      { items: currentItems, serviceFees: currentServiceFees },
      { items: incomingItems, serviceFees: incomingServiceFees }
    );
    const revisionRequestedByCustomer =
      proposal.status.toUpperCase() === "REVISION_REQUESTED"
      || asRecord(config.customerApproval).status === "REVISION_IN_PROGRESS";
    const revisionRequired = revisionChanged && (
      requiresFreshSignature(proposal.status) || revisionRequestedByCustomer
    );
    const evaluationReadyForSignature = revisionChanged && isPendingSalesReview(proposal.status);
    const totalPrice = typeof data.totalPrice === "number" && Number.isFinite(data.totalPrice) ? data.totalPrice : proposal.totalPrice;
    const nextRevisionNumber = revisionRequired ? proposal.revisionNumber + 1 : proposal.revisionNumber;
    const revisionTimestamp = new Date().toISOString();
    const updatedProposal = await db.transaction(async (tx) => {
      const [proposalUpdate] = await tx.update(proposals)
        .set({
          totalPrice,
          ...(revisionRequired
            ? {
                revisionNumber: nextRevisionNumber,
                signatureUrl: null,
                signedAt: null,
                status: "REVISION_PENDING",
              }
            : evaluationReadyForSignature
              ? {
                  signatureUrl: null,
                  signedAt: null,
                  status: "REVISION_PENDING",
                }
              : {}),
          configurationData: {
            ...config,
            items: incomingItems,
            serviceFees: incomingServiceFees,
            revisionMatrixHistory: [
              ...history,
              {
                notes: data.notes || null,
                totalPrice,
                updatedAt: revisionTimestamp,
                ...(revisionRequired
                  ? {
                      event: "REVISION_REQUIRED",
                      featureKey: "QUOTATION_REVISED",
                      revisionNumber: nextRevisionNumber,
                    }
                  : evaluationReadyForSignature
                    ? {
                        event: "INSTALLATION_EVALUATION_READY",
                        featureKey: "INSTALLATION_EVALUATION_READY",
                        customerSignatureUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/th/proposals`,
                      }
                  : {}),
              },
            ],
            ...(evaluationReadyForSignature
              ? {
                  pendingEvaluation: false,
                  evaluationStatus: "READY_FOR_SIGNATURE",
                  evaluatedAt: revisionTimestamp,
                }
              : {}),
          },
        })
        .where(eq(proposals.id, proposalId))
        .returning();

      if (revisionRequired && proposal.userId) {
        const message = `ใบเสนอราคาของคุณได้รับการปรับปรุงข้อมูล/ราคา กรุณาเข้าสู่ระบบเพื่อตรวจสอบรายละเอียดและลงนามอนุมัติเอกสารฉบับใหม่ (Revision #${nextRevisionNumber})`;
        await tx.insert(userNotifications)
          .values({
            userId: proposal.userId,
            featureKey: "QUOTATION_REVISED",
            link: "/proposals",
            message,
            isRead: false,
          });
      }

      if (evaluationReadyForSignature && proposal.userId) {
        await tx.insert(userNotifications)
          .values({
            userId: proposal.userId,
            featureKey: "INSTALLATION_EVALUATION_READY",
            link: "/proposals",
            message: "ทีมงานได้อัปเดตค่าใช้จ่ายติดตั้งในใบเสนอราคาแล้ว กรุณาเข้าสู่ระบบเพื่อตรวจสอบยอดรวมและลงนามอนุมัติเอกสารฉบับสุดท้าย",
            isRead: false,
          });
      }

      return proposalUpdate;
    });

    await db.insert(activityLogs)
      .values({
        entityId: updatedProposal.id,
        entityType: "QUOTATION",
        action: revisionRequired || evaluationReadyForSignature ? "REVISION_REQUIRED" : "UPDATED",
        description: `${actor.name || actor.email || "Staff"} updated quotation scope and pricing matrix.`,
        userId: actor.id,
      });

    // Bonus UX: auto-inject system comment so the customer sees the update in the thread
    await addSystemComment(
      proposalId,
      "⚡ ระบบ: เจ้าหน้าที่ได้ทำการอัปเดตยอดรวมและปรับปรุงรายการสินค้าแล้ว"
    );

    let emailWarning: string | undefined;
    if (revisionRequired && proposal.user?.email) {
      const delivered = await sendDynamicQuotationRevisionEmail({
        proposalId: proposal.id,
        customerName: proposal.user?.name || "Unknown Customer",
        customerEmail: proposal.user.email,
        revisionNumber: nextRevisionNumber,
        totalPrice,
        crmUrl: `${getConfiguredAdminSiteUrl()}/th/admin/crm`,
        featureKey: "QUOTATION_REVISED",
      });

      if (!delivered) {
        emailWarning = "Revision notification email could not be delivered.";
      }
    }

    revalidatePath("/admin/crm");
    revalidatePath("/proposals");
    return {
      success: true,
      proposal: toFulfillmentProposalSnapshot(updatedProposal),
      warning: emailWarning,
      revisionBumped: revisionRequired,
    };
  } catch (error: unknown) {
    console.error("Failed to update revision matrix:", error);
    return { error: getPublicError(error, "Failed to update revision matrix.") };
  }
}
