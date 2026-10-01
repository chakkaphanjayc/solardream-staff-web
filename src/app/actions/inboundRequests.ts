"use server";

import { db, describeDatabaseError, withDatabaseRetry } from "@/db";
import { consultationLeads, inboundRequests, proposals, salesContacts, salesCustomers, salesLegacyIdentityMappings, users } from "@/db/schema";
import { eq, desc, and, like, or, isNull, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth-guard";
import { verifyErpnextLead } from "@/app/actions/erpnextQuotation";
import {
  createERPNextLead,
  updateERPNextLead,
  createErpnextCustomerIdempotently,
  bindProposalErpnextCustomer,
  safeSyncProposalQuotationToERP,
  type ERPNextLeadPayload,
} from "@/lib/erpnext";
import { broadcastEvent } from "@/lib/sse-publisher";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { SALES_NOTIFICATION_TOPICS } from "@/lib/salesNotificationConfig";
import { deleteLinkedSalesRecords } from "@/lib/salesPipelineDeletion";
import { z } from "zod";
import { normalizeSalesEmail, SALES_IDENTITY_MAPPING_VERSION, salesIdentityChecksum, SYSTEM_GUEST_EMAIL, SYSTEM_GUEST_USER_ID } from "@/lib/sales/customer-identity";

export type InboundRequestType = "WIZARD" | "BUILD" | "SERVICE";
export type InboundRequestStatus = "NEW" | "CONTACTED" | "QUOTED" | "REJECTED";
type ErpnextSyncStatus = "PENDING" | "SYNCED" | "FAILED";
type InboundRequestNote = { text: string; date: string };

const inboundRequestIdSchema = z.string().uuid();
const inboundRequestStatusSchema = z.enum(["NEW", "CONTACTED", "QUOTED", "REJECTED"]);
const inboundRequestNoteSchema = z.string().trim().min(1).max(4_000);
const MAX_NOTES_HISTORY = 100;

export type InboundLeadProfile = {
  companyName: string | null;
  jobTitle: string | null;
  territory: string;
  leadType: string;
  marketSegment: string | null;
  industry: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  preferredContactMethod: string | null;
};

export type InboundRequestItem = {
  id: string;
  customerName: string;
  phone: string;
  email: string | null;
  requestType: InboundRequestType;
  payload: Record<string, unknown>;
  source: string;
  companyName: string | null;
  jobTitle: string | null;
  territory: string;
  leadType: string;
  marketSegment: string | null;
  industry: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  preferredContactMethod: string | null;
  status: InboundRequestStatus;
  quotationId: string | null;
  consultationLeadId: string | null;
  erpnextLeadId: string | null;
  erpnextSyncStatus: ErpnextSyncStatus;
  erpnextSyncError: string | null;
  erpnextLastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// The schema is applied by `npm run db:migrate:inbound-requests` before the
// application starts. Keep this compatibility hook side-effect free so stale
// callers cannot issue DDL from a request.
async function ensureTableExists() {}

function normalizeErpnextSyncStatus(value: unknown): ErpnextSyncStatus {
  if (value === "SYNCED" || value === "FAILED") {
    return value;
  }

  return "PENDING";
}

function isInboundRequestNote(value: unknown): value is InboundRequestNote {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.text === "string" && typeof record.date === "string";
}

function normalizeNotesHistory(value: unknown): InboundRequestNote[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isInboundRequestNote).slice(0, MAX_NOTES_HISTORY);
}

function getFinitePayloadNumber(
  payload: Record<string, unknown>,
  keys: readonly string[],
  fallback: number,
  maximum: number,
): number {
  const rawValue = keys
    .map((key) => payload[key])
    .find((value) => value !== undefined && value !== null && value !== "");
  const value = typeof rawValue === "number" ? rawValue : Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, maximum);
}

