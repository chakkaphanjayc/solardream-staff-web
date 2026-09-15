import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { WORKER_EVENT_SCHEMA_VERSION } from "@solar-dream/contracts/workers";
import type { DocumentJob } from "@solar-dream/contracts/workers";

import { db } from "@/db";
import { proposals, quotationDeliveryDocuments } from "@/db/schema";
import { getOrCreateQuotationDeliveryDriveHierarchy, uploadBufferToDriveFolder } from "@/lib/googleDrive";

type DocumentOutboxEvent = {
  id: string;
  topic: string;
  aggregateId: string;
  payload: unknown;
};

type PdfItem = {
  categoryName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapItem(value: unknown): PdfItem | null {
  const item = asRecord(value);
  const productName = text(item.productName || item.item_name || item.name || item.model);
  if (!productName) return null;
  const quantity = Math.max(1, number(item.quantity ?? item.qty, 1));
  const unitPrice = number(item.unitPrice ?? item.rate ?? item.basePrice ?? item.price);
  return {
    categoryName: text(item.categoryName || item.category || item.group || item.section, "Quotation Item"),
    productName,
    quantity,
    unitPrice,
    totalPrice: number(item.totalPrice ?? item.amount, unitPrice * quantity),
  };
}

function proposalItems(configurationData: unknown, totalPrice: number): PdfItem[] {
  const config = asRecord(configurationData);
  const items = [
    ...(Array.isArray(config.items) ? config.items : []),
    ...(Array.isArray(config.serviceFees) ? config.serviceFees : []),
  ].map(mapItem).filter((item): item is PdfItem => Boolean(item));

  return items.length > 0
    ? items
    : [{ categoryName: "Quotation", productName: "Final Proposal Total", quantity: 1, unitPrice: totalPrice, totalPrice }];
}

function fileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "proposal";
}

function parseDocumentJob(value: unknown): DocumentJob {
  const payload = asRecord(value);
  if (payload.schemaVersion !== WORKER_EVENT_SCHEMA_VERSION || payload.operation !== "render") {
    throw new Error("Unsupported document worker job.");
  }
  const proposalId = text(payload.proposalId);
  if (!proposalId) throw new Error("Document worker job is missing its proposal ID.");
  return {
    schemaVersion: WORKER_EVENT_SCHEMA_VERSION,
    operation: "render",
    proposalId,
    requestedBy: text(payload.requestedBy) || null,
    sourceDocumentId: text(payload.sourceDocumentId) || null,
  };
}

