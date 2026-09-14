"use server";

import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  installedAssets,
  paymentRequests,
  proposals,
  serviceRequests,
  returnRefunds,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { getDbUser } from "@/app/actions/auth";
import { createErpnextIssue } from "@/lib/erpnextIssues";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";
import { createAdminClient } from "@/utils/supabase/server";
import { getCatalogProduct } from "@/lib/erpnextCatalog";

const MAX_SERVICE_REQUEST_PHOTO_BYTES = 12 * 1024 * 1024;
const SERVICE_REQUEST_PHOTO_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic"];

const RegisterInstalledAssetSchema = z.object({
  proposalId: z.string().trim().min(1, "Proposal is required."),
  productId: z.string().trim().min(1, "Catalog product is required."),
  serialNumber: z.string().trim().min(1, "Serial number is required.").max(120),
  installedDate: z.coerce.date(),
  warrantyYears: z.coerce.number().int().min(1).max(30),
});

const CreateServiceRequestSchema = z.object({
  assetId: z.string().uuid("Invalid asset ID."),
  type: z.enum(["REPAIR", "CLAIM", "MAINTENANCE"]),
  description: z.string().trim().min(5, "Description must be at least 5 characters long."),
  images: z.array(z.string().url()).min(3, "Please upload 3-5 photos of the issue.").max(5, "You can upload up to 5 photos."),
  contactName: z.string().trim().min(2, "Contact name is required."),
  contactPhone: z.string().trim().min(9, "Contact phone is required."),
  appointmentDate: z.coerce.date(),
  systemId: z.string().trim().max(160).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
});

const BookPreventiveMaintenanceSchema = z.object({
  assetId: z.string().uuid("Invalid asset ID."),
  appointmentDate: z.coerce.date(),
});

const PANEL_CLEANING_PRICE = "1500.00";

function addWarrantyYears(installedDate: Date, years: number) {
  const expiry = new Date(installedDate);
  expiry.setFullYear(expiry.getFullYear() + years);
  return expiry;
}

export async function registerInstalledAsset(rawInput: unknown) {
  try {
    await requireStaff();
    const input = RegisterInstalledAssetSchema.parse(rawInput);

    const [proposal, product] = await Promise.all([
      db.query.proposals.findFirst({
        where: eq(proposals.id, input.proposalId),
        columns: { id: true, userId: true },
      }),
      getCatalogProduct(input.productId),
    ]);

    if (!proposal) return { success: false, error: "Proposal not found." };
    if (!product) return { success: false, error: "Catalog product not found." };

    const productName = `${product.brand} ${product.model}`.trim();
    const [asset] = await db
      .insert(installedAssets)
      .values({
        proposalId: proposal.id,
        customerId: proposal.userId,
        productName,
        serialNumber: input.serialNumber,
        installedDate: input.installedDate,
        warrantyExpiryDate: addWarrantyYears(input.installedDate, input.warrantyYears),
      })
      .returning();

    revalidatePath("/admin/job-tickets");
    revalidatePath("/my-assets");
    revalidatePath("/dashboard/warranties");
    return { success: true, asset };
  } catch (error: unknown) {
    console.error("Failed to register installed asset:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid asset data." };
    }
    if (
      error instanceof Error &&
      error.message.includes("installed_assets_serial_number_key")
    ) {
      return { success: false, error: "This serial number is already registered." };
    }
    return { success: false, error: "Failed to register installed product." };
  }
}

export async function getMyInstalledAssets() {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized." };

    const assets = await db.query.installedAssets.findMany({
      where: eq(installedAssets.customerId, user.id),
      orderBy: [desc(installedAssets.installedDate)],
    });

    return { success: true, assets };
  } catch (error: unknown) {
    console.error("Failed to load installed assets:", error);
    return { success: false, error: "Failed to load installed assets." };
  }
}

