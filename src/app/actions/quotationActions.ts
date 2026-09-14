"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activityLogs, consultationLeads, inboundRequests, proposals, userNotifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth-guard";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { getQuotationDocumentNo } from "@/lib/erpnext";
import { sendDiscordQuotationCancellationNotification } from "@/lib/discord";
import { sendDynamicQuotationCancellationEmail } from "@/lib/email";
import { issuePortalDispatchLink } from "@/lib/portalTokens";
import { getConfiguredAdminSiteUrl } from "@/lib/siteUrl";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { SALES_NOTIFICATION_TOPICS } from "@/lib/salesNotificationConfig";

type ErpnextBody = Record<string, unknown>;
type ErpnextJson = {
  data?: unknown;
  exception?: string;
  exc_type?: string;
  message?: string;
  messages?: unknown;
  server_messages?: string;
};

type ErpnextCancelResult = {
  attempted: boolean;
  success: boolean;
  quotationId: string | null;
  error?: string;
};

type ErpnextLostResult = {
  attempted: boolean;
  success: boolean;
  documentId: string | null;
  error?: string;
};

type OperationLogEntry = {
  event: string;
  message: string;
  timestamp: string;
  actor: string;
  erpnextQuotationId: string | null;
  erpnextCancellation: {
    attempted: boolean;
    success: boolean;
    error?: string;
  };
};

type ProposalWorkflowSnapshot = Pick<
  typeof proposals.$inferSelect,
  "id" | "status" | "dispatchStatus" | "configurationData" | "updatedAt" | "isArchived"
>;

const ERP_AUTH_HEADER = process.env.ERPNEXT_API_KEY && process.env.ERPNEXT_API_SECRET
  ? `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`
  : null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asInputJsonObject(value: unknown): Record<string, unknown> {
  return asRecord(value);
}

function asInputJsonArray(value: unknown): unknown[] {
  return asArray(value);
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? null;
}

function toProposalWorkflowSnapshot(proposal: typeof proposals.$inferSelect): ProposalWorkflowSnapshot {
  return {
    id: proposal.id,
    status: proposal.status,
    dispatchStatus: proposal.dispatchStatus,
    configurationData: proposal.configurationData,
    updatedAt: proposal.updatedAt,
    isArchived: proposal.isArchived,
  };
}

function extractErpnextQuotationId(proposal: {
  erpnextQuotationId: string | null;
  configurationData: unknown;
}) {
  const config = asRecord(proposal.configurationData);
  const erpSync = asRecord(config.erpSync);

  return firstString(
    proposal.erpnextQuotationId,
    config.erpnext_id,
    config.erpnextId,
    config.erpnextQuotationId,
    erpSync.erpnextQuotationId,
    erpSync.quotationId
  );
}

function isSendForApprovalStatus(status: string) {
  return ["DRAFT", "REVISION_REQUIRED"].includes(status.toUpperCase());
}

async function getErpnextBaseUrl() {
  const fromEnv = process.env.ERPNEXT_BASE_URL?.trim();
  const fromSettings = (await getSystemSetting("erpnext_site_endpoint"))?.trim();
  return (fromEnv || fromSettings || "").replace(/\/$/, "");
}

function getErpnextHeaders() {
  if (!ERP_AUTH_HEADER) {
    throw new Error("ERPNext auth configuration is missing. Set ERPNEXT_API_KEY and ERPNEXT_API_SECRET.");
  }

  return {
    "Content-Type": "application/json",
    Authorization: ERP_AUTH_HEADER,
  };
}

