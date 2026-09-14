"use server";

import { db } from "@/db";
import {
  activityLogs,
  consultationLeads,
  leads,
  users,
  installationProjects,
  proposals,
  proposalDocuments,
  userNotifications,
} from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { createClient, createAdminClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth-guard";
import { deleteLinkedSalesRecords } from "@/lib/salesPipelineDeletion";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { FULFILLMENT_INSTALLATION, FULFILLMENT_PURCHASE_ONLY, type FulfillmentType } from "@/lib/fulfillment";
import { sendAutomatedProposal } from "@/lib/emailService";
import { createErpnextLeadForConsultation } from "@/app/actions/erpnextQuotation";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";
import { deriveQuotationTrackingReference } from "@/lib/trackingReference";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import { issuePortalDispatchLink, getSigningSecret } from "@/lib/portalTokens";
import { signHs256Jwt } from "@/lib/signedJwt";
import { createInboundRequest, linkInboundRequestToErpLead } from "@/app/actions/inboundRequests";
import { normalizePreferredLanguage } from "@/lib/userLanguage";

import {
  getOrCreateDriveFolder,
  uploadBufferToDriveFolder,
} from "@/lib/googleDrive";
import { applySolarDreamWatermark } from "@/lib/watermark";

const MAX_PROJECT_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_PROJECT_PHOTOS = 30;
const PROJECT_PHOTO_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isTrustedProjectStorageUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return false;
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    if (configuredSupabaseUrl) {
      const supabaseHost = new URL(configuredSupabaseUrl).hostname.toLowerCase();
      if (host === supabaseHost && url.pathname.includes("/storage/v1/object/public/projects/")) {
        return true;
      }
    }

    if (
      host === "drive.google.com" ||
      host.endsWith(".googleusercontent.com") ||
      host.endsWith(".drive.google.com")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function getAcquisitionSnapshot() {
  return {
    source: "Direct",
    sessionId: null,
    anonymousId: null,
    referrer: null,
    landingPage: null,
    ref: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
  };
}

function queueAutomatedProposalEmail(
  customerEmail: string,
  data: Parameters<typeof sendAutomatedProposal>[1],
  submissionType: "installation" | "purchase-only",
) {
  after(async () => {
    try {
      const result = await sendAutomatedProposal(customerEmail, data);
      if (!result.success) {
        console.warn(
          `[EMAIL AUTOMATION] ${submissionType} proposal email was not sent to ${customerEmail}.`,
          result,
        );
      }
    } catch (error) {
      console.error(
        `[EMAIL AUTOMATION] Failed to dispatch ${submissionType} proposal email to ${customerEmail}:`,
        error,
      );
    }
  });
}

export type QuotationSignMethod = "DIGITAL" | "MANUAL" | "EVALUATION";
export type QuotationRoutingBranch = FulfillmentType;

type QuotationItemInput = {
  categoryName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  productId?: string;
};

type SubmitLeadDataInput = {
  name: string;
  email: string;
  phone: string;
  taxId?: string;
  location?: string;
  items: QuotationItemInput[];
  totalPrice: number;
  savedConfigurationId?: string;
  systemkWp?: number;
  panelCount?: number;
  estimatedSavings?: number;
  paybackPeriod?: string;
  meterType?: string;
  electricityRate?: number;
  /** E = P x T x PR daily energy output (kWh/day) */
  dailyEnergyKwh?: number;
  /** Performance Ratio used in the formula */
  PR?: number;
  latitude?: number;
  longitude?: number;
  signatureBase64?: string;
  signMethod?: QuotationSignMethod;
  requiresInstallation?: boolean;
  fulfillmentType?: QuotationRoutingBranch;
  routingBranch?: QuotationRoutingBranch;
  mainBundleId?: string;
  selectedAddonIds?: string[];
  selectedFinancingId?: string;
  preferredLoanTermMonths?: number;
  downPaymentAmount?: number;
  notes?: string;
  monthlyBill?: number;
  propertyType?: string;
};

type DesignConsultationInput = {
  name: string;
  email: string;
  phone: string;
  taxId?: string;
  postalCode: string;
  preferredDateTime: string;
  remarks?: string;
  location?: string;
  systemProfile: Record<string, unknown>;
  wizardAnswers: Record<string, unknown>;
  locale?: string;
  source?: string;
};

type ConsultationSystemType = "ON_GRID" | "HYBRID";

function normalizeSystemType(value: unknown): ConsultationSystemType {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[-\s]+/g, "_");
  return normalized === "HYBRID" ? "HYBRID" : "ON_GRID";
}

function normalizeAddOns(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function getTargetSystemSize(profile: Record<string, unknown>, answers: Record<string, unknown>) {
  const explicit = profile.targetSystemSize ?? profile.systemSize ?? answers.targetSystemSize;
  if (explicit) return String(explicit);

  const kwp = Number(profile.systemSizeKwp ?? profile.systemCapacityKwp ?? answers.systemCapacityKwp);
  if (Number.isFinite(kwp) && kwp > 0) {
    return `${kwp % 1 === 0 ? kwp.toFixed(0) : kwp.toFixed(2)}kW`;
  }

  return "TBD";
}

function readPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return 0;
}

function buildCrmOpportunityPayload(input: {
  name: string;
  email: string;
  phone: string;
  targetSystemSize: string;
  systemType: ConsultationSystemType;
  addOns: string[];
  customerNotes: string;
  preferredDateTime: string;
  dynamicCalculations: Record<string, unknown>;
}) {
  const description = [
    `Generic consultation lead for ${input.targetSystemSize} ${input.systemType.replace("_", "-")} system.`,
    `Preferred discussion: ${input.preferredDateTime}`,
    input.addOns.length ? `Smart add-ons: ${input.addOns.join(", ")}` : "Smart add-ons: none selected",
    input.customerNotes ? `Customer notes: ${input.customerNotes}` : "Customer notes: none",
  ].join("\n");

  return {
    doctype: "Opportunity",
    opportunity_from: "Lead",
    lead_name: input.name,
    contact_email: input.email,
    contact_mobile: input.phone,
    opportunity_type: "Sales",
    source: "SolarDream Generic Design Profile",
    title: `${input.targetSystemSize} ${input.systemType.replace("_", "-")} Solar Consultation`,
    description,
    custom_target_system_size: input.targetSystemSize,
    custom_system_type: input.systemType,
    custom_add_ons: input.addOns,
    custom_dynamic_calculations: input.dynamicCalculations,
  };
}

const STATUS_PENDING_SALES_REVIEW = "PENDING_SALES_REVIEW";
const STATUS_AUTOMATED_DRAFT = "AUTOMATED_DRAFT";
const STATUS_SIGNED = "SIGNED";

export async function submitDesignConsultationRequest(data: DesignConsultationInput) {
  try {
    const name = data.name.trim();
    const email = data.email.trim();
    const phone = data.phone.trim();
    const postalCode = data.postalCode.trim();
    const preferredDateTime = data.preferredDateTime.trim();
    const customerNotes = data.remarks?.trim() || "";
    const systemProfile = asRecord(data.systemProfile);
    const wizardAnswers = asRecord(data.wizardAnswers);
    const targetSystemSize = getTargetSystemSize(systemProfile, wizardAnswers);
    const systemType = normalizeSystemType(
      systemProfile.systemType ?? systemProfile.inverterArchitecture ?? wizardAnswers.inverterArchitecture,
    );
    const addOns = normalizeAddOns(systemProfile.addOns ?? systemProfile.smartAddOns ?? wizardAnswers.smartAddOns);

    if (!name || !email || !phone || !postalCode || !preferredDateTime) {
      return {
        success: false,
        error: "Please provide name, email, phone, postal code, and preferred discussion time.",
      };
    }

    if (!targetSystemSize || targetSystemSize === "TBD") {
      return {
        success: false,
        error: "Please provide a target system size before submitting.",
      };
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? null;
    const preferredLanguage = normalizePreferredLanguage(data.locale);
    const submittedAt = new Date().toISOString();
    const acquisition = await getAcquisitionSnapshot();
    const dynamicCalculations = {
      ...systemProfile,
      wizardAnswers,
      preferred_language: preferredLanguage,
      preferredDateTime,
      submittedAt,
      acquisition,
    };
    const crmPayload = buildCrmOpportunityPayload({
      name,
      email,
      phone,
      targetSystemSize,
      systemType,
      addOns,
      customerNotes,
      preferredDateTime,
      dynamicCalculations,
    });

    let inboundRequestId: string | null = null;
    try {
      const inboundResult = await createInboundRequest({
        customerName: name,
        phone,
        email,
        requestType: "WIZARD",
        payload: dynamicCalculations,
        source: (data as { source?: string }).source || "direct",
      });
      inboundRequestId = inboundResult.request?.id ?? null;
    } catch (inboundErr) {
      console.warn("Failed to save inbound_requests entry:", inboundErr);
    }

    const result = await db.transaction(async (tx) => {
      if (userId) {
        await tx
          .update(users)
          .set({ preferredLanguage, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      const [legacyLead] = await tx.insert(leads)
        .values({
          name,
          email,
          phone,
          location: data.location?.trim() || null,
          status: "PENDING_DESIGN_CONSULTATION",
          notes: [
            `Preferred discussion: ${preferredDateTime}`,
            `Postal code: ${postalCode}`,
            `Target system size: ${targetSystemSize}`,
            `System type: ${systemType}`,
            addOns.length ? `Add-ons: ${addOns.join(", ")}` : null,
            customerNotes ? `Remarks: ${customerNotes}` : null,
          ].filter(Boolean).join("\n"),
          configurationSnapshot: {
            requestType: "GENERIC_DESIGN_PROFILE_CONSULTATION",
            targetSystemSize,
            systemType,
            addOns,
            customerNotes,
            preferredDateTime,
            postalCode,
            dynamicCalculations,
            crmPayload,
          },
        })
        .returning({ id: leads.id });

      const [consultationLead] = await tx.insert(consultationLeads)
        .values({
          userId,
          customerName: name,
          email,
          phone,
          postalCode,
          targetSystemSize,
          systemType,
          addOns,
          customerNotes: customerNotes || null,
          status: "PENDING_STAFF_REVIEW",
          dynamicCalculations,
          rawPayload: {
            ...data,
            customerContact: {
              name,
              email,
              phone,
              postalCode,
            },
            systemProfile,
            wizardAnswers,
          },
          crmPayload,
          legacyLeadId: legacyLead.id,
        })
        .returning({ id: consultationLeads.id });

      let proposalId: string | null = null;
      if (userId) {
        const systemSizeKwp = readPositiveNumber(
          systemProfile.systemSizeKwp,
          systemProfile.systemPackageSizeKwp,
          wizardAnswers.systemSizeKwp,
          targetSystemSize,
        );
        const panelEstimate = asRecord(systemProfile.approxPanels);
        const panelCount = Math.round(readPositiveNumber(
          systemProfile.panelCount,
          panelEstimate.max,
          panelEstimate.min,
        ));
        const totalPrice = readPositiveNumber(
          systemProfile.totalPrice,
          systemProfile.estimatedBudget,
          systemProfile.systemPackagePrice,
        );
        const monthlySavings = readPositiveNumber(
          systemProfile.monthlySavings,
          systemProfile.estimatedMonthlySavings,
          systemProfile.calculatedMonthlySavings,
        );
        const paybackPeriod = readPositiveNumber(
          systemProfile.paybackPeriodYears,
          systemProfile.paybackPeriod,
        );

        // Proposal creation deferred until staff clicks "Generate Quotation" in Tab 1 (Inbound Requests)
        proposalId = null;
      }

      const salesUsers = await tx.query.users.findMany({
        where: inArray(users.role, ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"]),
        columns: { id: true },
      });

      if (salesUsers.length > 0) {
        await tx.insert(userNotifications)
          .values(salesUsers.map((salesUser) => ({
            userId: salesUser.id,
            featureKey: "consultation_lead",
            title: "New consultation lead",
            link: "/admin/leads",
            message: `${name} requested a ${targetSystemSize} ${systemType.replace("_", "-")} design consultation.`,
          })));
      }

      return {
        consultationLeadId: consultationLead.id,
        legacyLeadId: legacyLead.id,
        proposalId,
      };
    });

    revalidatePath("/admin/crm");
    revalidatePath("/admin/leads");
    revalidatePath("/admin");
    revalidatePath("/proposals");

    const locale = data.locale === "en" ? "en" : "th";
    const trackingNumber = result.proposalId
      ? deriveQuotationTrackingReference(result.proposalId)
      : deriveQuotationTrackingReference(result.consultationLeadId);

    after(async () => {
      const erpLeadResult = await createErpnextLeadForConsultation(result.consultationLeadId);
      try {
        await linkInboundRequestToErpLead({
          inboundRequestId,
          consultationLeadId: result.consultationLeadId,
          erpnextLeadId: erpLeadResult.success ? erpLeadResult.erpLeadId : null,
          error: erpLeadResult.success ? null : (erpLeadResult.error || "ERPNext lead sync failed."),
        });
      } catch (inboundSyncError) {
        console.warn("[ERPNext Lead Factory]: Could not persist inbound sync state", inboundSyncError);
      }
      if (!erpLeadResult.success) {
        console.warn("[ERPNext Lead Factory]: Deferred lead creation failed", erpLeadResult.error);
      }

      try {
        const secret = await getSigningSecret();
        const magicLink = result.proposalId
          ? await issuePortalDispatchLink({
              proposalId: result.proposalId,
              actorUserId: result.consultationLeadId,
              locale: locale,
            })
          : (() => {
              const token = signHs256Jwt(
                { typ: "guest_master_session", email },
                secret,
              );
              const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://solar-dream.org").replace(/\/$/, "");
              const magicUrl = new URL("/api/auth/verify-guest", siteUrl);
              magicUrl.searchParams.set("mode", "guest");
              magicUrl.searchParams.set("locale", locale);
              magicUrl.searchParams.set("token", token);
              return magicUrl.toString();
            })();

        await sendConfiguredTemplateEmail({
          templateKey: "service_request_confirmed",
          to: email,
          values: { customer_name: name, customer_email: email, order_reference: trackingNumber, tracking_url: magicLink, action_url: magicLink, lang: preferredLanguage },
        });
      } catch (emailErr) {
        console.error("[CONSULTATION EMAIL] Deferred email dispatch failed:", emailErr);
      }
    });

    return {
      success: true,
      leadId: result.legacyLeadId,
      consultationLeadId: result.consultationLeadId,
      proposalId: result.proposalId,
      trackingNumber,
      message: "Consultation request submitted successfully.",
    };
  } catch (error) {
    console.error("submitDesignConsultationRequest failed:", error);
    return {
      success: false,
      error: "Failed to submit consultation request.",
    };
  }
}

export async function submitDesignRequest(data: DesignConsultationInput) {
  return submitDesignConsultationRequest(data);
}

export type ConsultationLeadStaffStatus =
  | "NEW_LEAD"
  | "PENDING_STAFF_REVIEW"
  | "ENGINEER_REVIEW"
  | "PROPOSAL_SENT"
  | "CUSTOMER_APPROVED"
  | "REJECTED"
  | "ARCHIVED";

const CONSULTATION_STAFF_STATUSES = new Set<ConsultationLeadStaffStatus>([
  "NEW_LEAD",
  "PENDING_STAFF_REVIEW",
  "ENGINEER_REVIEW",
  "PROPOSAL_SENT",
  "CUSTOMER_APPROVED",
  "REJECTED",
  "ARCHIVED",
]);

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { role: true },
  });

  if (!dbUser || !["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(dbUser.role)) {
    throw new Error("Forbidden");
  }

  return user;
}

export async function getConsultationLeads() {
  try {
    await assertAdmin();
    const rows = await db.query.consultationLeads.findMany({
      orderBy: [desc(consultationLeads.createdAt)],
      with: {
        legacyLead: {
          columns: {
            id: true,
            location: true,
            notes: true,
            status: true,
          },
        },
      },
    });

    return { success: true, leads: rows };
  } catch (err: unknown) {
    console.error("Failed to fetch consultation leads:", err);
    return { error: "Failed to fetch consultation leads." };
  }
}

export async function updateConsultationLeadStatus(
  leadId: string,
  status: ConsultationLeadStaffStatus,
) {
  try {
    await assertAdmin();
    if (!CONSULTATION_STAFF_STATUSES.has(status)) {
      return { error: "Invalid consultation lead status." };
    }

    const [lead] = await db.update(consultationLeads)
      .set({ status })
      .where(eq(consultationLeads.id, leadId))
      .returning();
    if (!lead) return { error: "Consultation lead not found. Refresh the page and try again." };

    revalidatePath("/admin/quotations");
    revalidatePath("/admin/crm");
    revalidatePath("/admin/leads");

    return { success: true, lead: { id: lead.id, status: lead.status, updatedAt: lead.updatedAt } };
  } catch (err: unknown) {
    console.error("Failed to update consultation lead status:", err);
    return { error: "Failed to update consultation lead status." };
  }
}

// 1. Create a lead (Public submission)
export async function createLead(data: {
  name: string;
  email: string;
  phone: string;
  configurationSnapshot: Record<string, unknown>;
  savedConfigurationId?: string;
}) {
  try {
    const acquisition = await getAcquisitionSnapshot();
    const [lead] = await db.insert(leads)
      .values({
        name: data.name,
        email: data.email,
        phone: data.phone,
        configurationSnapshot: {
          ...data.configurationSnapshot,
          acquisition,
        },
        savedConfigurationId: data.savedConfigurationId || null,
        status: "NEW",
      })
      .returning();
    if (!lead) return { error: "Failed to submit lead data." };
    
    revalidatePath("/admin/leads");
    revalidatePath("/admin/crm");
    return { success: true, leadId: lead.id };
  } catch (err: unknown) {
    console.error("Failed to create lead:", err);
    return { error: "Failed to submit lead data." };
  }
}

// 2. Get all leads (Admin only)
export async function getLeads() {
  try {
    await assertAdmin();
    const leadsList = await db.query.leads.findMany({
      orderBy: [desc(leads.createdAt)],
      with: {
        savedConfiguration: {
          with: {
            user: true,
          },
        },
        proposalDocuments: true,
        installationProject: true,
      },
    });
    return { success: true, leads: leadsList };
  } catch (err: unknown) {
    console.error("Failed to fetch leads:", err);
    return { error: "Failed to fetch leads." };
  }
}

// 3. Update lead details (Admin only)
export async function updateLeadStatus(
  leadId: string,
  status: string,
  notes?: string
) {
  try {
    await assertAdmin();
    const [lead] = await db.update(leads)
      .set({
        status,
        ...(notes !== undefined ? { notes } : {}),
      })
      .where(eq(leads.id, leadId))
      .returning();
    if (!lead) return { error: "Lead not found. Refresh the page and try again." };

    if (status === "WON") {
      const existingProject = await db.query.installationProjects.findFirst({
        where: eq(installationProjects.leadId, leadId),
      });
      if (!existingProject) {
        await db.insert(installationProjects)
          .values({
            leadId,
            status: "PREP",
            notes: notes || "Automatically created from Lead " + leadId,
            photos: [],
          });
      }
    }

    revalidatePath("/admin/leads");
    revalidatePath("/admin/crm");
    revalidatePath("/admin/projects");
    return { success: true, lead: { id: lead.id, status: lead.status, notes: lead.notes } };
  } catch (err: unknown) {
    console.error("Failed to update lead status:", err);
    return { error: "Failed to update lead." };
  }
}

export async function convertLeadToProposal(leadId: string) {
  try {
    await assertAdmin();

    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
      with: {
        savedConfiguration: {
          with: {
            user: true,
          },
        },
        proposalDocuments: true,
      },
    });

    if (!lead) {
      return { error: "Lead not found." };
    }

    const targetUser = lead.savedConfiguration?.user;
    if (!targetUser) {
      return { error: "This lead is not linked to a registered user, so it cannot be converted to a customer proposal yet." };
    }

    const snapshot = (lead.configurationSnapshot as Record<string, unknown>) || {};
    const erpSync = asRecord(snapshot.erpSync);
    const boundErpnextCustomerId = typeof erpSync.erpnextCustomerId === "string"
      ? erpSync.erpnextCustomerId.trim()
      : typeof erpSync.erpCustomerId === "string" ? erpSync.erpCustomerId.trim() : "";
    const requiresInstallation =
      snapshot.requiresInstallation === true ||
      snapshot.fulfillmentType === FULFILLMENT_INSTALLATION ||
      snapshot.routingBranch === FULFILLMENT_INSTALLATION;
    const [proposal] = await db.insert(proposals)
      .values({
        userId: targetUser.id,
        systemSizeKwp: Number(snapshot.systemkWp ?? snapshot.systemSizeKwp ?? 0),
        panelCount: Number(snapshot.panelCount ?? 0),
        totalPrice: Number(snapshot.totalPrice ?? lead.savedConfiguration?.totalPrice ?? 0),
        monthlySavings: Number(snapshot.estimatedSavings ?? snapshot.monthlySavings ?? 0),
        paybackPeriod: String(snapshot.paybackPeriod ?? "0.0"),
        pdfUrl: lead.proposalDocuments?.[0]?.fileUrl || null,
        erpnextCustomerId: boundErpnextCustomerId || null,
        erpnextCustomerBoundAt: boundErpnextCustomerId ? new Date() : null,
        erpnextCustomerBindingSource: boundErpnextCustomerId ? "LEAD_CONVERSION" : null,
        status: requiresInstallation ? STATUS_PENDING_SALES_REVIEW : STATUS_AUTOMATED_DRAFT,
        fulfillmentType: requiresInstallation ? FULFILLMENT_INSTALLATION : FULFILLMENT_PURCHASE_ONLY,
        configurationData: {
          ...snapshot,
          pendingEvaluation: requiresInstallation,
          evaluationStatus: requiresInstallation ? STATUS_PENDING_SALES_REVIEW : null,
          routingBranch: requiresInstallation ? FULFILLMENT_INSTALLATION : FULFILLMENT_PURCHASE_ONLY,
          sourceLeadId: lead.id,
          leadContact: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            location: lead.location,
          },
        },
      })
      .returning();
    if (!proposal) return { error: "Failed to create proposal from lead." };

    const [updatedLead] = await db.update(leads)
      .set({
        status: "QUALIFIED",
        notes: [lead.notes, `Converted to proposal ${proposal.id}`].filter(Boolean).join("\n"),
      })
      .where(eq(leads.id, leadId))
      .returning({ id: leads.id });
    if (!updatedLead) return { error: "Lead no longer exists. Refresh the page and try again." };

    revalidatePath("/admin/crm");
    revalidatePath("/proposals");
    return { success: true, proposal: { id: proposal.id, status: proposal.status } };
  } catch (err: unknown) {
    console.error("Failed to convert lead to proposal:", err);
    return { error: "Failed to convert lead to proposal." };
  }
}

export async function deleteLeads(leadIds: string[]) {
  try {
    const adminUser = await requireAdmin();
    if (!Array.isArray(leadIds)) return { error: "No leads selected." };
    const cleanIds = Array.from(new Set(leadIds.map((id) => id.trim()).filter(Boolean)));
    if (cleanIds.length === 0) return { error: "No leads selected." };
    if (cleanIds.length > 100) return { error: "Select no more than 100 leads at a time." };

    const result = await deleteLinkedSalesRecords(
      cleanIds.map((id) => ({ type: "LEAD" as const, id })),
      { id: adminUser.id, label: adminUser.fullName || adminUser.email || "Admin" },
    );
    if (!result.success) return { error: result.error || "The selected leads no longer exist." };

    revalidatePath("/admin/leads");
    revalidatePath("/admin/crm");
    revalidatePath("/admin/quotations");
    const count = result.counts?.leads ?? 0;
    return { success: true, count, message: `${count} lead(s) and linked sales records deleted.` };
  } catch (err: unknown) {
    console.error("Failed to delete leads:", err);
    return { error: "Failed to delete leads." };
  }
}

export async function importLeads(rows: Record<string, unknown>[]) {
  try {
    await assertAdmin();
    if (!Array.isArray(rows) || rows.length === 0) return { error: "Import file has no lead rows." };
    if (rows.length > 500) return { error: "Import no more than 500 leads at a time." };
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      try {
        const name = String(row.name ?? "").trim();
        const email = String(row.email ?? "").trim();
        const phone = String(row.phone ?? "").trim();
        if (!name || !email || !phone) throw new Error("Name, email, and phone are required.");

        const data = {
          name,
          email,
          phone,
          location: emptyToNull(row.location),
          status: String(row.status ?? "NEW").trim() || "NEW",
          notes: emptyToNull(row.notes),
          configurationSnapshot: parseJsonCell(row.configurationSnapshot, {}),
        };
        const id = String(row.id ?? "").trim();

        const existing = id ? await db.query.leads.findFirst({ where: eq(leads.id, id) }) : null;

        if (existing) {
          await db.update(leads).set(data).where(eq(leads.id, id));
          updated += 1;
        } else {
          await db.insert(leads).values(id ? { ...data, id } : data);
          created += 1;
        }
      } catch (error) {
        errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "Invalid lead row"}`);
      }
    }

    revalidatePath("/admin/leads");
    revalidatePath("/admin/crm");
    return {
      success: errors.length === 0,
      message: `Import finished: ${created} created, ${updated} updated${errors.length ? `, ${errors.length} failed.` : "."}`,
      errors,
    };
  } catch (err: unknown) {
    console.error("Failed to import leads:", err);
    return { error: "Failed to import leads." };
  }
}

// 4. Submit Lead Data with Server-side PDF generation for purchase-only quotes
export async function submitLeadData(data: SubmitLeadDataInput) {
  try {
    const acquisition = await getAcquisitionSnapshot();
    const signMethod = data.signMethod || (data.signatureBase64 ? "DIGITAL" : "MANUAL");
    const requestedBranch = data.routingBranch || data.fulfillmentType || (data.requiresInstallation ? FULFILLMENT_INSTALLATION : FULFILLMENT_PURCHASE_ONLY);
    const requiresInstallation =
      data.requiresInstallation === true ||
      signMethod === "EVALUATION" ||
      requestedBranch === FULFILLMENT_INSTALLATION;
    const routingBranch = requiresInstallation ? FULFILLMENT_INSTALLATION : FULFILLMENT_PURCHASE_ONLY;
    const fulfillmentType: QuotationRoutingBranch = routingBranch;
    const proposalStatus = requiresInstallation
      ? STATUS_PENDING_SALES_REVIEW
      : signMethod === "DIGITAL"
        ? STATUS_SIGNED
        : STATUS_AUTOMATED_DRAFT;
    const evaluationStatus = requiresInstallation ? STATUS_PENDING_SALES_REVIEW : null;
    const submittedAt = new Date().toISOString();
    const buyerTaxId = data.taxId?.trim() || undefined;

    // A. Create Lead
    const [lead] = await db.insert(leads)
      .values({
        name: data.name,
        email: data.email,
        phone: data.phone,
        location: data.location || null,
        status: proposalStatus,
        notes: data.notes || null,
        configurationSnapshot: {
          items: data.items,
          totalPrice: data.totalPrice,
          timestamp: submittedAt,
          signMethod,
          requiresInstallation,
          fulfillmentType,
          routingBranch,
          evaluationStatus,
          pendingEvaluation: requiresInstallation,
          taxId: buyerTaxId || null,
          buyerAddress: data.location || null,
          notes: data.notes || null,
          mainBundleId: data.mainBundleId || null,
          selectedAddonIds: data.selectedAddonIds || [],
          selectedFinancingId: data.selectedFinancingId || null,
          preferredLoanTermMonths: data.preferredLoanTermMonths || null,
          downPaymentAmount: data.downPaymentAmount || null,
          monthlyBill: data.monthlyBill || null,
          propertyType: data.propertyType || null,
          acquisition,
        },
        savedConfigurationId: data.savedConfigurationId || null,
      })
      .returning();

    // Handle E-Signature upload
    let signatureUrl: string | null = null;
    const supabase = createAdminClient();
    const bucket = "proposals";

    if (!requiresInstallation && signMethod === "DIGITAL" && data.signatureBase64) {
      try {
        const base64Data = data.signatureBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const sigFileName = `signature-${lead.id}-${Date.now()}.png`;
        const sigFilePath = `signatures/${sigFileName}`;

        const sigUploadResult = await supabase.storage
          .from(bucket)
          .upload(sigFilePath, buffer, {
            contentType: "image/png",
            cacheControl: "3600",
            upsert: true
          });

        if (!sigUploadResult.error) {
          const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(sigFilePath);
          signatureUrl = publicUrl;

          // Update Lead to store signatureUrl inside configurationSnapshot
          await db.update(leads)
            .set({
              configurationSnapshot: {
                ...asRecord(lead.configurationSnapshot),
                signatureUrl,
                signedAt: new Date().toISOString(),
              },
            })
            .where(eq(leads.id, lead.id));
        }
      } catch (err) {
        console.error("Signature upload failed in submitLeadData:", err);
      }
    }

    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    let proposalId = undefined;

    if (requiresInstallation) {
      if (user) {
        const createdProposal = await db.insert(proposals)
          .values({
            userId: user.id,
            systemSizeKwp: data.systemkWp || 0,
            panelCount: data.panelCount || 0,
            totalPrice: data.totalPrice,
            monthlySavings: data.estimatedSavings || 0,
            paybackPeriod: data.paybackPeriod || "0.0",
            pdfUrl: null,
            status: proposalStatus,
            fulfillmentType,
            signatureUrl: null,
            signedAt: null,
            selectedFinancingId: data.selectedFinancingId && data.selectedFinancingId !== "cash" ? data.selectedFinancingId : null,
            configurationData: {
              items: data.items,
              location: data.location,
              meterType: data.meterType || "NORMAL",
              electricityRate: data.electricityRate || 4.5,
              phone: data.phone,
              latitude: data.latitude || null,
              longitude: data.longitude || null,
              signatureUrl: null,
              signedAt: null,
              awaitingPhysicalDocument: false,
              requiresInstallation,
              fulfillmentType,
              routingBranch,
              evaluationStatus,
              pendingEvaluation: true,
              evaluationRequestedAt: submittedAt,
              taxId: buyerTaxId || null,
              buyerAddress: data.location || null,
              notes: data.notes || null,
              signMethod,
              mainBundleId: data.mainBundleId || null,
              selectedAddonIds: data.selectedAddonIds || [],
              selectedFinancingId: data.selectedFinancingId || null,
              preferredLoanTermMonths: data.preferredLoanTermMonths || null,
              downPaymentAmount: data.downPaymentAmount || null,
              monthlyBill: data.monthlyBill || null,
              propertyType: data.propertyType || null,
            },
          })
          .returning();
        proposalId = createdProposal[0].id;
      }

      console.log(`[CRM ROUTING] Installation review requested for lead ${lead.id}`);

      revalidatePath("/admin/crm");
      revalidatePath("/admin/leads");

      if (data.email) {
        queueAutomatedProposalEmail(data.email, {
          customerName: data.name,
          proposalId,
          submissionType: "installation",
          wizardAnswers: {
            propertyType: data.propertyType || (data.dailyEnergyKwh && data.dailyEnergyKwh > 50 ? "factory" : "home"),
            monthlyBill: data.monthlyBill || 0,
            systemkWp: data.systemkWp || 0,
          },
          recommendedBundle: data.items.map(item => ({
            categoryName: item.categoryName,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
          financialPlan: {
            selectedFinancingId: data.selectedFinancingId || "cash",
            preferredLoanTermMonths: data.preferredLoanTermMonths,
            downPaymentAmount: data.downPaymentAmount,
          },
          totalPrice: data.totalPrice,
        }, "installation");
      }

      return { success: true, leadId: lead.id, proposalId, routingBranch, status: proposalStatus };
    }

    // B. Generate PDF Buffer
    const { generateProposalPdfBuffer } = await import("@/lib/pdf-generator");
    const pdfBuffer = await generateProposalPdfBuffer({
      leadId: lead.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      location: data.location,
      buyerTaxId,
      totalPrice: data.totalPrice,
      items: data.items,
      systemkWp: data.systemkWp,
      panelCount: data.panelCount,
      estimatedSavings: data.estimatedSavings,
      paybackPeriod: data.paybackPeriod,
      meterType: data.meterType,
      electricityRate: data.electricityRate,
      dailyEnergyKwh: data.dailyEnergyKwh,
      PR: data.PR,
      signatureDataUri: signMethod === "DIGITAL" ? data.signatureBase64 : null,
    });

    const fileName = `${lead.id}-${Date.now()}.pdf`;
    const filePath = `proposal-docs/${fileName}`;

    const uploadResult = await supabase.storage
      .from(bucket)
      .upload(filePath, pdfBuffer, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: true
      });

    if (uploadResult.error) {
      console.error("Supabase PDF upload failed:", uploadResult.error);
      throw new Error(`Upload failed: ${uploadResult.error.message}`);
    }

    // D. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    // E. Create ProposalDocument record
    await db.insert(proposalDocuments)
      .values({
        leadId: lead.id,
        fileUrl: publicUrl,
        status: proposalStatus,
        totalValue: data.totalPrice,
      });

    // F. Also save to the new `Proposal` table for logged-in user
    if (user) {
      const createdProposal = await db.insert(proposals)
        .values({
          userId: user.id,
          systemSizeKwp: data.systemkWp || 0,
          panelCount: data.panelCount || 0,
          totalPrice: data.totalPrice,
          monthlySavings: data.estimatedSavings || 0,
          paybackPeriod: data.paybackPeriod || "0.0",
          pdfUrl: publicUrl,
          status: proposalStatus,
          fulfillmentType,
          signatureUrl: signMethod === "DIGITAL" ? signatureUrl : null,
          signedAt: signMethod === "DIGITAL" && signatureUrl ? new Date() : null,
          selectedFinancingId: data.selectedFinancingId && data.selectedFinancingId !== "cash" ? data.selectedFinancingId : null,
          configurationData: {
            items: data.items,
            location: data.location,
            meterType: data.meterType || "NORMAL",
            electricityRate: data.electricityRate || 4.5,
            phone: data.phone,
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            signatureUrl: signMethod === "DIGITAL" ? signatureUrl : null,
            signedAt: signMethod === "DIGITAL" && signatureUrl ? new Date().toISOString() : null,
            awaitingPhysicalDocument: signMethod === "MANUAL",
            requiresInstallation,
            fulfillmentType,
            routingBranch,
            evaluationStatus,
            pendingEvaluation: requiresInstallation,
            evaluationRequestedAt: null,
            taxId: buyerTaxId || null,
            buyerAddress: data.location || null,
            notes: data.notes || null,
            signMethod,
            selectedFinancingId: data.selectedFinancingId || null,
            preferredLoanTermMonths: data.preferredLoanTermMonths || null,
            downPaymentAmount: data.downPaymentAmount || null,
            monthlyBill: data.monthlyBill || null,
            propertyType: data.propertyType || null,
          },
        })
        .returning();
      proposalId = createdProposal[0].id;
    }

    console.log(`[EMAIL PLACEHOLDER] Emailing proposal to sales@solardream.co.th for lead ${lead.id}`);

    revalidatePath("/admin/crm");
    revalidatePath("/admin/leads");

    if (data.email) {
      queueAutomatedProposalEmail(data.email, {
        customerName: data.name,
        proposalId,
        submissionType: "purchase-only",
        wizardAnswers: {
          propertyType: data.propertyType || (data.dailyEnergyKwh && data.dailyEnergyKwh > 50 ? "factory" : "home"),
          monthlyBill: data.monthlyBill || 0,
          systemkWp: data.systemkWp || 0,
        },
        recommendedBundle: data.items.map(item => ({
          categoryName: item.categoryName,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
        financialPlan: {
          selectedFinancingId: data.selectedFinancingId || "cash",
          preferredLoanTermMonths: data.preferredLoanTermMonths,
          downPaymentAmount: data.downPaymentAmount,
        },
        totalPrice: data.totalPrice,
      }, "purchase-only");
    }

    return { success: true, url: publicUrl, leadId: lead.id, proposalId, routingBranch, status: proposalStatus };
  } catch (err: unknown) {
    console.error("submitLeadData server action failed:", err);
    return { error: "Failed to process quotation request." };
  }
}

function emptyToNull(value: unknown): string | null {
  const str = String(value ?? "").trim();
  return str || null;
}

function parseJsonCell(value: unknown, fallback: unknown) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

// 5. Get all projects (Admin/Installer access)
export async function getInstallationProjects() {
  try {
    await assertAdmin();
    const projects = await db.query.installationProjects.findMany({
      orderBy: [desc(installationProjects.createdAt)],
      with: {
        lead: true,
      },
    });
    return { success: true, projects };
  } catch (err: unknown) {
    console.error("Failed to fetch installation projects:", err);
    return { error: "Failed to fetch projects." };
  }
}

// 6. Update installation project status
export async function updateProjectStatus(
  projectId: string,
  data: {
    status: string;
    scheduledDate?: Date | string | null;
    assignedTeam?: string | null;
    notes?: string | null;
    checklist?: unknown;
    photos?: string[];
  }
) {
  try {
    await assertAdmin();
    const sanitizedPhotos = data.photos === undefined
      ? undefined
      : data.photos.filter(isTrustedProjectStorageUrl).slice(0, MAX_PROJECT_PHOTOS);

    const [project] = await db.update(installationProjects)
      .set({
        status: data.status,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
        assignedTeam: data.assignedTeam || null,
        notes: data.notes || null,
        ...(data.checklist !== undefined ? { checklist: data.checklist } : {}),
        ...(sanitizedPhotos !== undefined ? { photos: sanitizedPhotos } : {}),
      })
      .where(eq(installationProjects.id, projectId))
      .returning();
    revalidatePath("/admin/projects");
    revalidatePath("/admin/leads");
    return { success: true, project: { id: project.id, status: project.status } };
  } catch (err: unknown) {
    console.error("Failed to update project status:", err);
    return { error: "Failed to update project." };
  }
}

export async function uploadInstallationProjectPhoto(
  projectId: string,
  formData: FormData,
) {
  try {
    await assertAdmin();
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return { success: false, error: "Project ID is required." };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "Photo file is required." };
    }

    const project = await db.query.installationProjects.findFirst({
      where: eq(installationProjects.id, normalizedProjectId),
      columns: { id: true },
    });

    if (!project) {
      return { success: false, error: "Installation project not found." };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: PROJECT_PHOTO_FILE_KINDS,
      fallbackName: "project-photo",
      maxBytes: MAX_PROJECT_PHOTO_BYTES,
    });

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const fileBuffer = await applySolarDreamWatermark(rawBuffer);
    const fileName = `project_${project.id}_${crypto.randomUUID()}.${validatedFile.extension}`;

    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || "root";
    const mainFolder = await getOrCreateDriveFolder(rootFolderId, "Installation Projects");
    const projectFolder = await getOrCreateDriveFolder(mainFolder.folderId, `Project_${project.id}`);

    const driveFile = await uploadBufferToDriveFolder({
      folder: projectFolder,
      fileBuffer,
      mimeType: validatedFile.contentType,
      fileName,
    });

    revalidatePath("/admin/projects");
    return {
      success: true,
      url: driveFile.fileUrl,
      fileId: driveFile.fileId,
    };
  } catch (err: unknown) {
    console.error("Failed to upload project photo to Google Drive:", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to upload project photo to Google Drive.";
    return { success: false, error: errorMessage };
  }
}

// 7. Update proposal status (Admin only)
export async function updateProposalStatus(
  proposalId: string,
  status: string
) {
  try {
    const actor = await assertAdmin();
    const [doc] = await db.update(proposalDocuments)
      .set({ status })
      .where(eq(proposalDocuments.id, proposalId))
      .returning();

    await db.insert(activityLogs)
      .values({
        entityId: doc.id,
        entityType: "DOCUMENT",
        action: "STATUS_CHANGED",
        description: `Proposal document status changed to ${status}.`,
        userId: actor.id,
      });

    revalidatePath("/admin/leads");
    revalidatePath("/admin/crm");
    return { success: true, doc: { id: doc.id, status: doc.status } };
  } catch (err: unknown) {
    console.error("Failed to update proposal status:", err);
    return { error: "Failed to update proposal status." };
  }
}
