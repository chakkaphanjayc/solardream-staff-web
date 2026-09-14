import { desc } from "drizzle-orm";

import { db } from "@/db";
import { paymentRequests, quotationDocumentRequests } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import UploadedDocumentsClient, { type UploadedDocumentReviewRow } from "./UploadedDocumentsClient";


type PageProps = {
  params: Promise<{ locale: string }>;
};

function getCustomerName(user: { name: string | null; fullName: string; email: string } | null | undefined) {
  return user?.name || user?.fullName || user?.email || "Unknown customer";
}

function getPaymentUploadTime(row: typeof paymentRequests.$inferSelect & {
  proposal?: { createdAt: Date } | null;
}) {
  const metadata = row.easySlipData;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const uploadedAt = (metadata as Record<string, unknown>).uploadedAt;
    if (typeof uploadedAt === "string") {
      const parsed = new Date(uploadedAt);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }

  return row.proposal?.createdAt.toISOString() || new Date(0).toISOString();
}

function getPaymentMetadataText(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  const item = metadata[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

export default async function AdminUploadedDocumentsPage({ params }: PageProps) {
  const { locale } = await params;
  await requireStaff();

  const [documentRows, paymentRows] = await Promise.all([
    db.query.quotationDocumentRequests.findMany({
      orderBy: [desc(quotationDocumentRequests.updatedAt)],
      with: {
        quotation: {
          columns: {
            id: true,
            erpnextQuotationId: true,
            magicTokenSlug: true,
            totalPrice: true,
            createdAt: true,
          },
          with: {
            user: {
              columns: {
                name: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
      limit: 250,
    }),
    db.query.paymentRequests.findMany({
      with: {
        proposal: {
          columns: {
            id: true,
            erpnextQuotationId: true,
            magicTokenSlug: true,
            totalPrice: true,
            createdAt: true,
          },
          with: {
            user: {
              columns: {
                name: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
      limit: 250,
    }),
  ]);

  const documents: UploadedDocumentReviewRow[] = [
    ...documentRows.map((row) => ({
      id: row.id,
      proposalId: row.quotationId,
      quotationLabel: row.quotation?.erpnextQuotationId || row.quotationId.slice(0, 10).toUpperCase(),
      customerName: getCustomerName(row.quotation?.user),
      customerEmail: row.quotation?.user?.email || "",
      title: row.documentName,
      type: "CUSTOMER_DOCUMENT" as const,
      status: row.status,
      url: row.fileUrl,
      amount: null,
      isRequired: row.isRequired,
      storageProvider: row.storageProvider,
      storageFileId: row.storageFileId,
      fallbackUrl: row.fallbackUrl,
      updatedAt: row.updatedAt.toISOString(),
      portalPath: `/${locale}/portal/${row.quotationId}`,
      adminPath: `/${locale}/admin/quotations/${row.quotationId}`,
    })),
    ...paymentRows.map((row) => ({
      id: row.id,
      proposalId: row.proposalId,
      quotationLabel: row.proposal?.erpnextQuotationId || row.proposalId.slice(0, 10).toUpperCase(),
      customerName: getCustomerName(row.proposal?.user),
      customerEmail: row.proposal?.user?.email || "",
      title: `Payment slip: ${row.title}`,
      type: "PAYMENT_SLIP" as const,
      status: row.status,
      url: row.slipUrl,
      amount: Number(row.amountRequested),
      isRequired: true,
      verificationStatus: getPaymentMetadataText(row.easySlipData, "verificationStatus"),
      storageProvider: row.storageProvider || getPaymentMetadataText(row.easySlipData, "storageProvider"),
      storageFileId: row.storageFileId,
      fallbackUrl: row.fallbackUrl || getPaymentMetadataText(row.easySlipData, "fallbackUrl"),
      verificationError: getPaymentMetadataText(row.easySlipData, "verificationError"),
      updatedAt: getPaymentUploadTime(row),
      portalPath: `/${locale}/portal/${row.proposalId}`,
      adminPath: `/${locale}/admin/quotations/${row.proposalId}`,
    })),
  ].sort((a, b) => {
    const aNeedsReview = a.status === "UPLOADED" || a.status === "AWAITING_VERIFICATION";
    const bNeedsReview = b.status === "UPLOADED" || b.status === "AWAITING_VERIFICATION";
    if (aNeedsReview !== bNeedsReview) return aNeedsReview ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return <UploadedDocumentsClient initialRows={documents} />;
}