export async function sendQuotationForCustomerApproval(proposalId: string) {
  try {
    const actor = await requireStaff();

    if (!proposalId || typeof proposalId !== "string") {
      return { success: false, error: "A valid proposal ID is required." };
    }

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

    if (!proposal) {
      return { success: false, error: "Quotation not found." };
    }

    if (!isSendForApprovalStatus(proposal.status)) {
      return {
        success: false,
        error: `Quotation status ${proposal.status} cannot be sent for customer approval.`,
      };
    }

    const documentNo = getQuotationDocumentNo(proposal.id);

    const [updatedProposal] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(proposals)
        .set({
          status: "PENDING_CUSTOMER_SIGNATURE",
          configurationData: {
            ...asInputJsonObject(proposal.configurationData),
            customerApproval: {
              status: "PENDING_CUSTOMER_SIGNATURE",
              sentAt: new Date().toISOString(),
              sentBy: actor.id,
              documentNo,
            },
          },
        })
        .where(eq(proposals.id, proposal.id))
        .returning();

      await tx.insert(userNotifications)
        .values({
          userId: proposal.userId,
          featureKey: "QUOTATION_READY_FOR_APPROVAL",
          title: "ใบเสนอราคาพร้อมให้อนุมัติ",
          message: `ใบเสนอราคา ${documentNo} ได้รับการปรับปรุงและพร้อมให้คุณลงนามยืนยันแล้ว`,
          link: "/proposals",
          isRead: false,
        });

      await tx.insert(activityLogs)
        .values({
          entityId: proposal.id,
          entityType: "QUOTATION",
          action: "SENT_FOR_APPROVAL",
          description: `${actor.name || actor.email || "Staff"} sent quotation ${documentNo} to ${proposal.user?.name || proposal.user?.email || "customer"} for approval.`,
          userId: actor.id,
        });

      return [updated];
    });

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath("/proposals");

    await enqueueIntegrationEvent(db, {
      topic: SALES_NOTIFICATION_TOPICS.quotationReady,
      aggregateType: "PROPOSAL",
      aggregateId: proposal.id,
      payload: { source: "send_for_customer_approval" },
      dedupeKey: `sales.quotation.ready:${proposal.id}`,
    });
    await processOutboxBestEffort(proposal.id);

    return { success: true, proposal: toProposalWorkflowSnapshot(updatedProposal), documentNo };
  } catch (error: unknown) {
    console.error("[Send Quotation For Approval] failed:", error);
    return { success: false, error: "Failed to send quotation for approval." };
  }
}

