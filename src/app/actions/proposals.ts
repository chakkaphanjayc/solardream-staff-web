"use server";

import { db } from "@/db";
import {
  activityLogs,
  consultationLeads,
  installationJobTickets,
  jobWorkflows,
  leads,
  proposals,
  users,
  userNotifications,
  verifiedSlips,
  workflowStages,
  workflowTemplates,
  signatureAuditTrails,
} from "@/db/schema";
import { headers } from "next/headers";
import crypto from "crypto";
import { eq, desc, inArray, ne, and, asc, isNull, sql } from "drizzle-orm";
import { requireStaff, requireAdmin } from "@/lib/auth-guard";
import {
  sendDiscordProposalApprovalNotification,
  sendDiscordProposalSignedNotification,
  sendDiscordQuotationNegotiationAlert,
} from "@/lib/discord";
import {
  getOrCreateErpnextCustomerForUser,
  getQuotationDocumentNo,
} from "@/lib/erpnext";
import {
  FULFILLMENT_INSTALLATION,
  FULFILLMENT_PURCHASE_ONLY,
  type FulfillmentType,
} from "@/lib/fulfillment";
import { createClient, createAdminClient } from "@/utils/supabase/server";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { revalidatePath } from "next/cache";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";
import { getStaffProposalVisibility } from "@/lib/developerAccess";
import { deleteLinkedSalesRecords } from "@/lib/salesPipelineDeletion";

const MAX_CONTRACT_DOCUMENT_BYTES = 20 * 1024 * 1024;
const CONTRACT_DOCUMENT_FILE_KINDS: readonly UploadFileKind[] = [
  "pdf",
  "jpeg",
  "png",
  "webp",
  "heic",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
      return value;

    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return 0;
}

type ProposalRecord = {
  id: string;
  status: string;
  createdAt: Date;
  requestType?: string | null;
};

type ProposalActionSnapshot = Pick<
  typeof proposals.$inferSelect,
  | "id"
  | "status"
  | "dispatchStatus"
  | "configurationData"
  | "updatedAt"
  | "isArchived"
>;

type CustomerProposalActionResult =
  | { success: true; proposal: ProposalActionSnapshot }
  | { error: string };

function toProposalActionSnapshot(
  proposal: typeof proposals.$inferSelect,
): ProposalActionSnapshot {
  return {
    id: proposal.id,
    status: proposal.status,
    dispatchStatus: proposal.dispatchStatus,
    configurationData: proposal.configurationData,
    updatedAt: proposal.updatedAt,
    isArchived: proposal.isArchived,
  };
}

const EXPIRABLE_PROPOSAL_STATUSES = new Set(["DRAFT", "PENDING"]);

async function getQuotationExpirationDays() {
  const raw = await getSystemSetting("quotation_expiration_days");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

function isExpiredProposal(
  proposal: ProposalRecord,
  expirationDays: number,
  now = new Date(),
) {
  if (proposal.requestType?.toLowerCase() === "service") {
    return false;
  }

  const normalizedStatus = proposal.status.toUpperCase();
  if (!EXPIRABLE_PROPOSAL_STATUSES.has(normalizedStatus)) {
    return false;
  }

  const expiresAt = new Date(proposal.createdAt);
  expiresAt.setDate(expiresAt.getDate() + expirationDays);
  return now.getTime() > expiresAt.getTime();
}

async function expireProposalIfNeeded<
  T extends ProposalRecord & Record<string, unknown>,
>(proposal: T) {
  const expirationDays = await getQuotationExpirationDays();
  if (!isExpiredProposal(proposal, expirationDays)) {
    return proposal;
  }

  if (proposal.status.toUpperCase() === "EXPIRED") {
    return proposal;
  }

  await db
    .update(proposals)
    .set({ status: "EXPIRED" })
    .where(eq(proposals.id, proposal.id));

  return { ...proposal, status: "EXPIRED" } as T;
}

async function expireProposalsIfNeeded<
  T extends ProposalRecord & Record<string, unknown>,
>(proposalsList: T[]) {
  if (!proposalsList.length) return proposalsList;

  const expirationDays = await getQuotationExpirationDays();
  const now = new Date();
  const expiredIds = proposalsList
    .filter((proposal) => isExpiredProposal(proposal, expirationDays, now))
    .map((proposal) => proposal.id);

  if (expiredIds.length > 0) {
    await db
      .update(proposals)
      .set({ status: "EXPIRED" })
      .where(inArray(proposals.id, expiredIds));
  }

  return proposalsList.map((proposal) =>
    expiredIds.includes(proposal.id)
      ? ({ ...proposal, status: "EXPIRED" } as T)
      : proposal,
  );
}

async function attachUnclaimedConsultationLeadsToUser(
  userId: string,
  email?: string | null,
) {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) return;

  await db
    .update(consultationLeads)
    .set({ userId })
    .where(
      and(
        isNull(consultationLeads.userId),
        sql`lower(${consultationLeads.email}) = ${cleanEmail}`,
      ),
    );
}

