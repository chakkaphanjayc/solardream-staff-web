"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { activityLogs, proposals, quotationDocumentRequests } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import {
  getDocumentRequestTemplateByName,
  type DocumentRequestType,
} from "@/lib/customerDocumentRequests";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { publishPortalStateChanged } from "@/lib/portalEvents";

const documentRequestInputSchema = z.object({
  id: z.string().trim().optional(),
  documentName: z.string().trim().min(1, "Document name is required.").max(160),
  descriptionHint: z.string().trim().max(500).nullable().optional(),
  requestType: z.enum(["FILE", "LOCATION", "CONTACT_INFO"]).optional(),
  isRequired: z.boolean(),
  metadata: z.unknown().optional(),
});

const saveDocumentRequestsSchema = z.object({
  quotationId: z.string().trim().min(1, "Quotation ID is required."),
  requests: z.array(documentRequestInputSchema).max(20),
});

export type QuotationDocumentRequestInput = z.infer<typeof documentRequestInputSchema>;

type QuotationDocumentRequestPublic = {
  id: string;
  quotationId: string;
  documentName: string;
  descriptionHint: string | null;
  requestType: string;
  isRequired: boolean;
  status: string;
  fileUrl: string | null;
  storageProvider: string | null;
  storageFileId: string | null;
  fallbackUrl: string | null;
  metadata: unknown;
  updatedAt: Date;
};

function toPublicDocumentRequest(
  request: typeof quotationDocumentRequests.$inferSelect,
): QuotationDocumentRequestPublic {
  return {
    id: request.id,
    quotationId: request.quotationId,
    documentName: request.documentName,
    descriptionHint: request.descriptionHint,
    requestType: request.requestType,
    isRequired: request.isRequired,
    status: request.status,
    fileUrl: request.fileUrl,
    storageProvider: request.storageProvider,
    storageFileId: request.storageFileId,
    fallbackUrl: request.fallbackUrl,
    metadata: request.metadata,
    updatedAt: request.updatedAt,
  };
}

