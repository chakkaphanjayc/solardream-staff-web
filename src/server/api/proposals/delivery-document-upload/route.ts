import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activityLogs,
  proposals,
  quotationDeliveryDocumentAttachments,
  quotationDeliveryDocuments,
} from "@/db/schema";
import {
  validateUploadContentLength,
  validateUploadFile,
  type UploadFileKind,
} from "@/lib/fileValidation";
import {
  getQuotationDeliveryDriveLockKey,
  QUOTATION_DELIVERY_DOCUMENT_TEMPLATES,
  type QuotationDeliveryDocumentType,
} from "@/lib/quotationDeliveryDocuments";
import {
  deleteDriveFile,
  getOrCreateQuotationDeliveryDriveHierarchy,
  uploadBufferToDriveFolder,
} from "@/lib/googleDrive";
import { requireStaffJson } from "@/lib/auth-guard";

export const maxDuration = 60;

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_SIZE + 1024 * 1024;
const BROAD_FILE_KINDS: readonly UploadFileKind[] = ["pdf", "jpeg", "png", "webp", "heic", "docx", "xlsx", "pptx", "txt"];
const IMAGE_FILE_KINDS = new Set<UploadFileKind>(["jpeg", "png", "webp", "heic"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function maxBytesForKind(kind: UploadFileKind) {
  if (kind === "txt") return 2 * 1024 * 1024;
  if (IMAGE_FILE_KINDS.has(kind)) return 15 * 1024 * 1024;
  return MAX_FILE_SIZE;
}

function isDeliveryType(value: string): value is QuotationDeliveryDocumentType {
  return QUOTATION_DELIVERY_DOCUMENT_TEMPLATES.some((template) => template.deliveryType === value)
    || /^CUSTOM_[a-zA-Z0-9_-]{1,128}$/.test(value);
}

type DeliveryDocumentWithAttachments = typeof quotationDeliveryDocuments.$inferSelect & {
  attachments?: Array<typeof quotationDeliveryDocumentAttachments.$inferSelect>;
};

function serializeTimestamp(value: unknown, fallback: string): string {
  const date = value instanceof Date
    ? value
    : typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function serializeDeliveryDocument(row: DeliveryDocumentWithAttachments) {
  const fallback = new Date().toISOString();
  const updatedAt = serializeTimestamp(row.updatedAt, fallback);
  return {
    id: row.id,
    quotationId: row.quotationId,
    deliveryType: row.deliveryType,
    title: row.title,
    description: row.description,
    fileUrl: row.fileUrl,
    storageProvider: row.storageProvider,
    storageFileId: row.storageFileId,
    fallbackUrl: row.fallbackUrl,
    status: row.status,
    metadata: row.metadata,
    attachments: row.attachments?.map(serializeAttachment) || [],
    createdAt: serializeTimestamp(row.createdAt, updatedAt),
    updatedAt,
  };
}

function serializeAttachment(row: typeof quotationDeliveryDocumentAttachments.$inferSelect) {
  const fallback = new Date().toISOString();
  const updatedAt = serializeTimestamp(row.updatedAt, fallback);
  return {
    id: row.id,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    storageProvider: row.storageProvider,
    storageFileId: row.storageFileId,
    fallbackUrl: row.fallbackUrl,
    metadata: row.metadata,
    createdAt: serializeTimestamp(row.createdAt, updatedAt),
    updatedAt,
  };
}

export async function POST(request: NextRequest) {
  const staff = await requireStaffJson();
  if (!staff.ok) return staff.response;

  try {
    const requestLength = validateUploadContentLength(request.headers, MAX_REQUEST_BYTES);
    if (!requestLength.ok) {
      return NextResponse.json(
        { success: false, error: requestLength.error },
        { status: requestLength.status },
      );
    }

    const formData = await request.formData();
    const proposalId = String(formData.get("proposal_id") || "").trim();
    const deliveryTypeRaw = String(formData.get("delivery_type") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const file = formData.get("file");

    if (!proposalId || !isDeliveryType(deliveryTypeRaw) || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Missing proposal, delivery type, or file." },
        { status: 400 },
      );
    }

    const template = QUOTATION_DELIVERY_DOCUMENT_TEMPLATES.find((item) => item.deliveryType === deliveryTypeRaw);
    const allowedKinds: readonly UploadFileKind[] = deliveryTypeRaw === "FINAL_QUOTATION" ? ["pdf"] : BROAD_FILE_KINDS;
    const validatedFile = await validateUploadFile({
      file,
      allowedKinds,
      fallbackName: deliveryTypeRaw.toLowerCase(),
      maxBytes: MAX_FILE_SIZE,
    }).catch((error: unknown) => error instanceof Error ? error : new Error("Invalid upload file."));

    if (validatedFile instanceof Error) {
      return NextResponse.json(
        { success: false, error: validatedFile.message },
        { status: 400 },
      );
    }
    if (validatedFile.byteSize > maxBytesForKind(validatedFile.kind)) {
      return NextResponse.json({ success: false, error: "File exceeds the allowed size for its type." }, { status: 413 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    let uploadedDriveFileId: string | null = null;

    try {
      const transactionResult = await db.transaction(async (tx) => {
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${getQuotationDeliveryDriveLockKey(proposalId)}, 0)
          )
        `);
        const proposal = await tx.query.proposals.findFirst({
          where: eq(proposals.id, proposalId),
          columns: {
            id: true,
            userId: true,
            magicTokenSlug: true,
          },
        });
        if (!proposal) return { kind: "not_found" as const };

        const existingDocument = await tx.query.quotationDeliveryDocuments.findFirst({
          where: (documents, { and, eq: equals }) => and(
            equals(documents.quotationId, proposal.id),
            equals(documents.deliveryType, deliveryTypeRaw),
          ),
          with: {
            attachments: true,
          },
        });
        const recordedVersion = Number(asRecord(existingDocument?.metadata).version);
        const previousVersion = existingDocument
          ? Math.max(
              Number.isInteger(recordedVersion) && recordedVersion > 0 ? recordedVersion : 1,
              existingDocument.attachments.length,
            )
          : 0;
        const nextVersion = previousVersion + 1;

        const driveHierarchy = await getOrCreateQuotationDeliveryDriveHierarchy(
          proposal.userId,
          proposal.id,
        );
        const driveFile = await uploadBufferToDriveFolder({
          folder: driveHierarchy.quotationFolder,
          fileBuffer,
          mimeType: validatedFile.contentType,
          fileName: `v${nextVersion}-${Date.now()}-${validatedFile.safeFileName}`,
        });
        uploadedDriveFileId = driveFile.fileId;
        const uploadedAt = new Date();
        const payload = {
          quotationId: proposal.id,
          deliveryType: deliveryTypeRaw,
          title: title || template?.title || deliveryTypeRaw,
          description: description || template?.description || null,
          fileUrl: driveFile.fileUrl,
          storageProvider: "GOOGLE_DRIVE",
          storageFileId: driveFile.fileId,
          fallbackUrl: null,
          status: "READY",
          metadata: {
            originalFileName: validatedFile.safeFileName,
            storedFileName: driveFile.fileName,
            contentType: validatedFile.contentType,
            kind: validatedFile.kind,
            extension: validatedFile.extension,
            byteSize: validatedFile.byteSize,
            sha256: validatedFile.sha256,
            version: nextVersion,
            replacesVersion: nextVersion > 1 ? nextVersion - 1 : null,
            uploadedBy: staff.user.id,
            uploadedAt: uploadedAt.toISOString(),
            userFolderId: driveHierarchy.userFolder.folderId,
            userFolderUrl: driveHierarchy.userFolder.folderUrl,
            userFolderName: driveHierarchy.userFolder.folderName,
            quotationFolderId: driveHierarchy.quotationFolder.folderId,
            quotationFolderUrl: driveHierarchy.quotationFolder.folderUrl,
            quotationFolderName: driveHierarchy.quotationFolder.folderName,
            archiveFolderId: driveHierarchy.archiveFolder.folderId,
            archiveFolderUrl: driveHierarchy.archiveFolder.folderUrl,
            archiveFolderName: driveHierarchy.archiveFolder.folderName,
          },
          updatedAt: uploadedAt,
        };
        const deliveryDriveConfiguration = {
          quotationDeliveryDrive: {
            userFolderId: driveHierarchy.userFolder.folderId,
            userFolderUrl: driveHierarchy.userFolder.folderUrl,
            quotationFolderId: driveHierarchy.quotationFolder.folderId,
            quotationFolderUrl: driveHierarchy.quotationFolder.folderUrl,
            archiveFolderId: driveHierarchy.archiveFolder.folderId,
            archiveFolderUrl: driveHierarchy.archiveFolder.folderUrl,
          },
        };
        const [upserted] = await tx.insert(quotationDeliveryDocuments)
          .values(payload)
          .onConflictDoUpdate({
            target: [
              quotationDeliveryDocuments.quotationId,
              quotationDeliveryDocuments.deliveryType,
            ],
            set: {
              title: payload.title,
              description: payload.description,
              fileUrl: payload.fileUrl,
              storageProvider: payload.storageProvider,
              storageFileId: payload.storageFileId,
              fallbackUrl: payload.fallbackUrl,
              status: payload.status,
              metadata: payload.metadata,
              updatedAt: payload.updatedAt,
            },
          })
          .returning();

        if (!upserted) {
          throw new Error("Delivery document upsert returned no row.");
        }

        if (
          existingDocument
          && existingDocument.attachments.length === 0
          && existingDocument.fileUrl
          && existingDocument.storageProvider
        ) {
          await tx.insert(quotationDeliveryDocumentAttachments).values({
            deliveryDocumentId: upserted.id,
            fileName: asString(asRecord(existingDocument.metadata).originalFileName) || `version-${previousVersion}`,
            fileUrl: existingDocument.fileUrl,
            storageProvider: existingDocument.storageProvider,
            storageFileId: existingDocument.storageFileId,
            fallbackUrl: existingDocument.fallbackUrl,
            metadata: {
              ...asRecord(existingDocument.metadata),
              version: previousVersion,
              preservedAt: uploadedAt.toISOString(),
            },
            createdAt: uploadedAt,
            updatedAt: uploadedAt,
          });
        }

        const [attachment] = await tx.insert(quotationDeliveryDocumentAttachments)
          .values({
            deliveryDocumentId: upserted.id,
            fileName: validatedFile.safeFileName,
            fileUrl: driveFile.fileUrl,
            storageProvider: "GOOGLE_DRIVE",
            storageFileId: driveFile.fileId,
            fallbackUrl: null,
            metadata: payload.metadata,
            createdAt: uploadedAt,
            updatedAt: uploadedAt,
          })
          .returning();

        const deliveryDocument = await tx.query.quotationDeliveryDocuments.findFirst({
          where: eq(quotationDeliveryDocuments.id, upserted.id),
          with: {
            attachments: {
              orderBy: (attachments, { asc }) => [asc(attachments.createdAt)],
            },
          },
        });
        if (!deliveryDocument) {
          throw new Error("Uploaded delivery document could not be reloaded.");
        }

        if (deliveryTypeRaw === "FINAL_QUOTATION") {
          await tx.update(proposals)
            .set({
              revisionNumber: nextVersion,
              pdfUrl: driveFile.fileUrl,
              revisedPdfUrl: driveFile.fileUrl,
              signedDocumentDriveUrl: null,
              signatureUrl: null,
              signedAt: null,
              verifiedAt: null,
              verifiedByAdminId: null,
              status: "AWAITING_CLIENT_SIGNATURE",
              dispatchStatus: "DISPATCHED",
              configurationData: sql`${proposals.configurationData} || ${JSON.stringify({
                ...deliveryDriveConfiguration,
                customerApproval: {
                  status: "PENDING",
                  revisionVersion: nextVersion,
                  replacedAt: uploadedAt.toISOString(),
                  replacedBy: staff.user.id,
                },
              })}::jsonb`,
              updatedAt: uploadedAt,
            })
            .where(eq(proposals.id, proposal.id));
        } else {
          await tx.update(proposals)
            .set({
              configurationData: sql`${proposals.configurationData} || ${JSON.stringify(deliveryDriveConfiguration)}::jsonb`,
              updatedAt: uploadedAt,
            })
            .where(eq(proposals.id, proposal.id));
        }

        await tx.insert(activityLogs).values({
          entityId: proposal.id,
          entityType: "QUOTATION",
          action: "DELIVERY_DOCUMENT_UPLOADED",
          description: `${staff.user.name || staff.user.email || "Staff"} uploaded ${payload.title} (version ${nextVersion}).`,
          userId: staff.user.id,
        });

        return {
          kind: "success" as const,
          proposal,
          driveHierarchy,
          driveFile,
          row: deliveryDocument,
          attachment,
        };
      });

      if (transactionResult.kind === "not_found") {
        return NextResponse.json(
          { success: false, error: "Quotation was not found." },
          { status: 404 },
        );
      }

      const {
        proposal,
        row,
        attachment,
      } = transactionResult;
      uploadedDriveFileId = null;

      revalidatePath(`/admin/crm/${proposal.id}`);
      revalidatePath(`/th/admin/crm/${proposal.id}`);
      revalidatePath(`/en/admin/crm/${proposal.id}`);
      revalidatePath(`/admin/quotations/${proposal.id}`);
      revalidatePath(`/th/admin/quotations/${proposal.id}`);
      revalidatePath(`/en/admin/quotations/${proposal.id}`);
      if (proposal.magicTokenSlug) {
        revalidatePath(`/proposals/${proposal.magicTokenSlug}`);
        revalidatePath(`/th/proposals/${proposal.magicTokenSlug}`);
        revalidatePath(`/en/proposals/${proposal.magicTokenSlug}`);
      }

      return NextResponse.json({
        success: true,
        deliveryDocument: serializeDeliveryDocument(row),
        attachment: serializeAttachment(attachment),
      });
    } catch (databaseError: unknown) {
      if (uploadedDriveFileId) {
        try {
          await deleteDriveFile(uploadedDriveFileId);
        } catch (cleanupError: unknown) {
          console.warn(
            "[Delivery Document Upload] Failed to compensate Drive upload:",
            cleanupError,
          );
        }
      }

      throw databaseError;
    }
  } catch (error) {
    console.error("[Delivery Document Upload]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload delivery document." },
      { status: 500 },
    );
  }
}