function getPayloadText(payload: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeLeadProfile(
  payload: Record<string, unknown>,
  profile?: Partial<InboundLeadProfile>,
): InboundLeadProfile {
  return {
    companyName: profile?.companyName?.trim() || getPayloadText(payload, ["companyName", "company_name", "organizationName"]) || null,
    jobTitle: profile?.jobTitle?.trim() || getPayloadText(payload, ["jobTitle", "job_title", "position"]) || null,
    territory: profile?.territory?.trim() || getPayloadText(payload, ["territory"]) || "Thailand",
    leadType: profile?.leadType?.trim() || getPayloadText(payload, ["leadType", "lead_type"]) || "Client",
    marketSegment: profile?.marketSegment?.trim() || getPayloadText(payload, ["marketSegment", "market_segment"]) || null,
    industry: profile?.industry?.trim() || getPayloadText(payload, ["industry"]) || null,
    addressLine1: profile?.addressLine1?.trim() || getPayloadText(payload, ["addressLine1", "address", "location"]) || null,
    city: profile?.city?.trim() || getPayloadText(payload, ["city", "district"]) || null,
    province: profile?.province?.trim() || getPayloadText(payload, ["province", "state"]) || null,
    postalCode: profile?.postalCode?.trim() || getPayloadText(payload, ["postalCode", "postal_code", "zipCode"]) || null,
    country: profile?.country?.trim() || getPayloadText(payload, ["country"]) || "Thailand",
    preferredContactMethod: profile?.preferredContactMethod?.trim() || getPayloadText(payload, ["preferredContactMethod", "contactMethod"]) || null,
  };
}

function buildErpnextLeadPayload(input: {
  customerName: string;
  email: string | null;
  phone: string;
  source: string;
  payload: Record<string, unknown>;
  profile: InboundLeadProfile;
  status?: string;
}): ERPNextLeadPayload {
  return {
    first_name: input.customerName,
    email_id: input.email,
    mobile_no: input.phone,
    source: input.source || "Direct",
    notes: JSON.stringify(input.payload),
    status: input.status || "Lead",
    company_name: input.profile.companyName,
    job_title: input.profile.jobTitle,
    territory: input.profile.territory,
    lead_type: input.profile.leadType,
    market_segment: input.profile.marketSegment,
    industry: input.profile.industry,
    address_line1: input.profile.addressLine1,
    city: input.profile.city,
    state: input.profile.province,
    pincode: input.profile.postalCode,
    country: input.profile.country,
    preferred_contact_method: input.profile.preferredContactMethod,
    request_type: getPayloadText(input.payload, ["requestType", "request_type", "type"]) || input.source || "Direct",
    custom_system_size: input.payload.systemSizeKwp
      ?? input.payload.systemSizeKw
      ?? input.payload.sizeKwp
      ?? input.payload.recommendedSizeKw
      ?? null,
  };
}

function leadProfileFromRequest(request: typeof inboundRequests.$inferSelect): InboundLeadProfile {
  return normalizeLeadProfile(
    (request.payload as Record<string, unknown>) || {},
    {
      companyName: request.companyName,
      jobTitle: request.jobTitle,
      territory: request.territory,
      leadType: request.leadType,
      marketSegment: request.marketSegment,
      industry: request.industry,
      addressLine1: request.addressLine1,
      city: request.city,
      province: request.province,
      postalCode: request.postalCode,
      country: request.country,
      preferredContactMethod: request.preferredContactMethod,
    },
  );
}

export type CreateInboundRequestInput = {
  customerName: string;
  phone: string;
  email?: string | null;
  requestType: InboundRequestType;
  payload: Record<string, unknown>;
  source?: string;
  leadProfile?: Partial<InboundLeadProfile>;
  erpnextLeadId?: string | null;
  erpnextSyncStatus?: ErpnextSyncStatus;
  erpnextSyncError?: string | null;
};

export async function createInboundRequest(data: CreateInboundRequestInput): Promise<{ success: boolean; request?: InboundRequestItem; error?: string }> {
  try {
    await ensureTableExists();

    const name = data.customerName.trim();
    const phone = data.phone.trim();
    const email = data.email ? data.email.trim() : null;
    const source = data.source ? data.source.trim().toLowerCase() : "direct";
    const payload = data.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
      ? data.payload
      : {};
    const leadProfile = normalizeLeadProfile(payload, data.leadProfile);

    if (!name) {
      return { success: false, error: "Customer name is required" };
    }
    if (!phone) {
      return { success: false, error: "Phone number is required" };
    }
    if (name.length > 160 || phone.length > 80 || (email && email.length > 254) || source.length > 80) {
      return { success: false, error: "Inbound request fields are too long." };
    }
    if (!(["WIZARD", "BUILD", "SERVICE"] as const).includes(data.requestType)) {
      return { success: false, error: "Invalid inbound request type." };
    }

    let payloadSize = 0;
    try {
      payloadSize = JSON.stringify(payload).length;
    } catch {
      return { success: false, error: "Inbound request payload is invalid." };
    }
    if (payloadSize > 32 * 1024) {
      return { success: false, error: "Inbound request payload is too large." };
    }

    let erpnextLeadId = data.erpnextLeadId || null;
    let erpnextSyncStatus = data.erpnextSyncStatus || (erpnextLeadId ? "SYNCED" : "PENDING");
    let erpnextSyncError = data.erpnextSyncError || null;

    if (!erpnextLeadId && !data.erpnextSyncStatus) {
      try {
        const erpResult = await createERPNextLead(buildErpnextLeadPayload({
          customerName: name,
          email,
          phone,
          source,
          payload,
          profile: leadProfile,
        }));
        erpnextLeadId = erpResult.leadId;
        erpnextSyncStatus = erpnextLeadId ? "SYNCED" : "FAILED";
        erpnextSyncError = erpnextLeadId ? null : "ERPNext did not return a Lead ID.";
      } catch (syncError) {
        erpnextSyncStatus = "FAILED";
        erpnextSyncError = syncError instanceof Error ? syncError.message : "Failed to create ERPNext Lead.";
      }
    }

    const [inserted] = await db
      .insert(inboundRequests)
      .values({
        customerName: name,
        phone,
        email,
        requestType: data.requestType,
        payload,
        source,
        ...leadProfile,
        status: "NEW",
        erpnextLeadId,
        erpnextSyncStatus,
        erpnextSyncError,
        erpnextLastSyncedAt: erpnextLeadId || erpnextSyncStatus === "FAILED" ? new Date() : null,
      })
      .returning();
    if (!inserted) {
      return { success: false, error: "Failed to create inbound request." };
    }

    revalidatePath("/admin/requests");
    revalidatePath("/", "layout");

    broadcastEvent("NEW_LEAD", {
      id: inserted.id,
      name: inserted.customerName,
      source: inserted.source,
    });

    await enqueueIntegrationEvent(db, {
      topic: SALES_NOTIFICATION_TOPICS.leadReceived,
      aggregateType: "INBOUND_REQUEST",
      aggregateId: inserted.id,
      payload: {
        requestType: inserted.requestType,
        source: inserted.source,
      },
      dedupeKey: `sales.lead.received:${inserted.id}`,
    });
    await processOutboxBestEffort(inserted.id);

    return {
      success: true,
      request: {
        ...inserted,
        erpnextSyncStatus: normalizeErpnextSyncStatus(inserted.erpnextSyncStatus),
        payload: (inserted.payload as Record<string, unknown>) || {},
      },
    };
  } catch (error) {
    console.error("Error creating inbound request:", error);
    return {
      success: false,
      error: "Failed to create inbound request.",
    };
  }
}

/** Admin-only entry point for manually creating a request from the console. */
export async function createAdminInboundRequest(data: CreateInboundRequestInput): Promise<{ success: boolean; request?: InboundRequestItem; error?: string }> {
  await requireStaff();
  return createInboundRequest(data);
}

export async function linkInboundRequestToErpLead(input: {
  inboundRequestId: string | null;
  consultationLeadId?: string | null;
  erpnextLeadId?: string | null;
  error?: string | null;
}): Promise<void> {
  if (!input.inboundRequestId) return;

  await ensureTableExists();
  const synced = Boolean(input.erpnextLeadId);
  await db
    .update(inboundRequests)
    .set({
      ...(input.consultationLeadId ? { consultationLeadId: input.consultationLeadId } : {}),
      erpnextLeadId: input.erpnextLeadId || null,
      erpnextSyncStatus: synced ? "SYNCED" : "FAILED",
      erpnextSyncError: input.error || null,
      erpnextLastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(inboundRequests.id, input.inboundRequestId));

  revalidatePath("/admin/requests");
  revalidatePath("/admin/quotations");
}

export async function verifyInboundRequestErpSync(inboundRequestId: string): Promise<{
  success: boolean;
  erpnextLeadId: string | null;
  erpnextSyncStatus: ErpnextSyncStatus;
  erpnextSyncError: string | null;
  erpnextLastSyncedAt: Date;
  error?: string;
}> {
  await requireStaff();
  await ensureTableExists();

  const [request] = await db
    .select()
    .from(inboundRequests)
    .where(eq(inboundRequests.id, inboundRequestId));

  const checkedAt = new Date();
  if (!request) {
    return {
      success: false,
      erpnextLeadId: null,
      erpnextSyncStatus: "FAILED",
      erpnextSyncError: "Inbound request not found.",
      erpnextLastSyncedAt: checkedAt,
      error: "Inbound request not found.",
    };
  }

  let erpnextLeadId = request.erpnextLeadId;
  if (!erpnextLeadId && request.consultationLeadId) {
    const consultationLead = await db.query.consultationLeads.findFirst({
      where: eq(consultationLeads.id, request.consultationLeadId),
      columns: { erpLeadId: true },
    });
    erpnextLeadId = consultationLead?.erpLeadId ?? null;
  }

  // If no ERPNext Lead is linked yet, ATTEMPT TO CREATE IT NOW in ERPNext
  if (!erpnextLeadId) {
    try {
      const erpResult = await createERPNextLead(buildErpnextLeadPayload({
        customerName: request.customerName,
        email: request.email,
        phone: request.phone,
        source: request.source,
        payload: (request.payload as Record<string, unknown>) || {},
        profile: leadProfileFromRequest(request),
      }));

      if (erpResult.leadId) {
        erpnextLeadId = erpResult.leadId;
        await db.update(inboundRequests).set({
          erpnextLeadId,
          erpnextSyncStatus: "SYNCED",
          erpnextSyncError: null,
          erpnextLastSyncedAt: checkedAt,
          updatedAt: checkedAt,
        }).where(eq(inboundRequests.id, request.id));

        revalidatePath("/admin/requests");
        revalidatePath("/admin/quotations");
        return {
          success: true,
          erpnextLeadId,
          erpnextSyncStatus: "SYNCED",
          erpnextSyncError: null,
          erpnextLastSyncedAt: checkedAt,
        };
      }
    } catch (createErr) {
      const syncError = createErr instanceof Error ? createErr.message : "Failed to create lead in ERPNext.";
      await db.update(inboundRequests).set({
        erpnextSyncStatus: "FAILED",
        erpnextSyncError: syncError,
        erpnextLastSyncedAt: checkedAt,
        updatedAt: checkedAt,
      }).where(eq(inboundRequests.id, request.id));

      revalidatePath("/admin/requests");
      revalidatePath("/admin/quotations");
      return {
        success: false,
        erpnextLeadId: null,
        erpnextSyncStatus: "FAILED",
        erpnextSyncError: syncError,
        erpnextLastSyncedAt: checkedAt,
        error: syncError,
      };
    }
  }

  // If erpnextLeadId is present, verify it on ERPNext server
  const verification = await verifyErpnextLead(erpnextLeadId!);

  // If verification failed because the lead doesn't exist on ERPNext, attempt re-creation
  if (verification.success && !verification.exists) {
    try {
      const erpResult = await createERPNextLead(buildErpnextLeadPayload({
        customerName: request.customerName,
        email: request.email,
        phone: request.phone,
        source: request.source,
        payload: (request.payload as Record<string, unknown>) || {},
        profile: leadProfileFromRequest(request),
      }));

      if (erpResult.leadId) {
        const newLeadId = erpResult.leadId;
        await db.update(inboundRequests).set({
          erpnextLeadId: newLeadId,
          erpnextSyncStatus: "SYNCED",
          erpnextSyncError: null,
          erpnextLastSyncedAt: checkedAt,
          updatedAt: checkedAt,
        }).where(eq(inboundRequests.id, request.id));

        revalidatePath("/admin/requests");
        revalidatePath("/admin/quotations");
        return {
          success: true,
          erpnextLeadId: newLeadId,
          erpnextSyncStatus: "SYNCED",
          erpnextSyncError: null,
          erpnextLastSyncedAt: checkedAt,
        };
      }
    } catch {
      // fall through
    }
  }

  const erpnextSyncStatus: ErpnextSyncStatus = verification.success && verification.exists
    ? "SYNCED"
    : "FAILED";
  const erpnextSyncError = verification.success
    ? verification.exists
      ? null
      : `ERPNext Lead ${erpnextLeadId} was not found.`
    : verification.error || "Unable to verify the ERPNext Lead.";

  await db.update(inboundRequests).set({
    erpnextLeadId,
    erpnextSyncStatus,
    erpnextSyncError,
    erpnextLastSyncedAt: checkedAt,
    updatedAt: checkedAt,
  }).where(eq(inboundRequests.id, request.id));

  revalidatePath("/admin/requests");
  revalidatePath("/admin/quotations");
  return {
    success: verification.success && Boolean(verification.exists),
    erpnextLeadId,
    erpnextSyncStatus,
    erpnextSyncError,
    erpnextLastSyncedAt: checkedAt,
    ...(verification.error ? { error: verification.error } : {}),
  };
}

export async function getInboundRequests(options?: {
  type?: InboundRequestType;
  status?: InboundRequestStatus;
  search?: string;
}): Promise<InboundRequestItem[]> {
  await requireStaff();

  try {
    // Reads run during the admin RSC render. Schema changes belong to Drizzle
    // migrations, not this request path; issuing additive DDL here caused a
    // slow response and repeated PostgreSQL "already exists" notices.
    const conditions: SQL[] = [];

    if (options?.type) {
      conditions.push(eq(inboundRequests.requestType, options.type));
    }

    if (options?.status) {
      conditions.push(eq(inboundRequests.status, options.status));
    }

    if (options?.search && options.search.trim()) {
      const q = `%${options.search.trim().slice(0, 120)}%`;
      const searchCondition = or(
        like(inboundRequests.customerName, q),
        like(inboundRequests.phone, q),
        like(inboundRequests.email, q),
        like(inboundRequests.source, q)
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    const rows = await withDatabaseRetry(() => db
      .select()
      .from(inboundRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(inboundRequests.createdAt)));

    return rows.map((r) => ({
      ...r,
      erpnextSyncStatus: normalizeErpnextSyncStatus(r.erpnextSyncStatus),
      payload: (r.payload as Record<string, unknown>) || {},
    }));
  } catch (error) {
    console.error("Error fetching inbound requests:", describeDatabaseError(error));
    return [];
  }
}

export async function updateInboundRequestStatus(
  id: string,
  status: InboundRequestStatus
): Promise<{ success: boolean; error?: string }> {
  await requireStaff();

  try {
    await ensureTableExists();

    const parsedId = inboundRequestIdSchema.safeParse(id);
    const parsedStatus = inboundRequestStatusSchema.safeParse(status);
    if (!parsedId.success || !parsedStatus.success) {
      return { success: false, error: "Invalid request status update." };
    }

    const [request] = await db
      .select()
      .from(inboundRequests)
      .where(eq(inboundRequests.id, parsedId.data));

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    const [updatedRequest] = await db
      .update(inboundRequests)
      .set({
        status: parsedStatus.data,
        updatedAt: new Date(),
      })
      .where(eq(inboundRequests.id, parsedId.data))
      .returning({ id: inboundRequests.id });

    if (!updatedRequest) {
      return { success: false, error: "Request was not updated." };
    }

    // Instant Status Sync to ERPNext if linked
    if (request.erpnextLeadId) {
      const erpStatusMap: Record<InboundRequestStatus, string> = {
        NEW: "Lead",
        CONTACTED: "Open",
        QUOTED: "Quotation",
        REJECTED: "Do Not Contact",
      };

      try {
        await updateERPNextLead(
          request.erpnextLeadId,
          buildErpnextLeadPayload({
            customerName: request.customerName,
            email: request.email,
            phone: request.phone,
            source: request.source,
            payload: (request.payload as Record<string, unknown>) || {},
            profile: leadProfileFromRequest(request),
            status: erpStatusMap[parsedStatus.data] || "Lead",
          }),
        );
        await db.update(inboundRequests).set({
          erpnextSyncStatus: "SYNCED",
          erpnextSyncError: null,
          erpnextLastSyncedAt: new Date(),
        }).where(eq(inboundRequests.id, request.id));
      } catch (erpErr) {
        console.warn("[ERPNext Status Sync Notice]:", erpErr);
        await db.update(inboundRequests).set({
          erpnextSyncStatus: "FAILED",
          erpnextSyncError: erpErr instanceof Error ? erpErr.message : "Unable to update ERPNext Lead.",
          erpnextLastSyncedAt: new Date(),
        }).where(eq(inboundRequests.id, request.id));
      }
    }

    revalidatePath("/admin/requests");
    revalidatePath("/admin/quotations");
    broadcastEvent("LEAD_STATUS_CHANGED", {
      id: request.id,
      name: request.customerName,
      status: parsedStatus.data,
    });
    return { success: true };
  } catch (error) {
    console.error("Error updating request status:", error);
    return {
      success: false,
      error: "Failed to update request status.",
    };
  }
}

export async function addInboundRequestNote(
  id: string,
  noteText: string
): Promise<{ success: boolean; error?: string }> {
  await requireStaff();

  try {
    await ensureTableExists();

    const parsedId = inboundRequestIdSchema.safeParse(id);
    const parsedNote = inboundRequestNoteSchema.safeParse(noteText);
    if (!parsedId.success || !parsedNote.success) {
      return { success: false, error: "A valid note is required." };
    }

    const [request] = await db
      .select()
      .from(inboundRequests)
      .where(eq(inboundRequests.id, parsedId.data));

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    const payload = (request.payload as Record<string, unknown>) || {};
    const existingNotes = normalizeNotesHistory(payload.notesHistory);
    const newNoteObj: InboundRequestNote = { text: parsedNote.data, date: new Date().toISOString() };
    const updatedNotesHistory = [newNoteObj, ...existingNotes].slice(0, MAX_NOTES_HISTORY);
    const updatedPayload = { ...payload, notesHistory: updatedNotesHistory, latestNote: parsedNote.data };

    const [updatedRequest] = await db
      .update(inboundRequests)
      .set({
        payload: updatedPayload,
        updatedAt: new Date(),
      })
      .where(eq(inboundRequests.id, parsedId.data))
      .returning({ id: inboundRequests.id });

    if (!updatedRequest) {
      return { success: false, error: "Request was not updated." };
    }

    // Instant Note Sync to ERPNext if linked
    if (request.erpnextLeadId) {
      try {
        await updateERPNextLead(request.erpnextLeadId, {
          notes: parsedNote.data,
        });
        await db
          .update(inboundRequests)
          .set({
            erpnextSyncStatus: "SYNCED",
            erpnextSyncError: null,
            erpnextLastSyncedAt: new Date(),
          })
          .where(eq(inboundRequests.id, request.id));
      } catch (erpErr) {
        console.warn("[ERPNext Note Sync Notice]:", erpErr);
        await db
          .update(inboundRequests)
          .set({
            erpnextSyncStatus: "FAILED",
            erpnextSyncError:
              erpErr instanceof Error ? erpErr.message : "Unable to update ERPNext Lead.",
            erpnextLastSyncedAt: new Date(),
          })
          .where(eq(inboundRequests.id, request.id));
      }
    }

    revalidatePath("/admin/requests");
    revalidatePath("/admin/quotations");
    return { success: true };
  } catch (error) {
    console.error("Error adding note to inbound request:", error);
    return {
      success: false,
      error: "Failed to add note.",
    };
  }
}

async function getOrCreateGuestUser(): Promise<string> {
  // All anonymous conversions use one explicit, mapped sentinel identity. Lead contact
  // data stays on the inbound request; it must never be used to guess an auth identity.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('system-guest-sales-identity'))`);
    const [guest] = await tx.insert(users).values({
      id: SYSTEM_GUEST_USER_ID, email: SYSTEM_GUEST_EMAIL, name: "System Guest User",
      fullName: "System Guest User", role: "CUSTOMER",
    }).onConflictDoNothing().returning({ id: users.id });
    const userId = guest?.id ?? (await tx.select({ id: users.id }).from(users).where(eq(users.id, SYSTEM_GUEST_USER_ID)).limit(1))[0]?.id;
    if (!userId) throw new Error("Unable to resolve the explicit system guest identity.");

    const [customer] = await tx.insert(salesCustomers).values({
      displayName: "System Guest", legacyKey: `USER:${SYSTEM_GUEST_USER_ID}`,
      sourceReferences: { systemIdentity: "anonymous-inbound-conversion" },
    }).onConflictDoNothing().returning({ id: salesCustomers.id });
    const customerId = customer?.id ?? (await tx.select({ id: salesCustomers.id }).from(salesCustomers).where(eq(salesCustomers.legacyKey, `USER:${SYSTEM_GUEST_USER_ID}`)).limit(1))[0]?.id;
    if (!customerId) throw new Error("Unable to resolve the system guest sales customer.");

    let [contact] = await tx.select({ id: salesContacts.id }).from(salesContacts).where(eq(salesContacts.userId, userId)).limit(1);
    if (!contact) {
      [contact] = await tx.insert(salesContacts).values({ customerId, userId, legacyKey: `USER:${userId}`, displayName: "System Guest", email: SYSTEM_GUEST_EMAIL, normalizedEmail: normalizeSalesEmail(SYSTEM_GUEST_EMAIL) }).returning({ id: salesContacts.id });
    }
    if (!contact) throw new Error("Unable to resolve the system guest sales contact.");
    const checksum = salesIdentityChecksum({ userId, erpnextCustomerId: null, name: "System Guest", email: SYSTEM_GUEST_EMAIL, phone: null });
    await tx.insert(salesLegacyIdentityMappings).values({ userId, customerId, contactId: contact.id, mappingRule: "SYSTEM_GUEST", mappingVersion: SALES_IDENTITY_MAPPING_VERSION, inputChecksum: checksum }).onConflictDoUpdate({ target: salesLegacyIdentityMappings.userId, set: { customerId, contactId: contact.id, mappingRule: "SYSTEM_GUEST", mappingVersion: SALES_IDENTITY_MAPPING_VERSION, inputChecksum: checksum, updatedAt: new Date() } });
    return userId;
  });
}

export async function generateQuotationFromInboundRequest(
  id: string
): Promise<{ success: boolean; quotationId?: string; erpnextQuotationName?: string; error?: string }> {
  await requireStaff();

  try {
    await ensureTableExists();

    const parsedId = inboundRequestIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { success: false, error: "Invalid inbound request." };
    }

    const [requestSnapshot] = await db
      .select()
      .from(inboundRequests)
      .where(eq(inboundRequests.id, parsedId.data));

    if (!requestSnapshot) {
      return { success: false, error: "Request not found" };
    }

    if (requestSnapshot.quotationId) {
      return { success: true, quotationId: requestSnapshot.quotationId };
    }

    const userId = await getOrCreateGuestUser();

    // Serialize conversion attempts for the same inbound request. The admin
    // console exposes this action from multiple screens, so a double click or
    // two browser tabs must not create duplicate local proposals.
    const conversion = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(inboundRequests)
        .where(eq(inboundRequests.id, parsedId.data))
        .for("update");

      if (!request) return { kind: "missing" as const };
      if (request.quotationId) {
        return { kind: "existing" as const, quotationId: request.quotationId };
      }

      const payload = (request.payload as Record<string, unknown>) || {};
      const systemSizeKwp = getFinitePayloadNumber(
        payload,
        ["systemSizeKwp", "sizeKwp", "recommendedSizeKw"],
        5.5,
        10_000,
      );
      const totalPrice = getFinitePayloadNumber(
        payload,
        ["totalPrice", "estimatedPrice", "price"],
        systemSizeKwp * 28_000,
        1_000_000_000_000,
      );

      const [insertedProposal] = await tx
        .insert(proposals)
        .values({
          userId,
          systemSizeKwp,
          panelCount: Math.ceil((systemSizeKwp * 1000) / 550),
          totalPrice,
          monthlySavings: Math.round(systemSizeKwp * 4.5 * 30 * 4.2),
          paybackPeriod: "4.5 Years",
          configurationData: {
            clientName: request.customerName,
            phone: request.phone,
            email: request.email,
            source: request.source,
            inboundRequestId: parsedId.data,
            notes: `Generated from Inbound Request [ID: ${parsedId.data}] (Type: ${request.requestType}, Source: ${request.source})`,
            payload,
          },
          status: "APPROVED",
        })
        .returning();

      if (!insertedProposal) {
        throw new Error("Failed to create local proposal.");
      }

      const [linkedRequest] = await tx
        .update(inboundRequests)
        .set({
          quotationId: insertedProposal.id,
          status: "QUOTED",
          updatedAt: new Date(),
        })
        .where(and(eq(inboundRequests.id, parsedId.data), isNull(inboundRequests.quotationId)))
        .returning({ id: inboundRequests.id });

      if (!linkedRequest) {
        throw new Error("Inbound request was already converted.");
      }

      return { kind: "created" as const, request, insertedProposal, payload };
    });

    if (conversion.kind === "missing") {
      return { success: false, error: "Request not found" };
    }
    if (conversion.kind === "existing") {
      return { success: true, quotationId: conversion.quotationId };
    }

    const { request, insertedProposal, payload } = conversion;

    // 2. AUTOMATICALLY CREATE CUSTOMER AND QUOTATION IN ERPNEXT
    let erpnextCustomerId: string | null = null;
    let erpnextQuotationName: string | null = null;

    try {
      // Create or find Customer in ERPNext
      const customerRes = await createErpnextCustomerIdempotently({
        name: request.customerName,
        email: request.email || undefined,
        phone: request.phone || undefined,
        address: (payload.address || payload.location || payload.companyAddress) as string | undefined,
      });

      if (customerRes.customerId) {
        erpnextCustomerId = customerRes.customerId;
        await bindProposalErpnextCustomer({
          proposalId: insertedProposal.id,
          customerId: erpnextCustomerId,
          actorUserId: userId,
          source: "inbound_request_conversion",
        });

        // Sync Quotation to ERPNext
        const syncRes = await safeSyncProposalQuotationToERP(insertedProposal.id);
        if (syncRes?.remoteName) {
          erpnextQuotationName = syncRes.remoteName;
        }
      }
    } catch (erpErr) {
      console.warn("[ERPNext Customer & Quotation Auto Creation Notice]:", erpErr);
    }

    // 3. Update Lead status in ERPNext to "Quotation" if lead exists
    if (request.erpnextLeadId) {
      try {
        await updateERPNextLead(request.erpnextLeadId, {
          status: "Quotation",
        });
      } catch (leadErr) {
        console.warn("[ERPNext Lead Conversion Status Notice]:", leadErr);
      }
    }

    // The local proposal was linked atomically above. Only the external-sync
    // status remains to be updated here; a failed ERPNext/outbox call must not
    // make a successfully-created local quotation look like a failed mutation.
    const [updatedRequest] = await db
      .update(inboundRequests)
      .set({
        erpnextSyncStatus: erpnextQuotationName ? "SYNCED" : request.erpnextSyncStatus,
        updatedAt: new Date(),
      })
      .where(eq(inboundRequests.id, parsedId.data))
      .returning({ id: inboundRequests.id });

    if (!updatedRequest) {
      console.error("Inbound request quotation sync state could not be updated", {
        inboundRequestId: parsedId.data,
        quotationId: insertedProposal.id,
      });
    }

    try {
      revalidatePath("/admin/requests");
      revalidatePath("/admin/quotations");
      broadcastEvent("QUOTATION_UPDATED", {
        id: insertedProposal.id,
        title: `Quotation for ${request.customerName}`,
        status: "QUOTED",
      });
    } catch (notificationError) {
      console.warn("Inbound quotation cache/event notice:", notificationError);
    }

    try {
      await enqueueIntegrationEvent(db, {
        topic: SALES_NOTIFICATION_TOPICS.quotationReady,
        aggregateType: "PROPOSAL",
        aggregateId: insertedProposal.id,
        payload: {
          inboundRequestId: request.id,
          requestType: request.requestType,
          erpnextQuotationName,
        },
        dedupeKey: `sales.quotation.ready:${insertedProposal.id}`,
      });
      await processOutboxBestEffort(insertedProposal.id);
    } catch (outboxError) {
      console.error("Inbound quotation outbox notice:", outboxError);
    }

    return {
      success: true,
      quotationId: insertedProposal.id,
      erpnextQuotationName: erpnextQuotationName || undefined,
    };
  } catch (error) {
    console.error("Error generating quotation from inbound request:", error);
    return {
      success: false,
      error: "Failed to generate quotation.",
    };
  }
}