export async function saveQuotationDocumentRequests(
  quotationId: string,
  requests: QuotationDocumentRequestInput[],
) {
  try {
    const actor = await requireStaff();
    const parsed = saveDocumentRequestsSchema.parse({ quotationId, requests });

    const quotation = await db.query.proposals.findFirst({
      where: eq(proposals.id, parsed.quotationId),
      columns: { id: true },
    });

    if (!quotation) {
      return { success: false, error: "Quotation not found." };
    }

    const normalizedRequests = parsed.requests
      .map((request) => ({
        id: request.id?.trim() || null,
        documentName: request.documentName.trim(),
        descriptionHint: request.descriptionHint?.trim() || getDocumentRequestTemplateByName(request.documentName)?.descriptionHint || null,
        requestType: (request.requestType || getDocumentRequestTemplateByName(request.documentName)?.requestType || "FILE") as DocumentRequestType,
        isRequired: request.isRequired,
        metadata: request.metadata ?? {},
      }))
      .filter((request, index, array) => {
        const key = request.documentName.toLocaleLowerCase("th-TH");
        return key.length > 0 && array.findIndex((candidate) =>
          candidate.documentName.toLocaleLowerCase("th-TH") === key
        ) === index;
      });

    const savedRows = await db.transaction(async (tx) => {
      const existingRows = await tx.query.quotationDocumentRequests.findMany({
        where: eq(quotationDocumentRequests.quotationId, quotation.id),
      });
      const existingIds = new Set(existingRows.map((row) => row.id));
      const retainedIds = normalizedRequests
        .map((request) => request.id)
        .filter((id): id is string => Boolean(id && existingIds.has(id)));

      if (existingRows.length > 0) {
        if (retainedIds.length > 0) {
          const removedIds = existingRows
            .map((row) => row.id)
            .filter((id) => !retainedIds.includes(id));

          if (removedIds.length > 0) {
            await tx.delete(quotationDocumentRequests)
              .where(and(
                eq(quotationDocumentRequests.quotationId, quotation.id),
                inArray(quotationDocumentRequests.id, removedIds),
              ));
          }
        } else {
          await tx.delete(quotationDocumentRequests)
            .where(eq(quotationDocumentRequests.quotationId, quotation.id));
        }
      }

      for (const request of normalizedRequests) {
        if (request.id && existingIds.has(request.id)) {
          await tx.update(quotationDocumentRequests)
            .set({
              documentName: request.documentName,
              descriptionHint: request.descriptionHint,
              requestType: request.requestType,
              isRequired: request.isRequired,
              metadata: request.metadata,
              updatedAt: new Date(),
            })
            .where(and(
              eq(quotationDocumentRequests.id, request.id),
              eq(quotationDocumentRequests.quotationId, quotation.id),
            ));
        } else {
          await tx.insert(quotationDocumentRequests)
            .values({
              quotationId: quotation.id,
              documentName: request.documentName,
              descriptionHint: request.descriptionHint,
              requestType: request.requestType,
              isRequired: request.isRequired,
              status: "PENDING",
              fileUrl: null,
              metadata: request.metadata,
              updatedAt: new Date(),
            });
        }
      }

      return tx.query.quotationDocumentRequests.findMany({
        where: eq(quotationDocumentRequests.quotationId, quotation.id),
      });
    });

    await db.insert(activityLogs).values({
      entityId: quotation.id,
      entityType: "QUOTATION",
      action: "DOCUMENT_REQUESTS_UPDATED",
      description: `${actor.name || actor.email || "Staff"} prepared ${savedRows.length} customer document request${savedRows.length === 1 ? "" : "s"} before customer dispatch.`,
      userId: actor.id,
    });

    await publishPortalStateChanged(quotation.id, "document-requests-updated");

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${quotation.id}`);
    revalidatePath(`/th/admin/crm/${quotation.id}`);
    revalidatePath(`/en/admin/crm/${quotation.id}`);
    revalidatePath(`/admin/quotations/${quotation.id}`);
    revalidatePath(`/th/admin/quotations/${quotation.id}`);
    revalidatePath(`/en/admin/quotations/${quotation.id}`);
    revalidatePath("/proposals");
    revalidatePath(`/th/proposals/${quotation.id}`);
    revalidatePath(`/en/proposals/${quotation.id}`);
    revalidatePath("/admin/documents");
    revalidatePath("/th/admin/documents");
    revalidatePath("/en/admin/documents");

    return { success: true, requests: savedRows.map(toPublicDocumentRequest) };
  } catch (error) {
    console.error("[saveQuotationDocumentRequests]", error);
    return {
      success: false,
      error: "Failed to save document requests.",
    };
  }
}

export async function verifyQuotationDocumentRequestAction(
  quotationId: string,
  documentRequestId: string,
  decision: "APPROVE" | "REJECT",
) {
  try {
    const actor = await requireStaff();
    const normalizedQuotationId = quotationId.trim();
    const normalizedRequestId = documentRequestId.trim();

    if (!normalizedQuotationId || !normalizedRequestId) {
      return { success: false, error: "Invalid quotation document request." };
    }

    const documentRequest = await db.query.quotationDocumentRequests.findFirst({
      where: and(
        eq(quotationDocumentRequests.id, normalizedRequestId),
        eq(quotationDocumentRequests.quotationId, normalizedQuotationId),
      ),
    });

    if (!documentRequest) {
      return { success: false, error: "Document request not found." };
    }

    if (!documentRequest.fileUrl) {
      return { success: false, error: "Customer has not uploaded this document yet." };
    }

    const nextStatus = decision === "APPROVE" ? "APPROVED" : "PENDING";
    const [updatedRequest] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(quotationDocumentRequests)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(and(
          eq(quotationDocumentRequests.id, documentRequest.id),
          eq(quotationDocumentRequests.quotationId, normalizedQuotationId),
        ))
        .returning();

      await tx.insert(activityLogs).values({
        entityId: normalizedQuotationId,
        entityType: "QUOTATION",
        action: decision === "APPROVE"
          ? "CUSTOMER_DOCUMENT_REQUEST_APPROVED"
          : "CUSTOMER_DOCUMENT_REQUEST_RETURNED",
        description: decision === "APPROVE"
          ? `${actor.name || actor.email || "Staff"} approved "${documentRequest.documentName}".`
          : `${actor.name || actor.email || "Staff"} returned "${documentRequest.documentName}" for re-upload.`,
        userId: actor.id,
      });

      if (decision === "APPROVE") {
        await enqueueIntegrationEvent(tx, {
          topic: "document.verified",
          aggregateType: "QUOTATION_DOCUMENT_REQUEST",
          aggregateId: normalizedQuotationId,
          payload: { documentRequestId: documentRequest.id },
          dedupeKey: `document.verified:${documentRequest.id}`,
        });
      }

      return [updated];
    });

    if (decision === "APPROVE") await processOutboxBestEffort(normalizedQuotationId);
    await publishPortalStateChanged(normalizedQuotationId, nextStatus);

    revalidatePath(`/admin/crm/${normalizedQuotationId}`);
    revalidatePath(`/th/admin/crm/${normalizedQuotationId}`);
    revalidatePath(`/en/admin/crm/${normalizedQuotationId}`);
    revalidatePath(`/admin/quotations/${normalizedQuotationId}`);
    revalidatePath(`/th/admin/quotations/${normalizedQuotationId}`);
    revalidatePath(`/en/admin/quotations/${normalizedQuotationId}`);
    revalidatePath(`/proposals/${normalizedQuotationId}`);
    revalidatePath("/admin/documents");
    revalidatePath("/th/admin/documents");
    revalidatePath("/en/admin/documents");

    return { success: true, request: toPublicDocumentRequest(updatedRequest) };
  } catch (error) {
    console.error("[verifyQuotationDocumentRequestAction]", error);
    return {
      success: false,
      error: "Failed to verify uploaded customer document.",
    };
  }
}