async function ensureProposalRowsForConsultationLeads(
  userId: string,
  email?: string | null,
) {
  await attachUnclaimedConsultationLeadsToUser(userId, email);

  const leads = await db.query.consultationLeads.findMany({
    where: eq(consultationLeads.userId, userId),
    orderBy: [desc(consultationLeads.createdAt)],
  });

  if (leads.length === 0) return;

  const leadIds = leads.map((lead) => lead.id);
  const existingRows = await db.query.proposals.findMany({
    where: inArray(proposals.wizardLeadId, leadIds),
    columns: {
      wizardLeadId: true,
    },
  });
  const existingLeadIds = new Set(
    existingRows.map((row) => row.wizardLeadId).filter(Boolean),
  );
  const missingLeads = leads.filter((lead) => !existingLeadIds.has(lead.id));

  if (missingLeads.length === 0) return;

  await db.insert(proposals).values(
    missingLeads.map((lead) => {
      const rawPayload = asRecord(lead.rawPayload);
      const systemProfile = asRecord(rawPayload.systemProfile);
      const dynamicCalculations = asRecord(lead.dynamicCalculations);
      const profile =
        Object.keys(systemProfile).length > 0
          ? systemProfile
          : dynamicCalculations;
      const panelEstimate = asRecord(profile.approxPanels);
      const systemSizeKwp = readPositiveNumber(
        profile.systemSizeKwp,
        profile.systemPackageSizeKwp,
        lead.targetSystemSize,
      );
      const panelCount = Math.round(
        readPositiveNumber(
          profile.panelCount,
          panelEstimate.max,
          panelEstimate.min,
        ),
      );
      const totalPrice = readPositiveNumber(
        profile.totalPrice,
        profile.estimatedBudget,
        profile.systemPackagePrice,
      );
      const monthlySavings = readPositiveNumber(
        profile.monthlySavings,
        profile.estimatedMonthlySavings,
        profile.calculatedMonthlySavings,
      );
      const paybackPeriod = readPositiveNumber(
        profile.paybackPeriodYears,
        profile.paybackPeriod,
      );

      return {
        userId,
        systemSizeKwp,
        panelCount,
        totalPrice,
        monthlySavings,
        paybackPeriod: paybackPeriod > 0 ? paybackPeriod.toFixed(1) : "TBD",
        status: "PENDING_QUOTE",
        wizardLeadId: lead.id,
        fulfillmentType: "INSTALLATION" as const,
        configurationData: {
          requestType: "WIZARD_SUMMARY_CONSULTATION",
          pendingStaffQuotation: true,
          sourceConsultationLeadId: lead.id,
          targetSystemSize: lead.targetSystemSize,
          systemType: lead.systemType,
          addOns: lead.addOns,
          customerContact: {
            name: lead.customerName,
            email: lead.email,
            phone: lead.phone,
            postalCode: lead.postalCode,
          },
          customerNotes: lead.customerNotes,
          systemProfile: profile,
          rawPayload,
          dynamicCalculations,
        },
      };
    }),
  );
}

async function ensureProposalRowsForLegacyBuildLeads(
  userId: string,
  email?: string | null,
) {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) return;

  const [leadRows, userProposalRows, consultationLeadRows] = await Promise.all([
    db.query.leads.findMany({
      where: sql`lower(${leads.email}) = ${cleanEmail}`,
      orderBy: [desc(leads.createdAt)],
    }),
    db.query.proposals.findMany({
      where: eq(proposals.userId, userId),
      columns: {
        id: true,
        totalPrice: true,
        createdAt: true,
        configurationData: true,
      },
    }),
    db.query.consultationLeads.findMany({
      where: sql`lower(${consultationLeads.email}) = ${cleanEmail}`,
      columns: {
        legacyLeadId: true,
      },
    }),
  ]);

  if (leadRows.length === 0) return;

  const consultationLegacyLeadIds = new Set(
    consultationLeadRows
      .map((lead) => lead.legacyLeadId)
      .filter((leadId): leadId is string => Boolean(leadId)),
  );

  const existingSourceLeadIds = new Set<string>();
  for (const proposal of userProposalRows) {
    const config = asRecord(proposal.configurationData);
    const sourceLeadId = config.sourceLeadId;
    if (typeof sourceLeadId === "string" && sourceLeadId) {
      existingSourceLeadIds.add(sourceLeadId);
    }
  }

  const missingLeads = leadRows.filter((lead) => {
    if (
      consultationLegacyLeadIds.has(lead.id) ||
      existingSourceLeadIds.has(lead.id)
    ) {
      return false;
    }

    const snapshot = asRecord(lead.configurationSnapshot);
    const totalPrice = readPositiveNumber(snapshot.totalPrice);
    const leadCreatedAt = new Date(lead.createdAt).getTime();
    const hasLikelyExistingProposal = userProposalRows.some((proposal) => {
      const proposalCreatedAt = new Date(proposal.createdAt).getTime();
      const createdCloseTogether =
        Math.abs(proposalCreatedAt - leadCreatedAt) <= 10 * 60 * 1000;
      const samePrice =
        totalPrice > 0 && Math.abs(proposal.totalPrice - totalPrice) < 1;
      return createdCloseTogether && samePrice;
    });

    return !hasLikelyExistingProposal;
  });

  if (missingLeads.length === 0) return;

  await db.insert(proposals).values(
    missingLeads.map((lead) => {
      const snapshot = asRecord(lead.configurationSnapshot);
      const erpSync = asRecord(snapshot.erpSync);
      const boundErpnextCustomerId =
        typeof erpSync.erpnextCustomerId === "string"
          ? erpSync.erpnextCustomerId.trim()
          : typeof erpSync.erpCustomerId === "string"
            ? erpSync.erpCustomerId.trim()
            : "";
      const requiresInstallation =
        snapshot.requiresInstallation === true ||
        snapshot.fulfillmentType === FULFILLMENT_INSTALLATION ||
        snapshot.routingBranch === FULFILLMENT_INSTALLATION;
      const fulfillmentType: FulfillmentType = requiresInstallation
        ? FULFILLMENT_INSTALLATION
        : FULFILLMENT_PURCHASE_ONLY;
      const leadStatus = String(lead.status || "").toUpperCase();
      const status =
        leadStatus === "NEW" || leadStatus === "PENDING"
          ? "PENDING_QUOTE"
          : lead.status || "PENDING_QUOTE";

      return {
        userId,
        systemSizeKwp: readPositiveNumber(
          snapshot.systemkWp,
          snapshot.systemSizeKwp,
        ),
        panelCount: Math.round(readPositiveNumber(snapshot.panelCount)),
        totalPrice: readPositiveNumber(snapshot.totalPrice),
        monthlySavings: readPositiveNumber(
          snapshot.estimatedSavings,
          snapshot.monthlySavings,
        ),
        paybackPeriod: String(snapshot.paybackPeriod || "TBD"),
        pdfUrl: null,
        erpnextCustomerId: boundErpnextCustomerId || null,
        erpnextCustomerBoundAt: boundErpnextCustomerId ? new Date() : null,
        erpnextCustomerBindingSource: boundErpnextCustomerId
          ? "LEAD_RECOVERY"
          : null,
        status,
        fulfillmentType,
        configurationData: {
          ...snapshot,
          sourceLeadId: lead.id,
          recoveredFromLeadEmail: true,
          pendingEvaluation:
            requiresInstallation || snapshot.pendingEvaluation === true,
          routingBranch: fulfillmentType,
          leadContact: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            location: lead.location,
          },
        },
      };
    }),
  );
}

