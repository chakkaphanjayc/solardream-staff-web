"use server";

import { db } from "@/db";
import { proposals, jobTickets, operationsTickets, users, jobTicketDocuments, installationJobTickets, activityLogs, inboundRequests } from "@/db/schema";
import { eq, desc, and, or, inArray, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import { safeSyncProposalQuotationToERP, safeSyncOperationsTicketToERP } from "@/lib/erpnext";
import { generateErpnextProjectForProposal } from "@/app/actions/erpnextProject";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";
import { getStaffProposalVisibility } from "@/lib/developerAccess";

const MAX_SITE_SURVEY_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_PROJECT_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_COMPLETION_PHOTOS = 20;
const MAX_SITE_SURVEY_PHOTOS_PER_UPDATE = 12;
const SITE_SURVEY_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic"];
const PROJECT_DOCUMENT_FILE_KINDS: readonly UploadFileKind[] = ["pdf", "jpeg", "png", "webp", "heic"];

type JsonRecord = Record<string, unknown>;
type GeoCoordinates = { lat: number; lng: number };

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function getProposalConfig(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function getProposalCoordinates(config: JsonRecord): GeoCoordinates | null {
  const lat = getFiniteNumber(config.latitude);
  const lng = getFiniteNumber(config.longitude);
  return lat === null || lng === null ? null : { lat, lng };
}

function sanitizeStorageName(value: string, fallback = "document"): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function isTrustedProposalStorageUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return false;
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredSupabaseUrl) return false;

  try {
    const url = new URL(value);
    const supabaseHost = new URL(configuredSupabaseUrl).hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === supabaseHost &&
      url.pathname.includes("/storage/v1/object/public/proposals/")
    );
  } catch {
    return false;
  }
}

/**
 * Fetches all proposals currently awaiting verification (status: SIGNED_WAITING_VERIFY).
 * Restricted to STAFF/ADMIN role types.
 */
export async function getPendingProposalsForVerification() {
  try {
    await requireStaff();

    const proposalsList = await db.query.proposals.findMany({
      where: eq(proposals.status, "SIGNED_WAITING_VERIFY"),
      with: {
        user: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: [desc(proposals.updatedAt)],
    });

    return { success: true, proposals: proposalsList };
  } catch (error: unknown) {
    console.error("Failed to fetch pending verification proposals:", error);
    return { error: "Unauthorized or failed to fetch pending proposals." };
  }
}

/**
 * Generates an operational Job Ticket from a signed proposal.
 * Transition status of proposal to CONFIRMED and spawns a new JobTicket entry.
 */
export async function generateJobTicketFromProposal(proposalId: string) {
  try {
    await requireStaff();

    // 1. Fetch proposal
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });

    if (!proposal) {
      return { error: "Proposal not found." };
    }

    if (proposal.status !== "SIGNED_WAITING_VERIFY") {
      return { error: `Cannot generate job ticket for proposal in status: ${proposal.status}` };
    }

    // 2. Parse configurationData for pre-fill info (phone, address, coordinates)
    const configData = getProposalConfig(proposal.configurationData);
    const customerPhone = getText(configData.phone);
    const customerAddress = getText(configData.location);
    const coordinates = getProposalCoordinates(configData);

    // 3. Execute database transaction to update proposal status and create ticket
    const result = await db.transaction(async (tx) => {
      // A. Update proposal status to the field automation trigger state
      const [updatedProposal] = await tx.update(proposals)
        .set({
          status: "VERIFIED_IN_PROGRESS",
        })
        .where(eq(proposals.id, proposalId))
        .returning({ id: proposals.id });
      if (!updatedProposal) throw new Error("Proposal no longer exists.");

      // B. Check if JobTicket already exists
      const existingTicket = await tx.query.jobTickets.findFirst({
        where: eq(jobTickets.proposalId, proposalId),
      });

      if (existingTicket) {
        return existingTicket;
      }

      // C. Create new JobTicket pre-filled with customer phone, address, coordinates, and drive url
      const [ticket] = await tx.insert(jobTickets)
        .values({
          proposalId,
          customerPhone,
          customerAddress,
          coordinates,
          signedDocumentDriveUrl: proposal.signedDocumentDriveUrl,
          status: "PENDING",
        })
        .returning();
      if (!ticket) throw new Error("Job ticket could not be created.");

      return ticket;
    });

    revalidatePath("/admin/tickets");
    revalidatePath("/proposals");

    try {
      await safeSyncProposalQuotationToERP(proposalId);
    } catch (syncError: unknown) {
      console.error("Failed to sync proposal to ERPNext after ticket generation:", syncError);
    }

    try {
      await generateErpnextProjectForProposal(proposalId);
    } catch (projectError: unknown) {
      console.error("Failed to create ERPNext project after verification:", projectError);
    }

    return { success: true, ticket: result };
  } catch (error: unknown) {
    console.error("Failed to generate job ticket:", error);
    return { error: "Failed to generate job ticket." };
  }
}