export async function deleteInboundRequest(id: string) {
  try {
    const staff = await requireStaff();
    const parsedId = inboundRequestIdSchema.safeParse(id);
    if (!parsedId.success) {
      return { success: false, error: "Invalid request ID format." };
    }

    const result = await deleteLinkedSalesRecords(
      [{ type: "INBOUND_REQUEST", id: parsedId.data }],
      { id: staff.id, label: staff.fullName || staff.name || staff.email || "Staff" },
    );

    if (!result.success) {
      return { success: false, error: result.error || "Request or service order not found." };
    }

    revalidatePath("/admin/requests");
    revalidatePath("/admin/quotations");

    try {
      broadcastEvent("INBOUND_REQUEST_DELETED", { id: parsedId.data });
    } catch (e) {
      console.warn("Failed to broadcast delete event:", e);
    }

    return { success: true, counts: result.counts };
  } catch (error) {
    console.error("Error deleting inbound request / service order:", error);
    return { success: false, error: "Failed to delete request." };
  }
}

export async function bulkDeleteInboundRequests(ids: string[]) {
  try {
    const staff = await requireStaff();
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: false, error: "No request IDs provided." };
    }

    const validIds = ids.filter((id) => inboundRequestIdSchema.safeParse(id).success);
    if (validIds.length === 0) {
      return { success: false, error: "No valid request IDs to delete." };
    }

    const result = await deleteLinkedSalesRecords(
      validIds.map((id) => ({ type: "INBOUND_REQUEST" as const, id })),
      { id: staff.id, label: staff.fullName || staff.name || staff.email || "Staff" },
    );

    if (!result.success) {
      return { success: false, error: result.error || "Failed to bulk delete requests." };
    }

    revalidatePath("/admin/requests");
    revalidatePath("/admin/quotations");

    return { success: true, count: result.counts?.inboundRequests ?? 0, counts: result.counts };
  } catch (error) {
    console.error("Error bulk deleting inbound requests / service orders:", error);
    return { success: false, error: "Failed to bulk delete requests." };
  }
}