export async function saveProposal(data: {
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  monthlySavings: number;
  paybackPeriod: string;
  pdfUrl?: string | null;
  status?: string;
  configurationData: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
    }

    const activeProfile = await db.query.users.findFirst({
      where: and(
        eq(users.id, user.id),
        eq(users.isActive, true),
        isNull(users.anonymizedAt),
        isNull(users.deletionRequestedAt),
      ),
      columns: { id: true },
    });
    if (!activeProfile) return { error: "Account is inactive" };

    const [proposal] = await db
      .insert(proposals)
      .values({
        userId: user.id,
        systemSizeKwp: data.systemSizeKwp,
        panelCount: data.panelCount,
        totalPrice: data.totalPrice,
        monthlySavings: data.monthlySavings,
        paybackPeriod: data.paybackPeriod,
        pdfUrl: data.pdfUrl || null,
        status: data.status || "DRAFT",
        configurationData: data.configurationData,
      })
      .returning();

    return { success: true, proposal };
  } catch (error: unknown) {
    console.error("Failed to save proposal:", error);
    return { error: "Failed to save proposal" };
  }
}

export async function getUserProposals() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
    }

    await ensureProposalRowsForConsultationLeads(user.id, user.email);
    await ensureProposalRowsForLegacyBuildLeads(user.id, user.email);

    const proposalsList = await db.query.proposals.findMany({
      where: eq(proposals.userId, user.id),
      orderBy: [desc(proposals.createdAt)],
      with: {
        user: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
    });
    const proposalIds = proposalsList.map((proposal) => proposal.id);
    const [jobTickets, paymentSlips] =
      proposalIds.length > 0
        ? await Promise.all([
            db.query.installationJobTickets.findMany({
              where: inArray(installationJobTickets.quotationId, proposalIds),
              columns: {
                quotationId: true,
                installerId: true,
                scheduledDate: true,
                status: true,
              },
            }),
            db.query.verifiedSlips.findMany({
              where: inArray(verifiedSlips.orderId, proposalIds),
              columns: {
                id: true,
                orderId: true,
                slipImageUrl: true,
                verifiedAt: true,
              },
              orderBy: [desc(verifiedSlips.verifiedAt)],
            }),
          ])
        : [[], []];
    const installerIds = [
      ...new Set(
        jobTickets
          .map((ticket) => ticket.installerId)
          .filter((installerId): installerId is string => Boolean(installerId)),
      ),
    ];
    const installers =
      installerIds.length > 0
        ? await db.query.users.findMany({
            where: inArray(users.id, installerIds),
            columns: { id: true, name: true, email: true },
          })
        : [];
    const installerById = new Map(
      installers.map((installer) => [installer.id, installer]),
    );
    const ticketByProposalId = new Map(
      jobTickets.map((ticket) => [ticket.quotationId, ticket]),
    );
    const slipsByProposalId = new Map<string, typeof paymentSlips>();
    for (const slip of paymentSlips) {
      const existing = slipsByProposalId.get(slip.orderId) || [];
      existing.push(slip);
      slipsByProposalId.set(slip.orderId, existing);
    }

    const enrichedProposals = proposalsList.map((proposal) => {
      const ticket = ticketByProposalId.get(proposal.id);
      const installer = ticket?.installerId
        ? installerById.get(ticket.installerId)
        : null;

      return {
        ...proposal,
        projectHub: {
          engineerName: installer?.name || installer?.email || null,
          estimatedDate: ticket?.scheduledDate || null,
          jobStatus: ticket?.status || null,
          verifiedSlips: (slipsByProposalId.get(proposal.id) || []).map(
            (slip) => ({
              id: slip.id,
              url: slip.slipImageUrl,
              verifiedAt: slip.verifiedAt,
            }),
          ),
        },
      };
    });

    return {
      success: true,
      proposals: await expireProposalsIfNeeded(
        enrichedProposals as Array<ProposalRecord & Record<string, unknown>>,
      ),
    };
  } catch (error: unknown) {
    console.error("Failed to fetch user proposals:", error);
    return { error: "Failed to fetch user proposals" };
  }
}

export async function getCustomerProposalById(proposalId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
    }

    const proposal = await db.query.proposals.findFirst({
      where: and(eq(proposals.id, proposalId), eq(proposals.userId, user.id)),
      with: {
        user: {
          columns: {
            name: true,
            fullName: true,
            email: true,
            phoneNumber: true,
          },
        },
        selectedFinancing: true,
      },
    });

    if (!proposal) {
      return { error: "Proposal not found" };
    }

    return {
      success: true,
      proposal: await expireProposalIfNeeded(
        proposal as ProposalRecord & Record<string, unknown>,
      ),
    };
  } catch (error: unknown) {
    console.error("Failed to fetch customer proposal:", error);
    return { error: "Failed to fetch proposal" };
  }
}

