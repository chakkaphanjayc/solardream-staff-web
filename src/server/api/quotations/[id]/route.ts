import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { proposalDispatchStatusEnum, proposals } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";


const UpdateQuotationStatusSchema = z.object({
  status: z.string().min(1).optional(),
  dispatchStatus: z.enum(proposalDispatchStatusEnum.enumValues).optional(),
}).refine((value) => value.status !== undefined || value.dispatchStatus !== undefined, {
  message: "At least one status field is required.",
});

function safeIsoDate(value: unknown): string {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function serializeQuotation(row: NonNullable<Awaited<ReturnType<typeof getQuotationRow>>>) {
  return {
    id: row.id,
    status: row.status,
    dispatchStatus: row.dispatchStatus,
    magicTokenSlug: row.magicTokenSlug,
    erpnextQuotationId: row.erpnextQuotationId,
    updatedAt: safeIsoDate(row.updatedAt),
    documentRequests: row.documentRequests.map((request) => ({
      id: request.id,
      quotationId: request.quotationId,
      documentName: request.documentName,
      descriptionHint: request.descriptionHint,
      requestType: request.requestType,
      isRequired: request.isRequired,
      status: request.status,
      fileUrl: request.fileUrl,
      metadata: request.metadata,
      attachments: request.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        storageProvider: attachment.storageProvider,
        storageFileId: attachment.storageFileId,
        fallbackUrl: attachment.fallbackUrl,
        metadata: attachment.metadata,
        createdAt: safeIsoDate(attachment.createdAt),
        updatedAt: safeIsoDate(attachment.updatedAt),
      })),
      updatedAt: safeIsoDate(request.updatedAt),
    })),
  };
}

function isMissingAttachmentTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const cause = "cause" in error ? error.cause : null;
  return Boolean(
    cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "42P01" &&
      "message" in cause &&
      typeof cause.message === "string" &&
      cause.message.includes("quotation_document_request_attachments"),
  );
}

async function getQuotationRow(id: string) {
  const query = {
    where: eq(proposals.id, id),
    columns: {
      id: true,
      status: true,
      dispatchStatus: true,
      magicTokenSlug: true,
      erpnextQuotationId: true,
      updatedAt: true,
    },
  } as const;
  try {
    return await db.query.proposals.findFirst({
      ...query,
      with: {
        documentRequests: {
          with: { attachments: true },
        },
      },
    },
    );
  } catch (error) {
    if (!isMissingAttachmentTableError(error)) throw error;
    const legacyQuotation = await db.query.proposals.findFirst({
      ...query,
      with: { documentRequests: true },
    });
    return legacyQuotation
      ? {
          ...legacyQuotation,
          documentRequests: legacyQuotation.documentRequests.map((request) => ({
            ...request,
            attachments: [],
          })),
        }
      : undefined;
  }
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  await requireStaff();
  const { id } = await context.params;
  const quotation = await getQuotationRow(id);

  if (!quotation) {
    return NextResponse.json({ error: "Quotation was not found." }, { status: 404 });
  }

  return NextResponse.json({ quotation: serializeQuotation(quotation) });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  await requireStaff();
  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = UpdateQuotationStatusSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid quotation status payload." },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(proposals)
    .set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.dispatchStatus ? { dispatchStatus: parsed.data.dispatchStatus } : {}),
    })
    .where(eq(proposals.id, id))
    .returning({ id: proposals.id });

  if (!updated) {
    return NextResponse.json({ error: "Quotation was not found." }, { status: 404 });
  }

  const quotation = await getQuotationRow(updated.id);

  if (!quotation) {
    return NextResponse.json({ error: "Quotation was not found after update." }, { status: 404 });
  }

  return NextResponse.json({ success: true, quotation: serializeQuotation(quotation) });
}
