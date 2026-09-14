import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { activityLogs, proposals, quotationDeliveryDocuments } from "@/db/schema";
import {
  getOrCreateQuotationDeliveryDriveHierarchy,
  moveDriveFile,
  restoreDriveFileParents,
} from "@/lib/googleDrive";
import { requireStaffJson } from "@/lib/auth-guard";
import { getQuotationDeliveryDriveLockKey } from "@/lib/quotationDeliveryDocuments";

export const maxDuration = 60;

type ArchiveRouteContext = {
  params: Promise<{ documentId: string }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function serializeDeliveryDocument(row: typeof quotationDeliveryDocuments.$inferSelect) {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function revalidateQuotationPaths(proposalId: string, magicTokenSlug: string | null) {
  revalidatePath(`/admin/crm/${proposalId}`);
  revalidatePath(`/th/admin/crm/${proposalId}`);
  revalidatePath(`/en/admin/crm/${proposalId}`);
  revalidatePath(`/admin/quotations/${proposalId}`);
  revalidatePath(`/th/admin/quotations/${proposalId}`);
  revalidatePath(`/en/admin/quotations/${proposalId}`);
  if (magicTokenSlug) {
    revalidatePath(`/proposals/${magicTokenSlug}`);
    revalidatePath(`/th/proposals/${magicTokenSlug}`);
    revalidatePath(`/en/proposals/${magicTokenSlug}`);
  }
}

export async function POST(_request: NextRequest, context: ArchiveRouteContext) {
  const staff = await requireStaffJson();
  if (!staff.ok) return staff.response;

  try {
    const { documentId } = await context.params;
    const normalizedDocumentId = documentId.trim();
    if (!normalizedDocumentId) {
      return NextResponse.json(
        { success: false, error: "Delivery document ID is required." },
        { status: 400 },
      );
    }

    const document = await db.query.quotationDeliveryDocuments.findFirst({
      where: eq(quotationDeliveryDocuments.id, normalizedDocumentId),
    });
    if (!document) {
      return NextResponse.json(
        { success: false, error: "Delivery document was not found." },
        { status: 404 },
      );
    }

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, document.quotationId),
      columns: {
        id: true,
        userId: true,
        magicTokenSlug: true,
      },
    });
    if (!proposal) {
      return NextResponse.json(
        { success: false, error: "Quotation was not found." },
        { status: 404 },
      );
    }

    if (document.status === "ARCHIVED") {
      return NextResponse.json({
        success: true,
        deliveryDocument: serializeDeliveryDocument(document),
      });
    }

    const driveFileId = document.storageFileId?.trim();
    if (document.storageProvider !== "GOOGLE_DRIVE" || !driveFileId) {
      return NextResponse.json(
        { success: false, error: "Delivery document is not stored in managed Google Drive storage." },
        { status: 409 },
      );
    }

    const archivedAt = new Date();
    let archivedDocument: typeof quotationDeliveryDocuments.$inferSelect;
    let moveResult: Awaited<ReturnType<typeof moveDriveFile>> | undefined;

    try {
      archivedDocument = await db.transaction(async (tx) => {
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${getQuotationDeliveryDriveLockKey(proposal.id)}, 0)
          )
        `);
        const driveHierarchy = await getOrCreateQuotationDeliveryDriveHierarchy(
          proposal.userId,
          proposal.id,
        );
        const currentDocument = await tx.query.quotationDeliveryDocuments.findFirst({
          where: and(
            eq(quotationDeliveryDocuments.id, document.id),
            eq(quotationDeliveryDocuments.quotationId, proposal.id),
            ne(quotationDeliveryDocuments.status, "ARCHIVED"),
            eq(quotationDeliveryDocuments.storageProvider, "GOOGLE_DRIVE"),
            eq(quotationDeliveryDocuments.storageFileId, driveFileId),
          ),
          columns: { id: true },
        });
        if (!currentDocument) {
          throw new Error("Delivery document changed before it could be archived.");
        }

        const completedMove = await moveDriveFile(
          driveFileId,
          driveHierarchy.archiveFolder,
        );
        moveResult = completedMove;
        const [updated] = await tx.update(quotationDeliveryDocuments)
          .set({
            status: "ARCHIVED",
            metadata: {
              ...asRecord(document.metadata),
              archivedAt: archivedAt.toISOString(),
              archivedBy: staff.user.id,
              archiveFolderId: driveHierarchy.archiveFolder.folderId,
              archiveFolderUrl: driveHierarchy.archiveFolder.folderUrl,
              archiveFolderName: driveHierarchy.archiveFolder.folderName,
              previousParentIds: completedMove.previousParentIds,
            },
            updatedAt: archivedAt,
          })
          .where(and(
            eq(quotationDeliveryDocuments.id, document.id),
            eq(quotationDeliveryDocuments.quotationId, proposal.id),
            ne(quotationDeliveryDocuments.status, "ARCHIVED"),
            eq(quotationDeliveryDocuments.storageProvider, "GOOGLE_DRIVE"),
            eq(quotationDeliveryDocuments.storageFileId, driveFileId),
          ))
          .returning();

        if (!updated) {
          throw new Error("Delivery document archive returned no row.");
        }

        await tx.insert(activityLogs).values({
          entityId: proposal.id,
          entityType: "QUOTATION",
          action: "DELIVERY_DOCUMENT_ARCHIVED",
          description: `${staff.user.name || staff.user.email || "Staff"} archived ${document.title}.`,
          userId: staff.user.id,
        });

        return updated;
      });
    } catch (databaseError: unknown) {
      if (moveResult?.previousParentIds.length) {
        try {
          await restoreDriveFileParents(driveFileId, moveResult.previousParentIds);
        } catch (restoreError: unknown) {
          console.error(
            "[Delivery Document Archive] Failed to restore Drive file after database failure:",
            restoreError,
          );
        }
      }
      throw databaseError;
    }

    revalidateQuotationPaths(proposal.id, proposal.magicTokenSlug);
    return NextResponse.json({
      success: true,
      deliveryDocument: serializeDeliveryDocument(archivedDocument),
    });
  } catch (error: unknown) {
    console.error("[Delivery Document Archive]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to archive delivery document." },
      { status: 500 },
    );
  }
}