async function notifyStaffAboutProposal(input: {
  proposalId: string;
  title: string;
  message: string;
  featureKey: string;
}) {
  const staffUsers = await db.query.users.findMany({
    where: inArray(users.role, ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"]),
    columns: { id: true },
  });

  if (staffUsers.length === 0) {
    return;
  }

  await db.insert(userNotifications).values(
    staffUsers.map((staffUser) => ({
      userId: staffUser.id,
      featureKey: input.featureKey,
      title: input.title,
      message: input.message,
      link: `/admin/crm/${input.proposalId}`,
      isRead: false,
    })),
  );
}

export async function approveFinalizedProposal(
  proposalId: string,
): Promise<CustomerProposalActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
    }

    const proposal = await db.query.proposals.findFirst({
      where: and(eq(proposals.id, proposalId), eq(proposals.userId, user.id)),
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
      return { error: "Proposal not found" };
    }

    if (
      ["CANCELLED", "DEACTIVATED", "EXPIRED"].includes(
        proposal.status.toUpperCase(),
      )
    ) {
      return {
        error: `Proposal status ${proposal.status} cannot be approved.`,
      };
    }

    const approvedAt = new Date().toISOString();
    const documentNo = getQuotationDocumentNo(proposal.id);
    const configurationData = {
      ...((proposal.configurationData as Record<string, unknown>) || {}),
      customerApproval: {
        status: "CUSTOMER_APPROVED",
        approvedAt,
        source: "client-approval-view",
      },
    };

    const [updatedProposal] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(proposals)
        .set({
          status: "CUSTOMER_APPROVED",
          configurationData,
        })
        .where(eq(proposals.id, proposal.id))
        .returning();

      await tx.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: "CUSTOMER_APPROVED",
        description: `${proposal.user?.name || proposal.user?.email || user.email || "Customer"} approved finalized quotation ${documentNo}.`,
        userId: user.id,
      });

      return [updated];
    });

    await notifyStaffAboutProposal({
      proposalId: proposal.id,
      featureKey: "PROPOSAL_CUSTOMER_APPROVED",
      title: "Customer approved quotation",
      message: `${proposal.user?.name || proposal.user?.email || user.email || "Customer"} approved ${documentNo}.`,
    });

    void sendDiscordProposalApprovalNotification({
      proposalId: proposal.id,
      customerName:
        proposal.user?.name ||
        proposal.user?.email ||
        user.email ||
        "Unknown Customer",
      documentNo,
      totalPrice: updatedProposal.totalPrice,
    }).catch((error) => {
      console.error("Failed to send Discord approval notification:", error);
    });

    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposal.id}`);
    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposal.id}`);
    return {
      success: true,
      proposal: toProposalActionSnapshot(updatedProposal),
    };
  } catch (error: unknown) {
    console.error("Failed to approve finalized proposal:", error);
    return { error: "Failed to approve finalized proposal" };
  }
}

export async function requestFinalizedProposalModification(
  proposalId: string,
  comments: string,
): Promise<CustomerProposalActionResult> {
  try {
    const cleanComments = comments.trim();
    if (cleanComments.length < 3) {
      return { error: "Please describe the requested modification." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
    }

    const proposal = await db.query.proposals.findFirst({
      where: and(eq(proposals.id, proposalId), eq(proposals.userId, user.id)),
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
      return { error: "Proposal not found" };
    }

    const requestedAt = new Date().toISOString();
    const documentNo = getQuotationDocumentNo(proposal.id);
    const currentConfig =
      (proposal.configurationData as Record<string, unknown>) || {};
    const modificationRequests = Array.isArray(
      currentConfig.modificationRequests,
    )
      ? currentConfig.modificationRequests
      : [];
    const configurationData = {
      ...currentConfig,
      customerApproval: {
        status: "MODIFICATION_REQUESTED",
        requestedAt,
        source: "client-approval-view",
      },
      modificationRequests: [
        ...modificationRequests,
        {
          comments: cleanComments,
          requestedAt,
          requestedBy: user.id,
        },
      ],
    };

    const [updatedProposal] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(proposals)
        .set({
          status: "MODIFICATION_REQUESTED",
          configurationData,
        })
        .where(eq(proposals.id, proposal.id))
        .returning();

      await tx.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: "MODIFICATION_REQUESTED",
        description: `${proposal.user?.name || proposal.user?.email || user.email || "Customer"} requested quotation changes for ${documentNo}: ${cleanComments}`,
        userId: user.id,
      });

      return [updated];
    });

    await notifyStaffAboutProposal({
      proposalId: proposal.id,
      featureKey: "PROPOSAL_MODIFICATION_REQUESTED",
      title: "Customer requested quotation changes",
      message: `${proposal.user?.name || proposal.user?.email || user.email || "Customer"} requested changes for ${documentNo}.`,
    });

    void sendDiscordQuotationNegotiationAlert({
      proposalId: proposal.id,
      documentNo,
      customerName:
        proposal.user?.name ||
        proposal.user?.email ||
        user.email ||
        "Unknown Customer",
      message: cleanComments,
    }).catch((error) => {
      console.error("Failed to send Discord modification notification:", error);
    });

    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposal.id}`);
    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposal.id}`);
    return {
      success: true,
      proposal: toProposalActionSnapshot(updatedProposal),
    };
  } catch (error: unknown) {
    console.error("Failed to request finalized proposal modification:", error);
    return { error: "Failed to request finalized proposal modification" };
  }
}