export async function createServiceRequestAction(rawInput: unknown) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized." };

    const input = CreateServiceRequestSchema.parse(rawInput);

    // Verify asset ownership
    const asset = await db.query.installedAssets.findFirst({
      where: and(
        eq(installedAssets.id, input.assetId),
        eq(installedAssets.customerId, user.id)
      ),
      with: {
        proposal: {
          columns: {
            configurationData: true,
            erpnextCustomerId: true,
          },
        },
      },
    });

    if (!asset) {
      return { success: false, error: "Installed asset not found or unauthorized." };
    }

    const requestId = crypto.randomUUID();
    const requestCode = `SR-${requestId.slice(0, 8).toUpperCase()}`;
    const subject = `${input.type === "CLAIM" ? "Claim" : input.type === "MAINTENANCE" ? "Maintenance" : "Repair"}: ${asset.productName} [${requestCode}]`;
    const serviceContext = {
      systemId: input.systemId || asset.proposalId,
      gps: input.latitude === undefined || input.longitude === undefined
        ? null
        : { latitude: input.latitude, longitude: input.longitude },
      source: "DIGITAL_WARRANTY_CARD",
    };
    const description = [
      input.description,
      `SolarDream system ID: ${serviceContext.systemId}`,
      serviceContext.gps ? `Installation GPS: ${serviceContext.gps.latitude},${serviceContext.gps.longitude}` : null,
    ].filter(Boolean).join("\n\n");

    const [newRequest] = await db
      .insert(serviceRequests)
      .values({
        id: requestId,
        assetId: input.assetId,
        type: input.type,
        subject,
        description,
        status: "Open",
        images: input.images,
        externalSystemDetails: serviceContext,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        appointmentDate: input.appointmentDate,
        erpnextSyncStatus: "PENDING",
      })
      .returning();

    let syncedRequest = newRequest;
    let syncWarning: string | undefined;

    try {
      const erpnext = await createErpnextIssue({
        requestId,
        userId: user.id,
        userEmail: user.email,
        erpnextCustomerId: asset.proposal?.erpnextCustomerId,
        proposalConfiguration: asset.proposal?.configurationData,
        type: input.type,
        subject,
        description,
        imageUrls: input.images,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        appointmentDate: input.appointmentDate,
      });

      [syncedRequest] = await db
        .update(serviceRequests)
        .set({
          erpnextIssueId: erpnext.issueId,
          erpnextSyncStatus: "SYNCED",
          erpnextSyncError: null,
          erpnextLastSyncedAt: new Date(),
        })
        .where(eq(serviceRequests.id, requestId))
        .returning();
    } catch (syncError: unknown) {
      const message =
        syncError instanceof Error ? syncError.message : "Unknown ERPNext synchronization error.";
      syncWarning = "Service request saved, but ERPNext synchronization is pending.";
      console.error("[ERPNext Issue Sync] Failed:", { requestId, error: message });

      [syncedRequest] = await db
        .update(serviceRequests)
        .set({
          erpnextSyncStatus: "FAILED",
          erpnextSyncError: message.slice(0, 2000),
        })
        .where(eq(serviceRequests.id, requestId))
        .returning();
    }

    revalidatePath("/my-assets");
    revalidatePath("/support/dashboard");
    return {
      success: true,
      requestId: syncedRequest.id,
      serviceRequest: syncedRequest,
      erpnextSynced: syncedRequest.erpnextSyncStatus === "SYNCED",
      warning: syncWarning,
    };
  } catch (error: unknown) {
    console.error("Failed to create service request:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input data." };
    }
    return { success: false, error: "Failed to submit service request." };
  }
}

export async function uploadServiceRequestPhotoAction(
  assetId: string,
  formData: FormData,
) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized." };

    const normalizedAssetId = z.string().uuid("Invalid asset ID.").parse(assetId);
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "Photo file is required." };
    }

    const asset = await db.query.installedAssets.findFirst({
      where: and(
        eq(installedAssets.id, normalizedAssetId),
        eq(installedAssets.customerId, user.id),
      ),
      columns: { id: true },
    });

    if (!asset) {
      return { success: false, error: "Installed asset not found or unauthorized." };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: SERVICE_REQUEST_PHOTO_FILE_KINDS,
      fallbackName: "service-request-photo",
      maxBytes: MAX_SERVICE_REQUEST_PHOTO_BYTES,
    });

    const storagePath = [
      "service-requests",
      asset.id,
      `${crypto.randomUUID()}.${validatedFile.extension}`,
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
      console.error("Failed to upload service request photo to storage:", upload.error);
      return { success: false, error: "Failed to upload service request photo." };
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("proposals")
      .getPublicUrl(storagePath);

    return {
      success: true,
      url: publicUrl,
      storagePath,
    };
  } catch (error: unknown) {
    console.error("Failed to upload service request photo:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid upload data." };
    }
    return {
      success: false,
      error: "Failed to upload service request photo.",
    };
  }
}