export async function renderProposalDocument(job: DocumentJob) {
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, job.proposalId),
    with: {
      user: {
        columns: { name: true, fullName: true, email: true, phoneNumber: true },
      },
    },
  });
  if (!proposal) throw new Error("Document worker proposal does not exist.");

  const existing = await db.query.quotationDeliveryDocuments.findFirst({
    where: and(
      eq(quotationDeliveryDocuments.quotationId, proposal.id),
      eq(quotationDeliveryDocuments.deliveryType, "FINAL_QUOTATION"),
    ),
  });
  if (existing?.status === "READY" && (existing.storageFileId || existing.fileUrl)) {
    return { reused: true, documentId: existing.id, fileUrl: existing.fileUrl };
  }
  if (proposal.signedDocumentDriveUrl || ["SIGNED", "CLIENT_SIGNED_PENDING_REVIEW"].includes(proposal.status.toUpperCase())) {
    throw new Error("Signed quotation documents are immutable and cannot be rerendered.");
  }

  const { generateProposalPdfBuffer } = await import("@/lib/pdf-generator");
  const pdfBuffer = await generateProposalPdfBuffer({
    leadId: proposal.id,
    name: proposal.user?.name || proposal.user?.fullName || proposal.user?.email?.split("@")[0] || "Customer",
    email: proposal.user?.email || "",
    phone: text(proposal.user?.phoneNumber),
    location: text(asRecord(proposal.configurationData).buyerAddress || asRecord(proposal.configurationData).location, "Thailand"),
    buyerTaxId: text(asRecord(proposal.configurationData).taxId || asRecord(proposal.configurationData).buyerTaxId),
    totalPrice: proposal.totalPrice,
    items: proposalItems(proposal.configurationData, proposal.totalPrice),
    systemkWp: proposal.systemSizeKwp,
    panelCount: proposal.panelCount,
    estimatedSavings: proposal.monthlySavings,
    paybackPeriod: proposal.paybackPeriod,
    meterType: text(asRecord(proposal.configurationData).meterType, "NORMAL"),
    electricityRate: number(asRecord(proposal.configurationData).electricityRate, 4.5),
    dailyEnergyKwh: number(asRecord(proposal.configurationData).dailyEnergyKwh),
    PR: number(asRecord(proposal.configurationData).PR),
    documentDate: proposal.createdAt,
  });
  const documentHash = createHash("sha256").update(pdfBuffer).digest("hex");
  const hierarchy = await getOrCreateQuotationDeliveryDriveHierarchy(proposal.userId, proposal.id);
  const uploaded = await uploadBufferToDriveFolder({
    folder: hierarchy.quotationFolder,
    fileBuffer: pdfBuffer,
    mimeType: "application/pdf",
    fileName: `Quotation-${fileSegment(proposal.id)}-v${proposal.revisionNumber}.pdf`,
  });
  const now = new Date();
  const metadata = {
    ...asRecord(existing?.metadata),
    documentWorker: {
      schemaVersion: WORKER_EVENT_SCHEMA_VERSION,
      operation: "render",
      documentHash,
      generatedAt: now.toISOString(),
      requestedBy: job.requestedBy || null,
      sourceDocumentId: job.sourceDocumentId || null,
    },
  };

  let documentId = existing?.id || null;
  let resolvedFileUrl = uploaded.fileUrl;
  if (existing) {
    await db.update(quotationDeliveryDocuments).set({
      title: "ใบเสนอราคาฉบับสมบูรณ์",
      fileUrl: uploaded.fileUrl,
      storageProvider: "GOOGLE_DRIVE",
      storageFileId: uploaded.fileId,
      fallbackUrl: null,
      status: "READY",
      metadata,
      updatedAt: now,
    }).where(eq(quotationDeliveryDocuments.id, existing.id));
  } else {
    const [created] = await db.insert(quotationDeliveryDocuments).values({
      id: `document-${proposal.id}-${proposal.revisionNumber}`,
      quotationId: proposal.id,
      deliveryType: "FINAL_QUOTATION",
      title: "ใบเสนอราคาฉบับสมบูรณ์",
      description: "Rendered by the SolarDream document worker.",
      fileUrl: uploaded.fileUrl,
      storageProvider: "GOOGLE_DRIVE",
      storageFileId: uploaded.fileId,
      status: "READY",
      metadata,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing().returning({ id: quotationDeliveryDocuments.id });
    documentId = created?.id || null;
    if (!documentId) {
      const concurrentDocument = await db.query.quotationDeliveryDocuments.findFirst({
        where: and(
          eq(quotationDeliveryDocuments.quotationId, proposal.id),
          eq(quotationDeliveryDocuments.deliveryType, "FINAL_QUOTATION"),
        ),
      });
      documentId = concurrentDocument?.id || null;
      resolvedFileUrl = concurrentDocument?.fileUrl || resolvedFileUrl;
    }
  }

  if (!documentId) throw new Error("Document worker could not resolve the persisted quotation document.");
  await db.update(proposals).set({ pdfUrl: resolvedFileUrl, updatedAt: now }).where(eq(proposals.id, proposal.id));
  return { reused: false, documentId, fileUrl: resolvedFileUrl, documentHash };
}

export async function deliverDocumentWorkerEvent(event: DocumentOutboxEvent) {
  const job = parseDocumentJob(event.payload);
  if (job.proposalId !== event.aggregateId) {
    throw new Error("Document worker aggregate does not match the proposal ID.");
  }
  return renderProposalDocument(job);
}
