import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  activityLogs,
  proposals,
  quotationDocumentRequestAttachments,
  quotationDocumentRequests,
} from "@/db/schema";
import {
  validateUploadContentLength,
  validateUploadFile,
  type UploadFileKind,
} from "@/lib/fileValidation";
import {
  extractDriveFileId,
  getOrCreateCustomerFolder,
  getOrCreateProposalFolder,
  getOrCreateSubfolder,
  uploadFileToDrive,
} from "@/lib/googleDrive";
import { createAdminClient } from "@/utils/supabase/server";
import { portalJson, resolvePortalAccess } from "@/lib/portalAccess";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { sendDiscordCustomerDocumentUploadedNotification } from "@/lib/discord";

export const maxDuration = 60;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_SIZE + 1024 * 1024;
const ALLOWED_FILE_KINDS: readonly UploadFileKind[] = ["pdf", "jpeg", "png", "webp", "heic"];

function serializeDocumentRequest(row: typeof quotationDocumentRequests.$inferSelect) {
  return {
    id: row.id,
    quotationId: row.quotationId,
    documentName: row.documentName,
    descriptionHint: row.descriptionHint,
    requestType: row.requestType,
    isRequired: row.isRequired,
    status: row.status,
    fileUrl: row.fileUrl,
    storageProvider: row.storageProvider,
    storageFileId: row.storageFileId,
    fallbackUrl: row.fallbackUrl,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeAttachment(row: typeof quotationDocumentRequestAttachments.$inferSelect) {
  return {
    id: row.id,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    storageProvider: row.storageProvider,
    storageFileId: row.storageFileId,
    fallbackUrl: row.fallbackUrl,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = validateUploadContentLength(request.headers, MAX_REQUEST_BYTES);
    if (!contentLength.ok) {
      return portalJson(
        { success: false, error: contentLength.error },
        { status: contentLength.status },
      );
    }

    const formData = await request.formData();
    const proposalId = String(formData.get("proposal_id") || "").trim();
    const documentRequestId = String(formData.get("document_request_id") || "").trim();
    const file = formData.get("file");

    if (!proposalId || !documentRequestId || !(file instanceof File)) {
      return portalJson(
        { success: false, error: "Missing proposal, document request, or file." },
        { status: 400 },
      );
    }

    const access = await resolvePortalAccess({
      request,
      proposalId,
      capability: "documents:write",
      mutation: true,
    });
    if (!access) {
      return portalJson({ success: false, error: "Unauthorized document upload." }, { status: 401 });
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: ALLOWED_FILE_KINDS,
      fallbackName: "customer-document",
      maxBytes: MAX_FILE_SIZE,
    }).catch((error: unknown) => error instanceof Error ? error : new Error("Invalid upload file."));

    if (validatedFile instanceof Error) {
      return portalJson(
        { success: false, error: validatedFile.message },
        { status: 400 },
      );
    }

    const [proposal, documentRequest] = await Promise.all([
      db.query.proposals.findFirst({
        where: eq(proposals.id, proposalId),
        columns: {
          id: true,
          userId: true,
          magicTokenSlug: true,
        },
        with: {
          user: {
            columns: {
              name: true,
              email: true,
            },
          },
        },
      }),
      db.query.quotationDocumentRequests.findFirst({
        where: and(
          eq(quotationDocumentRequests.id, documentRequestId),
          eq(quotationDocumentRequests.quotationId, proposalId),
        ),
      }),
    ]);

    if (!proposal || !documentRequest) {
      return portalJson(
        { success: false, error: "Document request was not found." },
        { status: 404 },
      );
    }

    if (documentRequest.status === "APPROVED") {
      return portalJson(
        { success: false, error: "This document has already been approved and cannot be replaced from the portal." },
        { status: 409 },
      );
    }

    const adminStorage = createAdminClient();
    const storagePath = [
      "customer-document-requests",
      proposal.id,
      documentRequest.id,
      `${Date.now()}-${validatedFile.safeFileName}`,
    ].join("/");

    const uploadResult = await adminStorage.storage
      .from("proposals")
      .upload(storagePath, file, {
        contentType: validatedFile.contentType,
        upsert: true,
      });

    if (uploadResult.error) {
      console.error("[Document Request Upload] Supabase storage upload failed:", uploadResult.error);
      throw new Error(uploadResult.error.message);
    }

    const { data: publicUrlData } = adminStorage.storage
      .from("proposals")
      .getPublicUrl(storagePath);

    let finalFileUrl = publicUrlData.publicUrl;
    let storageProvider = "SUPABASE_STORAGE";
    let storageFileId: string | null = null;
    let fallbackUrl: string | null = null;
    try {
      const customerName = proposal.user?.name || proposal.user?.email?.split("@")[0] || "Customer";
      const customerFolderId = await getOrCreateCustomerFolder(customerName, proposal.userId);
      const proposalFolderId = await getOrCreateProposalFolder(customerFolderId, proposal.id);
      const destinationFolderId = await getOrCreateSubfolder(
        proposalFolderId,
        "Customer_Documents",
      );
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      finalFileUrl = await uploadFileToDrive(
        destinationFolderId,
        fileBuffer,
        validatedFile.contentType,
        `${documentRequest.documentName.replace(/[^\p{L}\p{N}-]+/gu, "_")}_${documentRequest.id}.${validatedFile.extension}`,
      );
      storageProvider = "GOOGLE_DRIVE";
      storageFileId = extractDriveFileId(finalFileUrl);
      fallbackUrl = publicUrlData.publicUrl;
    } catch (driveError) {
      console.warn("[Document Request Upload] Google Drive mirror skipped:", driveError);
    }

    const [updatedRequest, attachment] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(quotationDocumentRequests)
        .set({
          status: "UPLOADED",
          fileUrl: finalFileUrl,
          storageProvider,
          storageFileId,
          fallbackUrl,
          updatedAt: new Date(),
        })
        .where(and(
          eq(quotationDocumentRequests.id, documentRequest.id),
          eq(quotationDocumentRequests.quotationId, proposal.id),
        ))
        .returning();

      const [uploadedAttachment] = await tx.insert(quotationDocumentRequestAttachments)
        .values({
          documentRequestId: documentRequest.id,
          fileName: validatedFile.safeFileName,
          fileUrl: finalFileUrl,
          storageProvider,
          storageFileId,
          fallbackUrl,
          metadata: {
            contentType: validatedFile.contentType,
            extension: validatedFile.extension,
            kind: validatedFile.kind,
            byteSize: validatedFile.byteSize,
            sha256: validatedFile.sha256,
            uploadedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .returning();

      await tx.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: "CUSTOMER_DOCUMENT_UPLOADED",
        description: `Customer uploaded ${documentRequest.documentName}.`,
        userId: access.actorUserId,
      });

      return [updated, uploadedAttachment];
    });
    await publishPortalStateChanged(proposal.id, "DOCUMENT_UPLOADED");

    void sendDiscordCustomerDocumentUploadedNotification({
      proposalId: proposal.id,
      customerName: proposal.user?.name || proposal.user?.email || "Customer",
      documentName: documentRequest.documentName,
      fileName: validatedFile.safeFileName,
      fileUrl: finalFileUrl,
    }).catch((err) => {
      console.error("Failed to dispatch Discord document upload notification:", err);
    });

    revalidatePath(`/proposals/${proposal.magicTokenSlug}`);
    revalidatePath(`/th/proposals/${proposal.magicTokenSlug}`);
    revalidatePath(`/en/proposals/${proposal.magicTokenSlug}`);
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath(`/th/admin/crm/${proposal.id}`);
    revalidatePath(`/en/admin/crm/${proposal.id}`);
    revalidatePath(`/admin/quotations/${proposal.id}`);
    revalidatePath(`/th/admin/quotations/${proposal.id}`);
    revalidatePath(`/en/admin/quotations/${proposal.id}`);
    revalidatePath("/admin/documents");
    revalidatePath("/th/admin/documents");
    revalidatePath("/en/admin/documents");

    return portalJson({
      success: true,
      documentRequest: serializeDocumentRequest(updatedRequest),
      attachment: serializeAttachment(attachment),
    });
  } catch (error) {
    console.error("[Document Request Upload]:", error);
    return portalJson(
      { success: false, error: "Failed to upload document." },
      { status: 500 },
    );
  }
}