export async function bookPreventiveMaintenanceAction(rawInput: unknown) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized." };

    const input = BookPreventiveMaintenanceSchema.parse(rawInput);
    const appointmentDate = new Date(input.appointmentDate);
    appointmentDate.setHours(12, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (appointmentDate < today) {
      return { success: false, error: "Please choose today or a future date." };
    }

    const asset = await db.query.installedAssets.findFirst({
      where: and(
        eq(installedAssets.id, input.assetId),
        eq(installedAssets.customerId, user.id),
      ),
      columns: {
        id: true,
        proposalId: true,
        productName: true,
        serialNumber: true,
      },
    });

    if (!asset) {
      return { success: false, error: "Installed asset not found or unauthorized." };
    }

    const result = await db.transaction(async (tx) => {
      const [serviceRequest] = await tx
        .insert(serviceRequests)
        .values({
          assetId: asset.id,
          type: "MAINTENANCE",
          subject: `Preventive Maintenance: ${asset.productName}`,
          description: `Preventive panel cleaning for ${asset.productName} (${asset.serialNumber})`,
          status: "Open",
          images: [],
          contactName: user.fullName || user.name || user.email,
          contactPhone: user.phoneNumber || null,
          appointmentDate,
        })
        .returning({ id: serviceRequests.id });

      const [paymentRequest] = await tx
        .insert(paymentRequests)
        .values({
          proposalId: asset.proposalId,
          title: `Panel Cleaning / PM #${serviceRequest.id.slice(0, 8).toUpperCase()}`,
          amountRequested: PANEL_CLEANING_PRICE,
          status: "PENDING",
        })
        .returning({ id: paymentRequests.id });

      return { serviceRequestId: serviceRequest.id, paymentRequestId: paymentRequest.id };
    });

    revalidatePath("/support/maintenance");
    revalidatePath("/my-assets");
    revalidatePath(`/checkout/${asset.proposalId}/payment`);

    return {
      success: true,
      ...result,
      checkoutPath: `/checkout/${asset.proposalId}/payment?paymentRequest=${result.paymentRequestId}`,
    };
  } catch (error: unknown) {
    console.error("Failed to book preventive maintenance:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid booking data." };
    }
    return { success: false, error: "Failed to create the maintenance booking." };
  }
}

export async function getMyServiceRequestsAction() {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized." };

    const myAssets = await db.query.installedAssets.findMany({
      where: eq(installedAssets.customerId, user.id),
      columns: { id: true },
    });

    const assetIds = myAssets.map((a) => a.id);
    if (assetIds.length === 0) {
      return { success: true, serviceRequests: [] };
    }

    const requests = await db.query.serviceRequests.findMany({
      where: inArray(serviceRequests.assetId, assetIds),
      columns: {
        erpnextSyncError: false,
      },
      with: {
        asset: true,
      },
      orderBy: [desc(serviceRequests.createdAt)],
    });

    return { success: true, serviceRequests: requests };
  } catch (error: unknown) {
    console.error("Failed to load service requests:", error);
    return { success: false, error: "Failed to load service requests." };
  }
}

export async function getMyReturnRefundsAction() {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized." };

    const myProposals = await db.query.proposals.findMany({
      where: eq(proposals.userId, user.id),
      columns: { id: true },
    });

    const proposalIds = myProposals.map((p) => p.id);
    if (proposalIds.length === 0) {
      return { success: true, returnRefunds: [] };
    }

    const refunds = await db.query.returnRefunds.findMany({
      where: inArray(returnRefunds.proposalId, proposalIds),
      with: {
        proposal: true,
      },
      orderBy: [desc(returnRefunds.createdAt)],
    });

    const formattedRefunds = refunds.map((r) => ({
      ...r,
      amount: Number(r.amount),
    }));

    return { success: true, returnRefunds: formattedRefunds };
  } catch (error: unknown) {
    console.error("Failed to load return refunds:", error);
    return { success: false, error: "Failed to load return refunds." };
  }
}