async function erpnextRequest(method: "PUT" | "POST", endpoint: string, body: ErpnextBody): Promise<ErpnextJson> {
  const baseUrl = await getErpnextBaseUrl();
  if (!baseUrl) {
    throw new Error("ERPNext base URL is missing. Set ERPNEXT_BASE_URL or system setting erpnext_site_endpoint.");
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: getErpnextHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await response.json().catch(() => ({})) as ErpnextJson;
  if (!response.ok) {
    throw new Error(json.exception || json.message || `ERPNext responded with ${response.status}`);
  }

  return json;
}

export async function cancelErpnextQuotation(quotationId: string | null): Promise<ErpnextCancelResult> {
  if (!quotationId) {
    return {
      attempted: false,
      success: false,
      quotationId,
      error: "No ERPNext quotation reference found.",
    };
  }

  try {
    await erpnextRequest("PUT", `/api/resource/Quotation/${encodeURIComponent(quotationId)}`, {
      data: {
        docstatus: 2,
      },
    });

    return {
      attempted: true,
      success: true,
      quotationId,
    };
  } catch (error: unknown) {
    console.error("[Quotation Cancel Chain][ERPNext cancellation failed]", {
      proposalErpnextQuotationId: quotationId,
      error,
    });

    return {
      attempted: true,
      success: false,
      quotationId,
      error: "Failed to cancel ERPNext quotation.",
    };
  }
}

async function markErpnextDocumentLost(
  doctype: "Quotation" | "Lead",
  documentId: string | null,
  status: string,
): Promise<ErpnextLostResult> {
  if (!documentId) {
    return { attempted: false, success: false, documentId };
  }

  try {
    await erpnextRequest("PUT", `/api/resource/${doctype}/${encodeURIComponent(documentId)}`, {
      data: { status },
    });
    return { attempted: true, success: true, documentId };
  } catch (error: unknown) {
    console.error(`[Quotation Lost][ERPNext ${doctype} update failed]`, { documentId, error });
    return {
      attempted: true,
      success: false,
      documentId,
      error: `Failed to mark ERPNext ${doctype} as lost.`,
    };
  }
}

function buildLostConfigurationData(
  configurationData: unknown,
  quotationResult: ErpnextLostResult,
  leadResult: ErpnextLostResult,
): Record<string, unknown> {
  const config = asInputJsonObject(configurationData);
  const trackingMetadata = asInputJsonObject(config.trackingMetadata);
  const operationalLogs = asInputJsonArray(trackingMetadata.operationalLogs);
  const timestamp = new Date().toISOString();

  return {
    ...config,
    erpSync: {
      ...asInputJsonObject(config.erpSync),
      status: quotationResult.success ? "QUOTATION_LOST" : "LOCAL_LOST_ERP_SYNC_FAILED",
      lostAt: timestamp,
      erpnextQuotationId: quotationResult.documentId,
      erpnextLeadId: leadResult.documentId,
      quotationLostSyncError: quotationResult.error ?? null,
      leadLostSyncError: leadResult.error ?? null,
    },
    trackingMetadata: {
      ...trackingMetadata,
      operationalLogs: [
        ...operationalLogs,
        {
          event: "QUOTATION_LOST",
          message: "Quotation marked as lost by staff and synchronized to ERPNext.",
          timestamp,
          actor: "admin",
          erpnextQuotationId: quotationResult.documentId,
          erpnextQuotationLost: quotationResult,
          erpnextLeadLost: leadResult,
        },
      ],
    },
  };
}

export async function markQuotationLostChain(proposalId: string) {
  try {
    const actor = await requireStaff();
    if (!proposalId || typeof proposalId !== "string") {
      return { success: false, error: "A valid proposal ID is required." };
    }

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });
    if (!proposal) {
      return { success: false, error: "Quotation not found." };
    }
    if (["CANCELLED", "LOST", "FULLY_PAID"].includes(proposal.status.toUpperCase())) {
      return { success: false, error: `Quotation status ${proposal.status} cannot be marked as lost.` };
    }

    const quotationId = extractErpnextQuotationId(proposal);
    const [linkedLead, inboundRequest] = await Promise.all([
      proposal.wizardLeadId
        ? db.query.consultationLeads.findFirst({
          where: eq(consultationLeads.id, proposal.wizardLeadId),
          columns: { erpLeadId: true },
        })
        : Promise.resolve(null),
      db.query.inboundRequests.findFirst({
        where: eq(inboundRequests.quotationId, proposal.id),
        columns: { erpnextLeadId: true },
      }),
    ]);
    const erpnextLeadId = linkedLead?.erpLeadId ?? inboundRequest?.erpnextLeadId ?? null;

    const [quotationResult, leadResult] = await Promise.all([
      markErpnextDocumentLost("Quotation", quotationId, "Lost"),
      markErpnextDocumentLost("Lead", erpnextLeadId, "Do Not Contact"),
    ]);

    const [updatedProposal] = await db
      .update(proposals)
      .set({
        status: "LOST",
        configurationData: buildLostConfigurationData(
          proposal.configurationData,
          quotationResult,
          leadResult,
        ),
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    await db.insert(activityLogs).values({
      entityId: updatedProposal.id,
      entityType: "QUOTATION",
      action: "LOST",
      description: `${actor.name || actor.email || "Staff"} marked quotation ${updatedProposal.id} as lost.${quotationResult.success ? " ERPNext quotation updated." : " ERPNext quotation sync needs review."}`,
      userId: actor.id,
    });

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposalId}`);
    revalidatePath("/admin/quotations");
    revalidatePath("/proposals");

    const warning = [quotationResult, leadResult]
      .filter((result) => result.attempted && !result.success)
      .map((result) => result.error)
      .filter((value): value is string => Boolean(value))
      .join(" ");

    return {
      success: true,
      proposal: toProposalWorkflowSnapshot(updatedProposal),
      warning: warning || undefined,
    };
  } catch (error: unknown) {
    console.error("[Quotation Lost Chain]", error);
    return { success: false, error: "Failed to mark quotation as lost." };
  }
}

function buildCancelledConfigurationData(
  configurationData: unknown,
  erpnextQuotationId: string | null,
  erpnextCancellation: ErpnextCancelResult
): Record<string, unknown> {
  const config = asInputJsonObject(configurationData);
  const trackingMetadata = asInputJsonObject(config.trackingMetadata);
  const operationalLogs = asInputJsonArray(trackingMetadata.operationalLogs);
  const timestamp = new Date().toISOString();
  const logEntry: OperationLogEntry = {
    event: "QUOTATION_CANCELLED",
    message: "Document cancelled by admin, chains deployed to ERPNext successfully.",
    timestamp,
    actor: "admin",
    erpnextQuotationId,
    erpnextCancellation: {
      attempted: erpnextCancellation.attempted,
      success: erpnextCancellation.success,
      ...(erpnextCancellation.error ? { error: erpnextCancellation.error } : {}),
    },
  };

  return {
    ...config,
    erpSync: {
      ...asInputJsonObject(config.erpSync),
      status: erpnextCancellation.success ? "QUOTATION_CANCELLED" : "LOCAL_CANCELLED_ERP_CANCEL_FAILED",
      erpnextQuotationId,
      cancelledAt: timestamp,
      cancellationError: erpnextCancellation.error ?? null,
    },
    trackingMetadata: {
      ...trackingMetadata,
      operationalLogs: [...operationalLogs, logEntry],
    },
  };
}

export async function cancelQuotationChain(proposalId: string) {
  try {
    const actor = await requireStaff();

    if (!proposalId || typeof proposalId !== "string") {
      return { success: false, error: "A valid proposal ID is required." };
    }

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

    if (!proposal) {
      return { success: false, error: "Proposal not found." };
    }

    const erpnextQuotationId = extractErpnextQuotationId(proposal);
    const erpnextCancellation = await cancelErpnextQuotation(erpnextQuotationId);
    const auxiliaryWarnings: string[] = [];

    const [updatedProposal] = await db.update(proposals)
      .set({
        status: "CANCELLED",
        isArchived: true,
        configurationData: buildCancelledConfigurationData(
          proposal.configurationData,
          erpnextQuotationId,
          erpnextCancellation
        ),
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    await db.insert(activityLogs)
      .values({
        entityId: updatedProposal.id,
        entityType: "QUOTATION",
        action: "CANCELLED",
        description: `${actor.name || actor.email || "Staff"} cancelled quotation ${updatedProposal.id}.`,
        userId: actor.id,
      });

    try {
      await db.insert(userNotifications)
        .values({
          userId: updatedProposal.userId,
          link: "/proposals",
          message: `ใบเสนอราคา ${updatedProposal.id} ถูกยกเลิกโดยผู้ดูแลระบบ และเชื่อมต่อ ERPNext เรียบร้อยแล้ว`,
          isRead: false,
        });
    } catch (error: unknown) {
      auxiliaryWarnings.push("Failed to create user notification.");
      console.error("[Quotation Cancel Chain] User notification creation failed:", error);
    }

    revalidatePath("/admin/crm");
    revalidatePath("/admin/quotations");
    revalidatePath("/admin/tickets");
    revalidatePath("/proposals");

    void sendDiscordQuotationCancellationNotification({
      proposalId: updatedProposal.id,
      customerName: proposal.user?.name || "Unknown Customer",
      customerEmail: proposal.user?.email || "No email on record",
      systemSizeKwp: proposal.systemSizeKwp,
      totalPrice: proposal.totalPrice,
    }).then((delivered) => {
      if (!delivered) {
        console.warn("[Quotation Cancel Chain] Discord cancellation embed was not confirmed.");
      }
    }).catch((error: unknown) => {
      auxiliaryWarnings.push("Discord cancellation dispatch failed.");
      console.error("[Quotation Cancel Chain] Discord cancellation embed dispatch failed:", error);
    });

    void sendDynamicQuotationCancellationEmail({
      proposalId: updatedProposal.id,
      customerName: proposal.user?.name || "Unknown Customer",
      customerEmail: proposal.user?.email || "No email on record",
      systemSizeKwp: proposal.systemSizeKwp,
      totalPrice: proposal.totalPrice,
      crmUrl: `${getConfiguredAdminSiteUrl()}/th/admin/crm`,
    }).then((delivered) => {
      if (!delivered) {
        console.warn("[Quotation Cancel Chain] Email cancellation dispatch was not confirmed.");
      }
    }).catch((error: unknown) => {
      auxiliaryWarnings.push("Email cancellation dispatch failed.");
      console.error("[Quotation Cancel Chain] Email cancellation dispatch failed:", error);
    });

    return {
      success: true,
      proposal: toProposalWorkflowSnapshot(updatedProposal),
      erpnext: erpnextCancellation,
      warning: [
        erpnextCancellation.attempted && !erpnextCancellation.success ? erpnextCancellation.error : null,
        ...auxiliaryWarnings,
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ") || undefined,
    };
  } catch (error: unknown) {
    console.error("[Quotation Cancel Chain]:", error);
    return {
      success: false,
      error: "Failed to cancel quotation chain.",
    };
  }
}

export async function sendQuotationToCustomer(quotationId: string) {
  try {
    const actor = await requireStaff();

    if (!quotationId || typeof quotationId !== "string") {
      return { success: false, error: "A valid quotation ID is required." };
    }

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, quotationId),
      with: {
        user: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!proposal) {
      return { success: false, error: "Quotation not found." };
    }

    const documentNo = getQuotationDocumentNo(proposal.id);
    const currentStatus = proposal.status.toUpperCase();

    if (!["AWAITING_CLIENT_SIGNATURE", "AWAITING_CUSTOMER_SIGNATURE"].includes(currentStatus)) {
      return {
        success: false,
        error: `Quotation status ${proposal.status} is not ready for customer delivery.`,
      };
    }

    const magicLink = await issuePortalDispatchLink({
      proposalId: proposal.id,
      actorUserId: actor.id,
    });

    const [updatedProposal] = await db.transaction(async (tx) => {
      const currentConfig = asRecord(proposal.configurationData);
      const dispatch = asRecord(currentConfig.dispatch);
      const delivery = asRecord(currentConfig.delivery);
      const now = new Date().toISOString();
      const updatedConfig = {
        ...currentConfig,
        delivery: {
          ...delivery,
          isSentToCustomer: true,
          sentToCustomerAt: now,
          sentToCustomerBy: actor.id,
          portalPath: `/th/portal/${proposal.id}`,
          magicLink: null,
          deliveryChannel: "manual_staff_dispatch",
        },
        dispatch: {
          ...dispatch,
          status: "AWAITING_CLIENT_SIGNATURE",
          isSentToCustomer: true,
          sentToCustomerAt: now,
          magicLink: magicLink || dispatch.magicLink || null,
        },
      };

      const [updated] = await tx.update(proposals)
        .set({
          status: "AWAITING_CLIENT_SIGNATURE",
          configurationData: updatedConfig,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposal.id))
        .returning();

      if (proposal.userId) {
        await tx.insert(userNotifications)
          .values({
            userId: proposal.userId,
            featureKey: "QUOTATION_READY_FOR_APPROVAL",
            title: "ใบเสนอราคาพร้อมให้ลงนาม",
            message: `ใบเสนอราคา ${documentNo} พร้อมให้คุณตรวจสอบและลงนามดิจิทัลแล้ว`,
            link: "/proposals",
            isRead: false,
          });
      }

      await tx.insert(activityLogs)
        .values({
          entityId: proposal.id,
          entityType: "QUOTATION",
          action: "SENT_TO_CUSTOMER",
          description: `${actor.name || actor.email || "Staff"} marked quotation ${documentNo} as delivered to the customer portal.`,
          userId: actor.id,
        });

      return [updated];
    });

    revalidatePath("/proposals");
    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${quotationId}`);

    await enqueueIntegrationEvent(db, {
      topic: SALES_NOTIFICATION_TOPICS.quotationReady,
      aggregateType: "PROPOSAL",
      aggregateId: proposal.id,
      payload: { source: "send_to_customer" },
      dedupeKey: `sales.quotation.ready:${proposal.id}`,
    });
    await processOutboxBestEffort(proposal.id);

    return { success: true, proposal: toProposalWorkflowSnapshot(updatedProposal), magicLink };
  } catch (error: unknown) {
    console.error("Failed to send quotation to customer:", error);
    return { success: false, error: "Failed to send quotation to customer." };
  }
}