export async function getAllProposals() {
  try {
    const proposalsList = await db.query.proposals.findMany({
      orderBy: [desc(proposals.createdAt)],
      with: {
        user: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      success: true,
      proposals: await expireProposalsIfNeeded(
        proposalsList as Array<ProposalRecord & Record<string, unknown>>,
      ),
    };
  } catch (error: unknown) {
    console.error("Failed to fetch all proposals:", error);
    return { error: "Failed to fetch all proposals" };
  }
}

export async function getCrmProposals(options?: { isArchived?: boolean }) {
  try {
    const actor = await requireStaff();
    const isArchived = options?.isArchived === true;
    const baseWhereClause = isArchived
      ? eq(proposals.isArchived, true)
      : and(eq(proposals.isArchived, false), ne(proposals.status, "DRAFT"));
    const visibility = await getStaffProposalVisibility(actor.id, "crm");
    if (visibility?.mode === "NONE") return { success: true, proposals: [] };
    const whereClause = visibility?.mode === "OWN" && "condition" in visibility
      ? and(baseWhereClause, visibility.condition)
      : baseWhereClause;

    const proposalsList = await db.query.proposals.findMany({
      where: whereClause,
      orderBy: [desc(proposals.createdAt)],
      with: {
        user: {
          columns: {
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        paymentMilestones: true,
      },
    });

    return {
      success: true,
      proposals: await expireProposalsIfNeeded(
        proposalsList as Array<ProposalRecord & Record<string, unknown>>,
      ),
    };
  } catch (error: unknown) {
    console.error("Failed to fetch CRM proposals:", error);
    return { error: "Failed to fetch CRM proposals" };
  }
}

export async function updateProposalSurvey(
  proposalId: string,
  data: {
    surveyDate?: string | Date | null;
    surveyNotes?: string | null;
  },
) {
  try {
    await requireStaff();

    const [proposal] = await db
      .update(proposals)
      .set({
        surveyDate: data.surveyDate ? new Date(data.surveyDate) : null,
        surveyNotes: data.surveyNotes || null,
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    revalidatePath("/admin/crm");
    revalidatePath("/proposals");
    return { success: true, proposal };
  } catch (error: unknown) {
    console.error("Failed to update proposal survey:", error);
    return { error: "Failed to update proposal survey" };
  }
}

export async function getProposalWithExpiration<
  T extends ProposalRecord & Record<string, unknown>,
>(proposal: T | null) {
  if (!proposal) return proposal;
  return expireProposalIfNeeded(proposal);
}

export async function approveProposalRevision(proposalId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
    }

    const proposal = await db.query.proposals.findFirst({
      where: and(eq(proposals.id, proposalId), eq(proposals.userId, user.id)),
    });

    if (!proposal) {
      return { error: "Proposal not found" };
    }

    if (!proposal.revisedPdfUrl) {
      return { error: "No revised quotation is available for this proposal" };
    }

    const configurationData = {
      ...((proposal.configurationData as Record<string, unknown>) || {}),
      revisionApprovedAt: new Date().toISOString(),
    };

    const [updatedProposal] = await db
      .update(proposals)
      .set({
        status: "SIGNED",
        configurationData,
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    revalidatePath("/proposals");
    revalidatePath("/admin/crm");
    return {
      success: true,
      proposal: toProposalActionSnapshot(updatedProposal),
    };
  } catch (error: unknown) {
    console.error("Failed to approve proposal revision:", error);
    return { error: "Failed to approve revision" };
  }
}

export async function deactivateProposalsForProducts(productIds: string[]) {
  try {
    if (!productIds || productIds.length === 0)
      return { success: true, count: 0 };

    // 1. Fetch active proposals
    const activeProposals = await db.query.proposals.findMany({
      where: inArray(proposals.status, [
        "DRAFT",
        "SENT",
        "VIEWED",
        "draft",
        "sent",
        "viewed",
      ]),
    });

    let deactivatedCount = 0;

    for (const proposal of activeProposals) {
      const config =
        (proposal.configurationData as Record<string, unknown>) || {};
      const items = Array.isArray(config.items) ? config.items : [];

      const isAffected = items.some((item) => {
        const record =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {};
        return (
          typeof record.productId === "string" &&
          productIds.includes(record.productId)
        );
      });

      if (isAffected) {
        // 2. Append history event
        const history = Array.isArray(config.history) ? config.history : [];
        history.push({
          event: "DEACTIVATED",
          timestamp: new Date().toISOString(),
          description:
            "เอกสารนี้ถูกยกเลิกเนื่องจากอุปกรณ์ต้นทางมีการเปลี่ยนแปลงสเปคหรือราคาในคลังสินค้า",
        });

        const updatedConfig = {
          ...config,
          history,
        };

        // 3. Update proposal status and configuration data
        await db
          .update(proposals)
          .set({
            status: "DEACTIVATED",
            configurationData: updatedConfig,
          })
          .where(eq(proposals.id, proposal.id));

        // 4. Create UserNotification
        const message = `⚠️ ใบเสนอราคาเลขที่ ${proposal.id} ของคุณถูกยกเลิกเนื่องจากมีการอัปเดตสเปคและราคาอุปกรณ์โซล่าเซลล์ชิ้นใหม่ในระบบ กรุณากดกลับเข้าสู่หน้า Build เพื่อขอเอกสารชุดใหม่ที่คุ้มค่ากว่าเดิม`;
        await db.insert(userNotifications).values({
          userId: proposal.userId,
          message,
          link: "/proposals",
          isRead: false,
        });

        deactivatedCount++;
      }
    }

    return { success: true, count: deactivatedCount };
  } catch (error: unknown) {
    console.error("Failed to deactivate proposals for products:", error);
    return { error: "Failed to deactivate proposals" };
  }
}

export async function submitCustomerSignature(
  proposalId: string,
  signatureBase64: string,
) {
  try {
    if (!signatureBase64) {
      return { error: "Signature is required" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
    }

    const proposal = await db.query.proposals.findFirst({
      where: and(eq(proposals.id, proposalId), eq(proposals.userId, user.id)),
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
      return { error: "Proposal not found or access denied" };
    }

    // Decode and upload signature to supabase storage
    const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const sigFileName = `signature-client-${proposal.id}-${Date.now()}.png`;
    const sigFilePath = `signatures/${sigFileName}`;
    const bucket = "proposals";
    const supabaseAdmin = createAdminClient();

    const sigUploadResult = await supabaseAdmin.storage
      .from(bucket)
      .upload(sigFilePath, buffer, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: true,
      });

    if (sigUploadResult.error) {
      console.error("Signature upload failed:", sigUploadResult.error);
      return { error: "Failed to upload signature." };
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(bucket).getPublicUrl(sigFilePath);

    const configurationData = {
      ...((proposal.configurationData as Record<string, unknown>) || {}),
      signatureUrl: publicUrl,
      signedAt: new Date().toISOString(),
    };

    const [updatedProposal] = await db
      .update(proposals)
      .set({
        status: "SIGNED",
        signatureUrl: publicUrl,
        signedAt: new Date(),
        configurationData,
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    // Generate proposal document data hash for audit log integrity validation
    const proposalDataString = JSON.stringify({
      id: proposal.id,
      systemSizeKwp: proposal.systemSizeKwp,
      panelCount: proposal.panelCount,
      totalPrice: proposal.totalPrice,
      monthlySavings: proposal.monthlySavings,
      paybackPeriod: proposal.paybackPeriod,
      configurationData: proposal.configurationData,
    });
    const documentHash = crypto
      .createHash("sha256")
      .update(proposalDataString)
      .digest("hex");

    // Extract request headers for IP and User-Agent
    const headersList = await headers();
    const rawIp = headersList.get("x-forwarded-for") || "127.0.0.1";
    const signerIpAddress = rawIp.split(",")[0].trim();
    const signerUserAgent = headersList.get("user-agent") || "unknown";

    // Insert signature audit trail record
    await db.insert(signatureAuditTrails).values({
      proposalId: proposal.id,
      signatureUrl: publicUrl,
      signerIpAddress,
      signerUserAgent,
      documentHash,
    });

    const config =
      (updatedProposal.configurationData as Record<string, unknown>) || {};
    const requiresInstallation =
      config.branch === "INSTALLATION" ||
      config.requiresInstallation === true ||
      updatedProposal.fulfillmentType === "INSTALLATION";

    if (requiresInstallation) {
      const jobTicket = await db.transaction(async (tx) => {
        const [createdTicket] = await tx
          .insert(installationJobTickets)
          .values({
            quotationId: updatedProposal.id,
            jobType: "INSTALLATION",
            status: "PENDING_ASSIGNMENT",
          })
          .onConflictDoNothing({
            target: installationJobTickets.quotationId,
          })
          .returning();

        const ticket =
          createdTicket ||
          (await tx.query.installationJobTickets.findFirst({
            where: eq(installationJobTickets.quotationId, updatedProposal.id),
          }));
        if (!ticket)
          throw new Error("Failed to initialize installation job ticket.");

        const existingWorkflow = await tx.query.jobWorkflows.findFirst({
          where: eq(jobWorkflows.jobTicketId, ticket.id),
        });

        if (!existingWorkflow) {
          const activeTemplate = await tx.query.workflowTemplates.findFirst({
            where: and(
              eq(workflowTemplates.targetJobType, ticket.jobType),
              eq(workflowTemplates.isActive, true),
            ),
            with: {
              stages: {
                orderBy: [asc(workflowStages.stepOrder)],
              },
            },
          });

          if (activeTemplate?.stages[0]) {
            await tx.insert(jobWorkflows).values({
              jobTicketId: ticket.id,
              templateId: activeTemplate.id,
              currentStageId: activeTemplate.stages[0].id,
              status: "IN_PROGRESS",
            });

            await tx.insert(activityLogs).values({
              entityId: ticket.id,
              entityType: "JOB_TICKET",
              action: "WORKFLOW_AUTO_ASSIGNED",
              description: `Workflow ${activeTemplate.name} auto-assigned for ${ticket.jobType} job type.`,
              userId: user.id,
            });
          }
        }

        return ticket;
      });

      await db.insert(activityLogs).values({
        entityId: updatedProposal.id,
        entityType: "QUOTATION",
        action: "SIGNED",
        description:
          "Quotation approved by customer. Job Ticket generated automatically.",
        userId: user.id,
      });

      await db.insert(activityLogs).values({
        entityId: jobTicket.id,
        entityType: "JOB_TICKET",
        action: "CREATED",
        description: `Installation job ticket created from signed quotation ${getQuotationDocumentNo(updatedProposal.id)}.`,
        userId: user.id,
      });
    } else {
      await db.insert(activityLogs).values({
        entityId: updatedProposal.id,
        entityType: "QUOTATION",
        action: "SIGNED",
        description: `${proposal.user?.name || proposal.user?.email || user.email || "Customer"} signed quotation ${getQuotationDocumentNo(updatedProposal.id)}.`,
        userId: user.id,
      });
    }

    try {
      const erpnextCustomerId = await getOrCreateErpnextCustomerForUser(
        updatedProposal.userId,
        updatedProposal.configurationData,
      );
      await db
        .update(proposals)
        .set({ erpnextCustomerId })
        .where(eq(proposals.id, updatedProposal.id));
    } catch (error) {
      console.error(
        "[ERPNext JIT Customer Sync] Failed after proposal signature:",
        error,
      );
    }

    void sendDiscordProposalSignedNotification({
      customerName:
        proposal.user?.name ||
        proposal.user?.email ||
        user.email ||
        "Unknown Customer",
      documentNo: getQuotationDocumentNo(updatedProposal.id),
      totalPrice: updatedProposal.totalPrice,
    }).catch((error) => {
      console.error(
        "Failed to send Discord signed-proposal notification:",
        error,
      );
    });

    revalidatePath("/proposals");
    revalidatePath("/admin/crm");
    return {
      success: true,
      status: "SIGNED",
      signatureUrl: updatedProposal.signatureUrl,
      signedAt: updatedProposal.signedAt,
    };
  } catch (error: unknown) {
    console.error("Failed to sign proposal:", error);
    return { error: "Failed to sign proposal." };
  }
}

export async function requestProposalCancellation(
  proposalId: string,
  reason?: string,
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
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
      return { error: "Proposal not found" };
    }

    // Verify ownership
    if (proposal.userId !== user.id) {
      return { error: "Unauthorized operation on proposal" };
    }

    const existingConfig =
      (proposal.configurationData as Record<string, unknown>) || {};
    const updatedConfig = {
      ...existingConfig,
      cancellationReason: reason || null,
      cancellationRequestedAt: new Date().toISOString(),
    };

    const [updatedProposal] = await db
      .update(proposals)
      .set({
        status: "CANCEL_REQUESTED",
        isArchived: false,
        configurationData: updatedConfig,
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    await db.insert(activityLogs).values({
      entityId: updatedProposal.id,
      entityType: "QUOTATION",
      action: "CANCEL_REQUESTED",
      description: `${proposal.user?.name || proposal.user?.email || user.email || "Customer"} requested quotation cancellation${reason ? `: ${reason}` : "."}`,
      userId: user.id,
    });

    // Trigger email service to notify admin staff immediately
    const { sendCancellationRequestAdminEmail } = await import("@/lib/email");
    void sendCancellationRequestAdminEmail({
      proposalId: updatedProposal.id,
      customerName: proposal.user?.name || "Unknown Customer",
      customerEmail: proposal.user?.email || user.email || "No email",
      totalPrice: updatedProposal.totalPrice,
      reason: reason,
    }).catch((err) => {
      console.error("Failed to send cancellation request email:", err);
    });

    revalidatePath("/proposals");
    revalidatePath("/admin/crm");
    return {
      success: true,
      proposal: toProposalActionSnapshot(updatedProposal),
    };
  } catch (error: unknown) {
    console.error("Failed to request proposal cancellation:", error);
    return { error: "Failed to request proposal cancellation" };
  }
}

export async function approveProposalContract(
  proposalId: string,
  coordinates: { latitude: number; longitude: number; address: string },
  signatureBase64: string,
  idCardUrl: string,
  electricityBillUrl: string,
) {
  try {
    if (!proposalId) {
      return { error: "Proposal ID is required" };
    }
    if (
      !coordinates ||
      coordinates.latitude === undefined ||
      coordinates.longitude === undefined
    ) {
      return { error: "Installation coordinates are required" };
    }
    if (!signatureBase64) {
      return { error: "Digital signature is required" };
    }
    if (!idCardUrl || !electricityBillUrl) {
      return { error: "ID card and electricity bill documents are required" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
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
      return { error: "Proposal not found" };
    }

    // Decode and upload signature to supabase storage
    const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const sigFileName = `signature-contract-${proposal.id}-${Date.now()}.png`;
    const sigFilePath = `signatures/${sigFileName}`;
    const bucket = "proposals";
    const supabaseAdmin = createAdminClient();

    const sigUploadResult = await supabaseAdmin.storage
      .from(bucket)
      .upload(sigFilePath, buffer, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: true,
      });

    if (sigUploadResult.error) {
      console.error("Signature upload failed:", sigUploadResult.error);
      return {
        error: `Failed to upload signature: ${sigUploadResult.error.message}`,
      };
    }

    const {
      data: { publicUrl: signatureUrl },
    } = supabaseAdmin.storage.from(bucket).getPublicUrl(sigFilePath);

    const configurationData = {
      ...((proposal.configurationData as Record<string, unknown>) || {}),
      idCardUrl,
      electricityBillUrl,
      installationLatitude: coordinates.latitude,
      installationLongitude: coordinates.longitude,
      installationMapAddress: coordinates.address,
      signatureUrl,
      signedAt: new Date().toISOString(),
    };

    const [updatedProposal] = await db
      .update(proposals)
      .set({
        status: "MILESTONE_1_ACTIVE",
        installationLatitude: coordinates.latitude.toString(),
        installationLongitude: coordinates.longitude.toString(),
        installationMapAddress: coordinates.address,
        signatureUrl,
        signedAt: new Date(),
        configurationData,
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    // Generate proposal document data hash for audit log integrity validation
    const proposalDataString = JSON.stringify({
      id: proposal.id,
      systemSizeKwp: proposal.systemSizeKwp,
      panelCount: proposal.panelCount,
      totalPrice: proposal.totalPrice,
      monthlySavings: proposal.monthlySavings,
      paybackPeriod: proposal.paybackPeriod,
      configurationData: proposal.configurationData,
    });
    const documentHash = crypto
      .createHash("sha256")
      .update(proposalDataString)
      .digest("hex");

    // Extract request headers for IP and User-Agent
    const headersList = await headers();
    const rawIp = headersList.get("x-forwarded-for") || "127.0.0.1";
    const signerIpAddress = rawIp.split(",")[0].trim();
    const signerUserAgent = headersList.get("user-agent") || "unknown";

    // Insert signature audit trail record
    await db.insert(signatureAuditTrails).values({
      proposalId: proposal.id,
      signatureUrl,
      signerIpAddress,
      signerUserAgent,
      documentHash,
    });

    // Log the activity
    await db.insert(activityLogs).values({
      entityId: updatedProposal.id,
      entityType: "QUOTATION",
      action: "CONTRACT_SIGNED",
      description: `Customer signed contract and updated installation location at ${coordinates.address}. Status shifted to MILESTONE_1_ACTIVE.`,
      userId: user.id,
    });

    revalidatePath(`/checkout/${proposalId}/payment`);
    revalidatePath("/proposals");
    revalidatePath("/admin/crm");

    return {
      success: true,
      proposal: toProposalActionSnapshot(updatedProposal),
    };
  } catch (error: unknown) {
    console.error("Failed to approve proposal contract:", error);
    return { error: "Failed to approve proposal contract" };
  }
}

export async function uploadProposalContractDocument(
  proposalId: string,
  documentType: "idcard" | "bill",
  formData: FormData,
) {
  try {
    const normalizedProposalId = proposalId.trim();
    if (!normalizedProposalId) {
      return { success: false as const, error: "Proposal ID is required" };
    }

    if (documentType !== "idcard" && documentType !== "bill") {
      return {
        success: false as const,
        error: "Invalid contract document type",
      };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false as const, error: "Document file is required" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false as const, error: "User not authenticated" };
    }

    const proposal = await db.query.proposals.findFirst({
      where: and(
        eq(proposals.id, normalizedProposalId),
        eq(proposals.userId, user.id),
      ),
      columns: {
        id: true,
        userId: true,
      },
    });

    if (!proposal) {
      return {
        success: false as const,
        error: "Proposal not found or access denied",
      };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: CONTRACT_DOCUMENT_FILE_KINDS,
      fallbackName: documentType === "idcard" ? "id-card" : "electricity-bill",
      maxBytes: MAX_CONTRACT_DOCUMENT_BYTES,
    });

    const storagePath = [
      "contract-documents",
      proposal.id,
      `${documentType}-${crypto.randomUUID()}.${validatedFile.extension}`,
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
      console.error(
        "[uploadProposalContractDocument] Storage upload failed:",
        upload.error,
      );
      return {
        success: false as const,
        error: "Failed to upload contract document",
      };
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("proposals").getPublicUrl(storagePath);

    return {
      success: true as const,
      url: publicUrl,
      storagePath,
    };
  } catch (error) {
    console.error("[uploadProposalContractDocument]:", error);
    return {
      success: false as const,
      error: "Failed to upload contract document",
    };
  }
}

export async function publishOfficialQuotation(
  proposalId: string,
  items: Record<string, unknown>[],
  systemSizeKwp: number,
  panelCount: number,
  totalPrice: number,
) {
  try {
    if (!proposalId) {
      return { error: "Proposal ID is required" };
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { error: "Materials list cannot be empty" };
    }

    const staffUser = await requireStaff();

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
      return { error: "Proposal not found" };
    }

    const signedStatuses = [
      "SIGNED",
      "SIGNED_WAITING_VERIFY",
      "MILESTONE_1_ACTIVE",
      "COMPLETED",
      "PAID",
      "DELIVERED",
    ];
    if (signedStatuses.includes(proposal.status.toUpperCase())) {
      return {
        error:
          "This proposal has already been signed and its scope/pricing cannot be modified.",
      };
    }

    const nextRevision = proposal.revisionNumber + 1;
    const configurationData = {
      ...((proposal.configurationData as Record<string, unknown>) || {}),
      items,
      systemSizeKwp,
      panelCount,
      totalPrice,
      revisionNumber: nextRevision,
      revisedAt: new Date().toISOString(),
    };

    const [updatedProposal] = await db
      .update(proposals)
      .set({
        status: "WAITING_SIGNATURE",
        systemSizeKwp,
        panelCount,
        totalPrice,
        revisionNumber: nextRevision,
        configurationData,
      })
      .where(eq(proposals.id, proposalId))
      .returning();

    // Log the activity
    await db.insert(activityLogs).values({
      entityId: updatedProposal.id,
      entityType: "QUOTATION",
      action: "QUOTATION_REVISED",
      description: `Official revised quotation published (Revision #${nextRevision}) with adjusted BOM materials. Total: ${totalPrice.toLocaleString("th-TH")} THB.`,
      userId: staffUser.id,
    });

    // Send email notification dynamically
    const { sendDynamicQuotationRevisionEmail } = await import("@/lib/email");
    void sendDynamicQuotationRevisionEmail({
      proposalId: updatedProposal.id,
      customerName: proposal.user?.name || "Customer",
      customerEmail: proposal.user?.email || "",
      revisionNumber: nextRevision,
      totalPrice: totalPrice,
    }).catch((err) => {
      console.error("Failed to send quotation revision email:", err);
    });

    revalidatePath(`/admin/projects/${proposalId}/adjust-bom`);
    revalidatePath(`/checkout/${proposalId}/payment`);
    revalidatePath("/proposals");
    revalidatePath("/admin/crm");

    return {
      success: true,
      proposal: toProposalActionSnapshot(updatedProposal),
    };
  } catch (error: unknown) {
    console.error("Failed to publish official quotation:", error);
    return { error: "Failed to publish official quotation" };
  }
}

/**
 * Permanently deletes a proposal and cleans up all dependent/linked records across the database.
 * Restricted strictly to users with ADMIN or SUPER_ADMIN permission.
 */
export async function deleteProposalAndLinkedRecords(
  proposalId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminUser = await requireAdmin();

    if (!proposalId || typeof proposalId !== "string") {
      return { success: false, error: "A valid proposal ID is required." };
    }

    const result = await deleteLinkedSalesRecords(
      [{ type: "PROPOSAL", id: proposalId }],
      { id: adminUser.id, label: adminUser.fullName || adminUser.email || "Admin" },
    );

    if (!result.success) {
      return { success: false, error: result.error || "Proposal not found." };
    }

    revalidatePath("/admin/orders");
    revalidatePath("/admin/crm");
    revalidatePath("/admin/quotations");
    revalidatePath("/proposals");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete proposal and linked records:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete proposal.",
    };
  }
}