/**
 * Fetches all operations tickets with optional filtering.
 * Restricted to STAFF/ADMIN role types.
 */
export async function getOperationsTickets(filters?: {
  assignedRole?: string;
  phase?: string;
  status?: string;
}) {
  try {
    await requireStaff();

    const conditions = [];
    if (filters?.assignedRole) {
      conditions.push(eq(operationsTickets.assignedRole, filters.assignedRole));
    }
    if (filters?.phase) {
      conditions.push(eq(operationsTickets.phase, filters.phase));
    }
    if (filters?.status) {
      conditions.push(eq(operationsTickets.status, filters.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const ticketsList = await db.query.operationsTickets.findMany({
      where: whereClause,
      with: {
        proposal: {
          with: {
            user: {
              columns: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [desc(operationsTickets.createdAt)],
    });

    return { success: true, tickets: ticketsList };
  } catch (error: unknown) {
    console.error("Failed to fetch operations tickets:", error);
    return { error: "Failed to fetch operations tickets." };
  }
}

/**
 * Fetches a single operations ticket by ID with full details.
 */
export async function getOperationsTicketById(ticketId: string) {
  try {
    await requireStaff();

    const ticket = await db.query.operationsTickets.findFirst({
      where: eq(operationsTickets.id, ticketId),
      with: {
        proposal: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
            projectProgression: true,
          },
        },
      },
    });

    if (!ticket) {
      return { error: "Ticket not found." };
    }

    return { success: true, ticket };
  } catch (error: unknown) {
    console.error("Failed to fetch operations ticket:", error);
    return { error: "Failed to fetch operations ticket." };
  }
}

/**
 * Updates an operations ticket with form data, signatures, and status.
 */
export async function updateOperationsTicket(
  ticketId: string,
  data: {
    formData?: unknown;
    signatures?: unknown;
    status?: string;
    generatedDocUrl?: string;
  }
) {
  try {
    await requireStaff();

    const [updated] = await db.update(operationsTickets)
      .set({
        formData: isRecord(data.formData) ? data.formData : {},
        signatures: isRecord(data.signatures) ? data.signatures : {},
        status: data.status,
        generatedDocUrl: data.generatedDocUrl,
        updatedAt: new Date(),
      })
      .where(eq(operationsTickets.id, ticketId))
      .returning({ id: operationsTickets.id });
    if (!updated) return { error: "Operations ticket not found." };

    const ticket = await db.query.operationsTickets.findFirst({
      where: eq(operationsTickets.id, ticketId),
      with: {
        proposal: {
          with: {
            user: {
              columns: {
                name: true,
              },
            },
          },
        },
      },
    });

    revalidatePath("/admin/tickets");

    if (ticket) {
      try {
        await safeSyncOperationsTicketToERP(ticket);
      } catch (syncError: unknown) {
        console.error("Failed to sync operations ticket to ERPNext:", syncError);
      }
    }

    return { success: true, ticket };
  } catch (error: unknown) {
    console.error("Failed to update operations ticket:", error);
    return { error: "Failed to update operations ticket." };
  }
}

/**
 * Fetches all job tickets, joined with proposals and installers.
 */
export async function getJobTickets() {
  try {
    const actor = await requireStaff();
    const visibility = await getStaffProposalVisibility(actor.id, "tickets");
    if (visibility?.mode === "NONE") return { success: true, tickets: [] };
    if (visibility?.mode === "OWN" && "ownedProposalIds" in visibility && visibility.ownedProposalIds.length === 0) {
      return { success: true, tickets: [] };
    }

    const tickets = await db.query.installationJobTickets.findMany({
      where: visibility?.mode === "OWN" && "ownedProposalIds" in visibility
        ? inArray(installationJobTickets.quotationId, visibility.ownedProposalIds)
        : undefined,
      with: {
        quotation: {
          with: {
            user: {
              columns: {
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        documents: true,
      },
      orderBy: [desc(installationJobTickets.createdAt)],
    });

    const ticketIds = tickets.map((ticket) => ticket.id);
    const logs = ticketIds.length > 0
      ? await db.query.activityLogs.findMany({
          where: and(
            eq(activityLogs.entityType, "JOB_TICKET"),
            inArray(activityLogs.entityId, ticketIds)
          ),
          orderBy: [desc(activityLogs.createdAt)],
        })
      : [];
    const logsByTicketId = new Map<string, typeof logs>();
    for (const log of logs) {
      const key = log.entityId;
      logsByTicketId.set(key, [...(logsByTicketId.get(key) || []), log]);
    }

    return {
      success: true,
      tickets: tickets.map((ticket) => ({
        ...ticket,
        activityLogs: logsByTicketId.get(ticket.id) || [],
      })),
    };
  } catch (error: unknown) {
    console.error("Failed to fetch job tickets:", error);
    return { error: "Failed to fetch job tickets." };
  }
}

export async function getJobTicketById(ticketId: string) {
  try {
    const actor = await requireStaff();

    const ticket = await db.query.installationJobTickets.findFirst({
      where: eq(installationJobTickets.id, ticketId),
      with: {
        quotation: {
          with: {
            user: {
              columns: {
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        documents: true,
      },
    });

    if (!ticket) {
      return { error: "Job ticket not found." };
    }

    const visibility = await getStaffProposalVisibility(actor.id, "tickets");
    if (visibility?.mode === "NONE") return { error: "Job ticket not found." };
    if (visibility?.mode === "OWN" && "ownedProposalIds" in visibility && !visibility.ownedProposalIds.includes(ticket.quotationId)) {
      return { error: "Job ticket not found." };
    }

    const logs = await db.query.activityLogs.findMany({
      where: and(
        eq(activityLogs.entityType, "JOB_TICKET"),
        eq(activityLogs.entityId, ticket.id),
      ),
      orderBy: [desc(activityLogs.createdAt)],
    });

    return {
      success: true,
      ticket: {
        ...ticket,
        activityLogs: logs,
      },
    };
  } catch (error: unknown) {
    console.error("Failed to fetch job ticket:", error);
    return { error: "Failed to fetch job ticket." };
  }
}

/**
 * Fetches users with STAFF or ADMIN roles to act as installers/technicians.
 */
export async function getInstallers() {
  try {
    await requireStaff();

    const installers = await db.query.users.findMany({
      where: or(eq(users.role, "STAFF"), eq(users.role, "ADMIN")),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return { success: true, installers };
  } catch (error: unknown) {
    console.error("Failed to fetch installers:", error);
    return { error: "Failed to fetch installers." };
  }
}

/**
 * Assigns an installer and scheduled date to a job ticket, changing status to SCHEDULED.
 */
export async function assignJobTicket(
  ticketId: string,
  scheduledDate: Date,
  installerId: string
) {
  try {
    const actor = await requireStaff();

    const [updated] = await db.update(installationJobTickets)
      .set({
        scheduledDate,
        installerId,
        status: "SCHEDULED",
        updatedAt: new Date(),
      })
      .where(eq(installationJobTickets.id, ticketId))
      .returning({ id: installationJobTickets.id });
    if (!updated) return { error: "Job ticket not found." };

    const installer = await db.query.users.findFirst({
      where: eq(users.id, installerId),
      columns: {
        name: true,
        email: true,
      },
    });
    await db.insert(activityLogs)
      .values({
        entityId: ticketId,
        entityType: "JOB_TICKET",
        action: "STATUS_CHANGED",
        description: `Job ticket scheduled for ${scheduledDate.toLocaleDateString("th-TH")} and assigned to ${installer?.name || installer?.email || "installer"}.`,
        userId: actor.id,
      });

    revalidatePath("/admin/job-tickets");
    revalidatePath("/admin/tickets");

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to assign job ticket:", error);
    return { error: "Failed to assign job ticket." };
  }
}

/**
 * Fetches tickets assigned to a specific installer/technician with status SCHEDULED or IN_PROGRESS.
 */
export async function getInstallerTickets(userId: string) {
  try {
    await requireStaff();

    const tickets = await db.query.jobTickets.findMany({
      where: and(
        eq(jobTickets.installerId, userId),
        or(eq(jobTickets.status, "SCHEDULED"), eq(jobTickets.status, "IN_PROGRESS"))
      ),
      with: {
        proposal: {
          with: {
            user: {
              columns: {
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
      orderBy: [desc(jobTickets.scheduledDate)],
    });

    return { success: true, tickets };
  } catch (error: unknown) {
    console.error("Failed to fetch installer tickets:", error);
    return { error: "Failed to fetch installer tickets." };
  }
}

export async function uploadJobTicketCompletionPhoto(formData: FormData) {
  try {
    const actor = await requireStaff();
    const ticketId = String(formData.get("ticketId") || "");
    const file = formData.get("file");

    if (!ticketId || !(file instanceof File) || file.size === 0) {
      return { error: "Missing completion photo upload parameters." };
    }

    const ticket = await db.query.jobTickets.findFirst({
      where: eq(jobTickets.id, ticketId),
      columns: {
        id: true,
        installerId: true,
      },
    });

    if (!ticket) {
      return { error: "Job ticket not found." };
    }

    if (actor.role !== "ADMIN" && ticket.installerId && ticket.installerId !== actor.id) {
      return { error: "You are not assigned to this job ticket." };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: SITE_SURVEY_FILE_KINDS,
      fallbackName: "completion-photo",
      maxBytes: MAX_SITE_SURVEY_PHOTO_BYTES,
    });
    const fileName = `${ticketId}-completion-${Date.now()}-${crypto.randomUUID()}.${validatedFile.extension}`;
    const filePath = `installation_photos/${fileName}`;
    const supabase = await createSupabaseServerClient();

    const { error: uploadError } = await supabase.storage
      .from("proposals")
      .upload(filePath, file, {
        contentType: validatedFile.contentType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("proposals")
      .getPublicUrl(filePath);

    await db.insert(activityLogs)
      .values({
        entityId: ticketId,
        entityType: "JOB_TICKET",
        action: "COMPLETION_PHOTO_UPLOADED",
        description: `${actor.name || actor.email || "Staff"} uploaded an installation completion photo.`,
        userId: actor.id,
      });

    return { success: true, url: publicUrl };
  } catch (error: unknown) {
    console.error("Failed to upload completion photo:", error);
    return { error: "Failed to upload completion photo." };
  }
}

/**
 * Marks a job ticket as COMPLETED, recording photos proof.
 */
export async function completeJobTicket(ticketId: string, photos: string[]) {
  try {
    const actor = await requireStaff();

    const ticket = await db.query.jobTickets.findFirst({
      where: eq(jobTickets.id, ticketId),
      columns: {
        id: true,
        installerId: true,
      },
    });

    if (!ticket) {
      return { error: "Job ticket not found." };
    }

    if (actor.role !== "ADMIN" && ticket.installerId && ticket.installerId !== actor.id) {
      return { error: "You are not assigned to this job ticket." };
    }

    const sanitizedPhotos = Array.isArray(photos)
      ? photos.filter(isTrustedProposalStorageUrl).slice(0, MAX_COMPLETION_PHOTOS)
      : [];

    if (sanitizedPhotos.length === 0) {
      return { error: "Please upload at least one valid completion photo." };
    }

    const [updated] = await db.update(jobTickets)
      .set({
        status: "COMPLETED",
        photos: sanitizedPhotos,
        updatedAt: new Date(),
      })
      .where(eq(jobTickets.id, ticketId))
      .returning({ id: jobTickets.id });
    if (!updated) return { error: "Job ticket not found." };

    revalidatePath("/installer");
    revalidatePath("/admin/job-tickets");
    revalidatePath("/admin/tickets");

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to complete job ticket:", error);
    return { error: "Failed to complete job ticket." };
  }
}

export async function updateJobTicketSiteSurvey(formData: FormData) {
  try {
    const actor = await requireStaff();

    const ticketId = String(formData.get("ticketId") || "");
    const dateValue = String(formData.get("siteSurveyDate") || "");
    const notes = String(formData.get("siteSurveyNotes") || "").trim();
    const isCompleted = formData.get("isSiteSurveyCompleted") === "on";
    const files = formData
      .getAll("siteSurveyPhotos")
      .filter((file): file is File => file instanceof File && file.size > 0);

    if (!ticketId) {
      return { error: "Missing job ticket ID." };
    }

    if (files.length > MAX_SITE_SURVEY_PHOTOS_PER_UPDATE) {
      return { error: `Upload a maximum of ${MAX_SITE_SURVEY_PHOTOS_PER_UPDATE} site survey photos per update.` };
    }

    const ticket = await db.query.installationJobTickets.findFirst({
      where: eq(installationJobTickets.id, ticketId),
    });

    if (!ticket) {
      return { error: "Job ticket not found." };
    }

    const existingPhotos = Array.isArray(ticket.siteSurveyPhotos)
      ? ticket.siteSurveyPhotos.filter((value): value is string => typeof value === "string")
      : [];
    const uploadedPhotos: string[] = [];

    if (files.length > 0) {
      const supabase = await createSupabaseServerClient();

      for (const file of files) {
        const validatedFile = await validateUploadFile({
          file,
          allowedKinds: SITE_SURVEY_FILE_KINDS,
          fallbackName: "site-survey",
          maxBytes: MAX_SITE_SURVEY_PHOTO_BYTES,
        });
        const fileName = `${ticketId}-site-survey-${Date.now()}-${crypto.randomUUID()}.${validatedFile.extension}`;
        const filePath = `site_surveys/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("proposals")
          .upload(filePath, file, {
            contentType: validatedFile.contentType,
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("proposals")
          .getPublicUrl(filePath);

        uploadedPhotos.push(publicUrl);
      }
    }

    const [updated] = await db.update(installationJobTickets)
      .set({
        siteSurveyDate: dateValue ? new Date(dateValue) : null,
        siteSurveyNotes: notes || null,
        siteSurveyPhotos: [...existingPhotos, ...uploadedPhotos],
        isSiteSurveyCompleted: isCompleted,
        updatedAt: new Date(),
      })
      .where(eq(installationJobTickets.id, ticketId))
      .returning({ id: installationJobTickets.id });
    if (!updated) return { error: "Job ticket not found." };

    await db.insert(activityLogs)
      .values({
        entityId: ticketId,
        entityType: "JOB_TICKET",
        action: isCompleted ? "SITE_SURVEY_COMPLETED" : "SITE_SURVEY_UPDATED",
        description: `${actor.name || actor.email || "Staff"} updated site survey logs${uploadedPhotos.length ? ` and uploaded ${uploadedPhotos.length} photo(s)` : ""}.`,
        userId: actor.id,
      });

    revalidatePath("/admin/job-tickets");
    revalidatePath(`/admin/job-tickets/${ticketId}`);

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to update site survey:", error);
    return { error: "Failed to update site survey." };
  }
}

type JobTicketMilestoneField =
  | "isMountingCompleted"
  | "isWiringCompleted"
  | "isInverterSetupCompleted"
  | "isInspectionCompleted";

const milestoneLabels: Record<JobTicketMilestoneField, string> = {
  isMountingCompleted: "Mounting/Racking installation",
  isWiringCompleted: "DC/AC wiring",
  isInverterSetupCompleted: "Inverter setup",
  isInspectionCompleted: "Final inspection",
};

export async function updateJobTicketMilestone(
  ticketId: string,
  field: JobTicketMilestoneField,
  value: boolean,
) {
  try {
    const actor = await requireStaff();

    if (!milestoneLabels[field]) {
      return { error: "Invalid milestone field." };
    }

    const [updated] = await db.update(installationJobTickets)
      .set({
        [field]: value,
        updatedAt: new Date(),
      })
      .where(eq(installationJobTickets.id, ticketId))
      .returning({ id: installationJobTickets.id });
    if (!updated) return { error: "Job ticket not found." };

    await db.insert(activityLogs)
      .values({
        entityId: ticketId,
        entityType: "JOB_TICKET",
        action: value ? "MILESTONE_COMPLETED" : "MILESTONE_REOPENED",
        description: `${actor.name || actor.email || "Staff"} marked ${milestoneLabels[field]} as ${value ? "completed" : "not completed"}.`,
        userId: actor.id,
      });

    revalidatePath("/admin/job-tickets");
    revalidatePath(`/admin/job-tickets/${ticketId}`);

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to update job ticket milestone:", error);
    return { error: "Failed to update job ticket milestone." };
  }
}

/**
 * Uploads a file to Supabase storage and stores it in the projectDocuments table.
 */
export async function uploadProjectDocument(formData: FormData) {
  try {
    const actor = await requireStaff();

    const file = formData.get("file");
    const jobTicketId = String(formData.get("jobTicketId") || "").trim();
    const phase = Number.parseInt(String(formData.get("phase") || ""), 10);
    const department = String(formData.get("department") || "").trim().slice(0, 80);
    const documentGroup = String(formData.get("documentGroup") || "").trim().slice(0, 120);

    if (!(file instanceof File) || file.size === 0 || !jobTicketId || !Number.isInteger(phase) || !department || !documentGroup) {
      return { error: "Missing required upload parameters." };
    }

    // 1. Upload to Supabase Storage
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: PROJECT_DOCUMENT_FILE_KINDS,
      fallbackName: "project-document",
      maxBytes: MAX_PROJECT_DOCUMENT_BYTES,
    });
    const safeDocumentGroup = sanitizeStorageName(documentGroup, "project-document");
    const fileName = `${jobTicketId}-${safeDocumentGroup}-${Date.now()}-${crypto.randomUUID()}.${validatedFile.extension}`;
    const filePath = `project_documents/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("proposals")
      .upload(filePath, file, {
        contentType: validatedFile.contentType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // 2. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from("proposals")
      .getPublicUrl(filePath);

    // 3. Find if document already exists
    const existing = await db.query.jobTicketDocuments.findFirst({
      where: and(
        eq(jobTicketDocuments.jobTicketId, jobTicketId),
        eq(jobTicketDocuments.phase, phase),
        eq(jobTicketDocuments.department, department),
        eq(jobTicketDocuments.documentGroup, documentGroup)
      ),
    });

    if (existing) {
      await db.update(jobTicketDocuments)
        .set({
          fileName: validatedFile.safeFileName,
          fileUrl: publicUrl,
          uploadedBy: user?.id || actor.id,
          uploadedAt: new Date(),
        })
        .where(eq(jobTicketDocuments.id, existing.id));
    } else {
      await db.insert(jobTicketDocuments)
        .values({
          jobTicketId,
          phase,
          department,
          documentGroup,
          fileName: validatedFile.safeFileName,
          fileUrl: publicUrl,
          uploadedBy: user?.id || actor.id,
        });
    }

    await db.insert(activityLogs)
      .values({
        entityId: jobTicketId,
        entityType: "JOB_TICKET",
        action: existing ? "DOCUMENT_UPDATED" : "DOCUMENT_UPLOADED",
        description: `${actor.name || actor.email || "Staff"} ${existing ? "updated" : "uploaded"} ${documentGroup} (${validatedFile.safeFileName}).`,
        userId: actor.id,
      });

    revalidatePath("/installer");
    revalidatePath("/admin/job-tickets");
    revalidatePath("/admin/tickets");

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to upload project document:", error);
    return { error: "Failed to upload project document." };
  }
}

/**
 * Deletes a project document from the database.
 */
export async function deleteProjectDocument(documentId: string) {
  try {
    const actor = await requireStaff();

    const existing = await db.query.jobTicketDocuments.findFirst({
      where: eq(jobTicketDocuments.id, documentId),
    });

    const [deleted] = await db.delete(jobTicketDocuments)
      .where(eq(jobTicketDocuments.id, documentId))
      .returning({ id: jobTicketDocuments.id });
    if (!deleted || !existing) {
      return { error: "Project document not found." };
    }

    if (existing) {
      await db.insert(activityLogs)
        .values({
          entityId: existing.jobTicketId,
          entityType: "JOB_TICKET",
          action: "DOCUMENT_DELETED",
          description: `${actor.name || actor.email || "Staff"} deleted ${existing.documentGroup} (${existing.fileName}).`,
          userId: actor.id,
        });
    }

    revalidatePath("/installer");
    revalidatePath("/admin/job-tickets");
    revalidatePath("/admin/tickets");

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete project document:", error);
    return { error: "Failed to delete project document." };
  }
}

/**
 * Fetches search results and recent quotations for the global admin Command Palette.
 */
export async function searchCommandPaletteData(query?: string) {
  try {
    await requireStaff();

    // Fetch fallback (recent proposals & leads) if search query is empty
    if (!query || query.trim() === "") {
      const [recentProposals, recentLeads] = await Promise.all([
        db.query.proposals.findMany({
          with: {
            user: {
              columns: { name: true, email: true },
            },
          },
          orderBy: [desc(proposals.createdAt)],
          limit: 4,
        }),
        db.select({
          id: inboundRequests.id,
          customerName: inboundRequests.customerName,
          email: inboundRequests.email,
          status: inboundRequests.status,
        })
        .from(inboundRequests)
        .orderBy(desc(inboundRequests.createdAt))
        .limit(4),
      ]);

      return {
        success: true,
        recent: recentProposals.map(p => ({
          id: p.id,
          status: p.status,
          userName: p.user?.name || "Unknown",
          userEmail: p.user?.email || "Unknown",
        })),
        leads: recentLeads.map(l => ({
          id: l.id,
          customerName: l.customerName,
          email: l.email || "",
          status: l.status,
        })),
        proposals: [],
        tickets: [],
      };
    }

    const cleanQuery = `%${query.toLowerCase()}%`;

    const [matchingProposals, matchingTickets, matchingLeads] = await Promise.all([
      // Query proposals by ID, user name, or email
      db
        .select({
          id: proposals.id,
          status: proposals.status,
          userName: users.name,
          userEmail: users.email,
        })
        .from(proposals)
        .leftJoin(users, eq(proposals.userId, users.id))
        .where(
          or(
            sql`lower(${proposals.id}) like ${cleanQuery}`,
            sql`lower(${users.name}) like ${cleanQuery}`,
            sql`lower(${users.email}) like ${cleanQuery}`
          )
        )
        .limit(5),

      // Query job tickets by ID, address, or customer name
      db
        .select({
          id: jobTickets.id,
          status: jobTickets.status,
          customerAddress: jobTickets.customerAddress,
          userName: users.name,
        })
        .from(jobTickets)
        .leftJoin(proposals, eq(jobTickets.proposalId, proposals.id))
        .leftJoin(users, eq(proposals.userId, users.id))
        .where(
          or(
            sql`lower(${jobTickets.id}) like ${cleanQuery}`,
            sql`lower(${jobTickets.customerAddress}) like ${cleanQuery}`,
            sql`lower(${users.name}) like ${cleanQuery}`
          )
        )
        .limit(5),

      // Query inbound leads by customer name, email, phone, or ID
      db
        .select({
          id: inboundRequests.id,
          customerName: inboundRequests.customerName,
          email: inboundRequests.email,
          phone: inboundRequests.phone,
          status: inboundRequests.status,
        })
        .from(inboundRequests)
        .where(
          or(
            sql`lower(${inboundRequests.id}) like ${cleanQuery}`,
            sql`lower(${inboundRequests.customerName}) like ${cleanQuery}`,
            sql`lower(${inboundRequests.email}) like ${cleanQuery}`,
            sql`lower(${inboundRequests.phone}) like ${cleanQuery}`
          )
        )
        .limit(5),
    ]);

    return {
      success: true,
      recent: [],
      proposals: matchingProposals,
      tickets: matchingTickets,
      leads: matchingLeads,
    };
  } catch (error: unknown) {
    console.error("Failed to query command palette data:", error);
    return { error: "Failed to query command palette data." };
  }
}