async function approveErpnextQuotation(quotationId: string | null) {
  if (!quotationId) {
    return { attempted: false, success: false, error: "No ERPNext quotation ID found." };
  }

  try {
    await erpnextRequest("PUT", `/api/resource/Quotation/${encodeURIComponent(quotationId)}`, {
      data: {
        status: "Approved",
        workflow_state: "Approved",
      },
    });

    return { attempted: true, success: true };
  } catch (error: unknown) {
    console.error("[Confirm Signed Contract][ERPNext approval failed]", { quotationId, error });
    return { attempted: true, success: false, error: "Failed to approve ERPNext quotation." };
  }
}

export async function confirmSignedContractAndCloseDeal(proposalId: string) {
  try {
    const actor = await requireStaff();

    if (!proposalId || typeof proposalId !== "string") {
      return { success: false, error: "A valid proposal ID is required." };
    }

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });

    if (!proposal) {
      return { success: false, error: "Quotation not found." };
    }

    if (proposal.status.toUpperCase() === "FULLY_SIGNED") {
      return { success: true, proposal: toProposalWorkflowSnapshot(proposal), erpnext: { attempted: false, success: true } };
    }

    if (proposal.status.toUpperCase() !== "CLIENT_SIGNED_PENDING_REVIEW") {
      return {
        success: false,
        error: `Quotation status ${proposal.status} is not ready for final admin confirmation.`,
      };
    }

    const erpnextQuotationId = extractErpnextQuotationId(proposal);
    const erpnext = await approveErpnextQuotation(erpnextQuotationId);
    const config = asInputJsonObject(proposal.configurationData);
    const now = new Date().toISOString();

    const [updatedProposal] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(proposals)
        .set({
          status: "FULLY_SIGNED",
          dispatchStatus: "SIGNED",
          signedAt: proposal.signedAt || new Date(),
          configurationData: {
            ...config,
            dispatch: {
              ...asInputJsonObject(config.dispatch),
              status: "FULLY_SIGNED",
              adminConfirmedAt: now,
              adminConfirmedBy: actor.id,
            },
            erpSync: {
              ...asInputJsonObject(config.erpSync),
              approvalAttemptedAt: now,
              approvalStatus: erpnext.success ? "APPROVED" : "APPROVAL_FAILED",
              approvalError: erpnext.error ?? null,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposal.id))
        .returning();

      await tx.insert(activityLogs)
        .values({
          entityId: proposal.id,
          entityType: "QUOTATION",
          action: "SIGNED_CONTRACT_CONFIRMED",
          description: `${actor.name || actor.email || "Staff"} confirmed the signed contract and advanced the deal to FULLY_SIGNED.`,
          userId: actor.id,
        });

      return [updated];
    });

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath("/admin/tickets");
    revalidatePath("/proposals");

    return {
      success: true,
      proposal: toProposalWorkflowSnapshot(updatedProposal),
      erpnext,
      warning: erpnext.attempted && !erpnext.success ? erpnext.error : undefined,
    };
  } catch (error: unknown) {
    console.error("[Confirm Signed Contract]:", error);
    return {
      success: false,
      error: "Failed to confirm signed contract.",
    };
  }
}
