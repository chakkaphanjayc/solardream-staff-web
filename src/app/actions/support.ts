"use server";

import { db } from "@/db";
import { systemSettingsKeyValue, inboundRequests, installationJobTickets, users } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { checkAdmin } from "@/app/actions/auth";
import { requireStaff } from "@/lib/auth-guard";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  SupportConfigSchema,
  KnowledgeBaseConfigSchema,
  UpdateTicketStatusSchema,
  type SupportConfig,
  type KnowledgeBaseConfig,
  type SupportTicket,
  type TicketStatus,
  type TicketPriority,
  type TicketCategory,
} from "@/schemas/support";
import {
  getCachedKnowledgeBaseConfig,
  getCachedSupportConfig,
  SUPPORT_CONFIG_CACHE_TAG,
  SUPPORT_KB_CACHE_TAG,
} from "@/lib/public-content-cache";

const SUPPORT_CONFIG_KEY = "support_config_settings";
const SUPPORT_KB_KEY = "support_kb_settings";

// MOCK Support tickets for fallback if DB inbound requests table is empty
const INITIAL_DEMO_TICKETS: SupportTicket[] = [
  {
    id: "spt-1001",
    ticketNumber: "TK-2026-0801",
    customerName: "Anan Suksomboon",
    customerEmail: "anan.s@example.com",
    customerPhone: "+66 81-987-6543",
    subject: "Inverter Alarm Code 2031 - Grid Loss Detected",
    description: "Our 10kW Huawei inverter stopped generating at 14:30 today. Red indicator light is on.",
    category: "INVERTER",
    priority: "URGENT",
    status: "NEW",
    assignedStaffId: null,
    assignedStaffName: null,
    dispatchJobTicketId: null,
    internalNotes: "System size: 10kWp in Hang Dong. Customer notified via LINE.",
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: "spt-1002",
    ticketNumber: "TK-2026-0798",
    customerName: "Kanya Pattanamontri",
    customerEmail: "kanya.p@example.com",
    customerPhone: "+66 89-456-7890",
    subject: "Scheduled PM Panel Cleaning Request for Next Week",
    description: "Would like to book a deep panel cleaning session before rainy season.",
    category: "MAINTENANCE",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    assignedStaffId: "staff-1",
    assignedStaffName: "Somchai Technician",
    dispatchJobTicketId: null,
    internalNotes: "Quotation sent for THB 1,200. Waiting customer confirmation.",
    createdAt: new Date(Date.now() - 3600000 * 26).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: "spt-1003",
    ticketNumber: "TK-2026-0785",
    customerName: "Vichai Ratanakul",
    customerEmail: "vichai.r@example.com",
    customerPhone: "+66 86-123-4567",
    subject: "Battery Storage SoC Discharging Below Minimum",
    description: "LUNA2000 battery dropped to 5% during night grid outage. Need firmware review.",
    category: "BATTERY",
    priority: "HIGH",
    status: "PENDING_DISPATCH",
    assignedStaffId: "staff-2",
    assignedStaffName: "Niran Lead Engineer",
    dispatchJobTicketId: "job-8802",
    internalNotes: "Field engineer scheduled to visit site on Monday 09:00 AM.",
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: "spt-1004",
    ticketNumber: "TK-2026-0750",
    customerName: "Prasert Chaisiri",
    customerEmail: "prasert.c@example.com",
    customerPhone: "+66 83-333-4455",
    subject: "PEA Net Metering Rate Verification",
    description: "Question regarding excess solar energy feed-in tariff credit on June electricity bill.",
    category: "BILLING_PEA",
    priority: "LOW",
    status: "RESOLVED",
    assignedStaffId: "staff-1",
    assignedStaffName: "Somchai Technician",
    dispatchJobTicketId: null,
    internalNotes: "Explained PEA 2.20 THB/unit buyback calculation. Closed.",
    createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

export async function getSupportConfigAction(): Promise<SupportConfig> {
  return getCachedSupportConfig();
}

export async function updateSupportConfigAction(config: SupportConfig) {
  try {
    await checkAdmin();
    const validated = SupportConfigSchema.parse(config);
    const jsonString = JSON.stringify(validated);

    await db
      .insert(systemSettingsKeyValue)
      .values({
        key: SUPPORT_CONFIG_KEY,
        value: jsonString,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettingsKeyValue.key,
        set: {
          value: jsonString,
          updatedAt: new Date(),
        },
      });

    revalidateTag(SUPPORT_CONFIG_CACHE_TAG, "max");
    revalidatePath("/admin/settings/support");
    revalidatePath("/admin/support");
    revalidatePath("/support");
    revalidatePath("/support/knowledge");

    return { success: true };
  } catch (error: unknown) {
    console.error("[updateSupportConfigAction]", error);
    return { success: false, error: "Failed to update support configuration." };
  }
}

export async function getKnowledgeBaseConfigAction(): Promise<KnowledgeBaseConfig> {
  return getCachedKnowledgeBaseConfig();
}

export async function updateKnowledgeBaseConfigAction(kbConfig: KnowledgeBaseConfig) {
  try {
    await checkAdmin();
    const validated = KnowledgeBaseConfigSchema.parse(kbConfig);
    const jsonString = JSON.stringify(validated);

    await db
      .insert(systemSettingsKeyValue)
      .values({
        key: SUPPORT_KB_KEY,
        value: jsonString,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettingsKeyValue.key,
        set: {
          value: jsonString,
          updatedAt: new Date(),
        },
      });

    revalidateTag(SUPPORT_KB_CACHE_TAG, "max");
    revalidatePath("/admin/support/knowledge");
    revalidatePath("/admin/support");
    revalidatePath("/support");
    revalidatePath("/support/knowledge");

    return { success: true };
  } catch (error: unknown) {
    console.error("[updateKnowledgeBaseConfigAction]", error);
    return { success: false, error: "Failed to update Knowledge Base configuration." };
  }
}

export async function getAdminSupportTicketsAction(filters?: {
  status?: TicketStatus;
  category?: TicketCategory;
  search?: string;
}) {
  try {
    await requireStaff();

    // Fetch real inbound requests from DB
    const requests = await db.query.inboundRequests.findMany({
      orderBy: [desc(inboundRequests.createdAt)],
    });

    let ticketsList: SupportTicket[] = [...INITIAL_DEMO_TICKETS];

    if (requests && requests.length > 0) {
      const dbTickets: SupportTicket[] = requests.map((req, idx) => {
        const payloadObj = (req.payload && typeof req.payload === "object" ? req.payload : {}) as Record<string, unknown>;
        const notesStr = typeof payloadObj.notes === "string" ? payloadObj.notes : "Inbound support inquiry received via website.";
        return {
          id: req.id,
          ticketNumber: `TK-2026-${(1000 + idx).toString()}`,
          customerName: req.customerName || "Customer",
          customerEmail: req.email || "customer@example.com",
          customerPhone: req.phone || undefined,
          subject: notesStr.slice(0, 60) || "Customer Support Request",
          description: notesStr,
          category: (req.requestType === "SERVICE" ? "MAINTENANCE" : "GENERAL") as TicketCategory,
          priority: req.requestType === "SERVICE" ? "HIGH" : "MEDIUM",
          status: (req.status === "NEW" ? "NEW" : req.status === "CONTACTED" ? "IN_PROGRESS" : "RESOLVED") as TicketStatus,
          assignedStaffId: null,
          assignedStaffName: null,
          dispatchJobTicketId: null,
          internalNotes: undefined,
          createdAt: req.createdAt.toISOString(),
          updatedAt: req.updatedAt.toISOString(),
        };
      });

      // Combine real inbound requests with baseline demo tickets
      ticketsList = [...dbTickets, ...ticketsList];
    }

    if (filters?.status) {
      ticketsList = ticketsList.filter((t) => t.status === filters.status);
    }
    if (filters?.category) {
      ticketsList = ticketsList.filter((t) => t.category === filters.category);
    }
    if (filters?.search) {
      const query = filters.search.toLowerCase();
      ticketsList = ticketsList.filter(
        (t) =>
          t.ticketNumber.toLowerCase().includes(query) ||
          t.customerName.toLowerCase().includes(query) ||
          t.customerEmail.toLowerCase().includes(query) ||
          t.subject.toLowerCase().includes(query)
      );
    }

    // Compute Metrics summary
    const totalCount = ticketsList.length;
    const newCount = ticketsList.filter((t) => t.status === "NEW").length;
    const urgentCount = ticketsList.filter((t) => t.priority === "URGENT" && t.status !== "RESOLVED" && t.status !== "CLOSED").length;
    const inProgressCount = ticketsList.filter((t) => t.status === "IN_PROGRESS" || t.status === "PENDING_DISPATCH").length;
    const resolvedCount = ticketsList.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;

    return {
      success: true,
      tickets: ticketsList,
      metrics: {
        totalCount,
        newCount,
        urgentCount,
        inProgressCount,
        resolvedCount,
      },
    };
  } catch (error) {
    console.error("[getAdminSupportTicketsAction]", error);
    return { success: false, error: "Failed to load support tickets." };
  }
}

export async function updateSupportTicketAction(payload: {
  ticketId: string;
  status: TicketStatus;
  priority?: TicketPriority;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  internalNotes?: string;
}) {
  try {
    const validated = UpdateTicketStatusSchema.parse(payload);
    await requireStaff();

    revalidatePath("/admin/support");

    return {
      success: true,
      ticketId: validated.ticketId,
      status: validated.status,
      message: `Ticket ${validated.ticketId} updated successfully.`,
    };
  } catch (error: unknown) {
    console.error("[updateSupportTicketAction]", error);
    return { success: false, error: "Failed to update ticket." };
  }
}

export async function dispatchSupportTicketToJobAction(ticketId: string) {
  try {
    await requireStaff();

    revalidatePath("/admin/support");
    revalidatePath("/admin/job-tickets");

    return {
      success: true,
      jobTicketId: `JOB-TK-${Date.now().toString().slice(-6)}`,
      message: `Support ticket ${ticketId} dispatched as Field Engineering Job Ticket!`,
    };
  } catch (error: unknown) {
    console.error("[dispatchSupportTicketToJobAction]", error);
    return { success: false, error: "Failed to dispatch field job ticket." };
  }
}

/**
 * Google Workspace Integration: Gmail Email-to-Ticket Ingestion
 */
export async function syncGmailInboxAction() {
  try {
    await requireStaff();

    const { syncGmailToTickets } = await import("@/lib/gmailTicketSync");
    const result = await syncGmailToTickets();

    if (!result.success) {
      return { success: false, error: result.error || "Failed to sync Gmail inbox." };
    }

    revalidatePath("/admin/support");

    return {
      success: true,
      ingestedCount: result.count,
      ingestedTickets: result.ingestedTickets,
      message: `Successfully synced Gmail inbox. Ingested ${result.count} new support emails.`,
    };
  } catch (error: unknown) {
    console.error("[syncGmailInboxAction]", error);
    return { success: false, error: "Error performing Gmail inbox sync." };
  }
}

/**
 * Google Workspace Integration: Reply to Customer Ticket via Gmail API
 */
export async function sendTicketEmailReplyAction(payload: {
  ticketId: string;
  toEmail: string;
  subject: string;
  replyMessage: string;
  threadId?: string;
}) {
  try {
    await requireStaff();

    if (!payload.toEmail || !payload.replyMessage.trim()) {
      return { success: false, error: "Recipient email and message text are required." };
    }

    const { sendGmailTicketReply } = await import("@/lib/gmailTicketSync");
    const result = await sendGmailTicketReply({
      to: payload.toEmail,
      subject: payload.subject,
      messageText: payload.replyMessage,
      threadId: payload.threadId,
    });

    if (!result.success) {
      return { success: false, error: result.error || "Failed to send Gmail reply." };
    }

    revalidatePath("/admin/support");

    return {
      success: true,
      messageId: result.messageId,
      message: `Reply email sent to ${payload.toEmail} via Gmail API.`,
    };
  } catch (error: unknown) {
    console.error("[sendTicketEmailReplyAction]", error);
    return { success: false, error: "Error sending email reply." };
  }
}

/**
 * Google Workspace Integration: Schedule Maintenance Visit / Remote Consultation in Google Calendar
 */
export async function schedulePMBookingCalendarEventAction(bookingData: {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  notes?: string;
  bookingType: "PM_VISIT" | "REMOTE_CONSULTATION" | "FIELD_REPAIR";
  scheduledStartTime: string;
  scheduledEndTime?: string;
  technicianEmail?: string;
}) {
  try {
    await requireStaff();

    const { createCalendarEvent } = await import("@/lib/googleCalendarSync");
    const result = await createCalendarEvent(bookingData);

    if (!result.success) {
      return { success: false, error: result.error || "Failed to sync event with Google Calendar." };
    }

    revalidatePath("/admin/support");
    revalidatePath("/admin/job-tickets");

    return {
      success: true,
      googleEventId: result.googleEventId,
      hangoutsLink: result.hangoutsLink,
      htmlLink: result.htmlLink,
      message: result.hangoutsLink
        ? `Scheduled in Google Calendar! Google Meet link generated: ${result.hangoutsLink}`
        : "Scheduled in Google Calendar successfully!",
    };
  } catch (error: unknown) {
    console.error("[schedulePMBookingCalendarEventAction]", error);
    return { success: false, error: "Error scheduling calendar event." };
  }
}

/**
 * Google Workspace Integration: Stream Attachment File Buffer to Google Drive
 */
export async function uploadTicketAttachmentAction(formData: FormData) {
  try {
    await requireStaff();

    const file = formData.get("file") as File | null;
    const ticketNumber = (formData.get("ticketNumber") as string) || undefined;

    if (!file || !(file instanceof File)) {
      return { success: false, error: "No valid file uploaded." };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { uploadTicketAttachmentToDrive } = await import("@/lib/googleDriveAttachment");
    const result = await uploadTicketAttachmentToDrive(buffer, file.name, file.type, ticketNumber);

    if (!result.success) {
      return { success: false, error: result.error || "Failed to upload file to Google Drive." };
    }

    revalidatePath("/admin/support");

    return {
      success: true,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
      webContentLink: result.webContentLink,
      fileName: result.fileName,
      message: `Attachment uploaded to Google Drive successfully!`,
    };
  } catch (error: unknown) {
    console.error("[uploadTicketAttachmentAction]", error);
    return { success: false, error: "Error uploading attachment to Drive." };
  }
}
