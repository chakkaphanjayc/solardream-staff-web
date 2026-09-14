import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { activityLogs, proposals, quotationDocumentRequests } from "@/db/schema";
import { portalJson, resolvePortalAccess } from "@/lib/portalAccess";
import { publishPortalStateChanged } from "@/lib/portalEvents";


const infoPayloadSchema = z.object({
  proposalId: z.string().trim().min(1),
  documentRequestId: z.string().trim().min(1),
  magicTokenSlug: z.string().trim().optional(),
  fields: z.record(z.string(), z.string().trim().max(500)).default({}),
});

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

export async function POST(request: NextRequest) {
  try {
    const parsed = infoPayloadSchema.parse(await request.json());
    const access = await resolvePortalAccess({
      request,
      proposalId: parsed.proposalId,
      capability: "documents:write",
      mutation: true,
    });
    if (!access) {
      return portalJson({ success: false, error: "Unauthorized document request update." }, { status: 401 });
    }

    const [proposal, documentRequest] = await Promise.all([
      db.query.proposals.findFirst({
        where: eq(proposals.id, parsed.proposalId),
        columns: {
          id: true,
          userId: true,
          magicTokenSlug: true,
        },
      }),
      db.query.quotationDocumentRequests.findFirst({
        where: and(
          eq(quotationDocumentRequests.id, parsed.documentRequestId),
          eq(quotationDocumentRequests.quotationId, parsed.proposalId),
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
        { success: false, error: "This request has already been approved." },
        { status: 409 },
      );
    }

    if (!["LOCATION", "CONTACT_INFO"].includes(documentRequest.requestType)) {
      return portalJson(
        { success: false, error: "This request expects a file upload." },
        { status: 400 },
      );
    }

    const requiredKeys = documentRequest.requestType === "CONTACT_INFO"
      ? ["name", "phone", "lineId"]
      : ["location"];
    const missing = requiredKeys.filter((key) => !parsed.fields[key]);
    if (missing.length > 0) {
      return portalJson(
        { success: false, error: "Please complete all required information." },
        { status: 400 },
      );
    }

    const [updatedRequest] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(quotationDocumentRequests)
        .set({
          status: "UPLOADED",
          metadata: {
            fields: parsed.fields,
            submittedAt: new Date().toISOString(),
            kind: documentRequest.requestType,
          },
          updatedAt: new Date(),
        })
        .where(and(
          eq(quotationDocumentRequests.id, documentRequest.id),
          eq(quotationDocumentRequests.quotationId, proposal.id),
        ))
        .returning();

      await tx.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: "CUSTOMER_DOCUMENT_INFO_SUBMITTED",
        description: `Customer submitted ${documentRequest.documentName}.`,
        userId: access.actorUserId,
      });

      return [updated];
    });
    await publishPortalStateChanged(proposal.id, "DOCUMENT_INFO_SUBMITTED");

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
    });
  } catch (error) {
    console.error("[Document Request Info]:", error);
    return portalJson(
      { success: false, error: "Failed to save requested information." },
      { status: 500 },
    );
  }
}
