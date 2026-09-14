import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/db";
import {
  activityLogs,
  installationJobTickets,
  paymentRequests,
  quotationDeliveryDocuments,
  quotationDocumentRequests,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { mapLeadToCrmRow, mapProposalToCrmRow } from "@/lib/crmRows";
import { getProposalWithExpiration } from "@/app/actions/proposals";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { getErpnextQuotationEquipment } from "@/app/actions/erpnextQuotation";
import { getQuotationDocumentTemplateCatalog } from "@/app/actions/quotationDocumentTemplates";
import { getSalesThreadByLead, getSalesThreadByProposal } from "@/app/actions/salesThread";
import { ensurePaymentRequestSchema } from "@/lib/paymentRequestSchema";
import { and, desc, eq, ne } from "drizzle-orm";
import { listCatalogProducts } from "@/lib/erpnextCatalog";
import QueryProvider from "@/components/providers/QueryProvider";
import CrmWorkBenchClient from "./CrmWorkBenchClient";

export const instant = false;

interface CrmWorkbenchPageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}


type AvailableProductRow = {
  id: string;
  brand: string;
  model: string;
  price: number;
  imageUrl: string;
  stock: number;
  wattageCapacity: number | null;
  category: {
    name: string;
  } | null;
};

type AvailableServiceFeeRow = {
  id: string;
  name: string;
  erpItemCode: string;
  basePrice: number;
  isActive: boolean;
  createdAt: Date;
};

type CustomerDocument = {
  id: string;
  name: string;
  url: string;
  verified: boolean;
  sizeBytes: number | null;
  mimeType: string | null;
  canVerify: boolean;
};

type PaymentRequestRow = {
  id: string;
  proposalId: string;
  title: string;
  amountRequested: number | string;
  paymentType: "FULL" | "INSTALLMENT";
  paymentMethod: "QR" | "BANK_TRANSFER";
  status: "PENDING" | "AWAITING_VERIFICATION" | "PAID" | "FAILED";
  slipUrl: string | null;
  slipImageUrl: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  easySlipData: Record<string, unknown> | null;
};

type QuotationDocumentRequestRow = {
  id: string;
  quotationId: string;
  documentName: string;
  descriptionHint: string | null;
  requestType: string;
  isRequired: boolean;
  status: "PENDING" | "UPLOADED" | "APPROVED";
  fileUrl: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type QuotationDeliveryDocumentRow = {
  id: string;
  quotationId: string;
  deliveryType: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  storageProvider: string | null;
  storageFileId: string | null;
  fallbackUrl: string | null;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATIC_ASSET_PATTERN = /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isStaticAssetRequest(value: string) {
  return STATIC_ASSET_PATTERN.test(value);
}

async function getActivityLogsForCrm(entityId: string) {
  // Legacy lead/proposal IDs are text, while activity_logs.entity_id is UUID.
  // Skip this optional query for malformed route segments (for example an
  // asset accidentally resolved through /admin/crm/[id]) instead of sending
  // an invalid value to PostgreSQL.
  if (!isUuid(entityId)) return [];

  return db.query.activityLogs.findMany({
    where: eq(activityLogs.entityId, entityId),
    orderBy: [desc(activityLogs.createdAt)],
    limit: 50,
  });
}

async function getPaymentRequestsForCrm(proposalId: string): Promise<PaymentRequestRow[]> {
  try {
    return await db.query.paymentRequests.findMany({
      where: (table, { eq }) => eq(table.proposalId, proposalId),
    }) as PaymentRequestRow[];
  } catch (error) {
    // Deployments can briefly run newer application code against a database where
    // the payment-verification migration is still pending. Keep the CRM record usable.
    console.error("[CRM] Payment request schema is behind the application schema.", error);

    const legacyRows = await db
      .select({
        id: paymentRequests.id,
        proposalId: paymentRequests.proposalId,
        title: paymentRequests.title,
        amountRequested: paymentRequests.amountRequested,
        status: paymentRequests.status,
        slipUrl: paymentRequests.slipUrl,
        easySlipData: paymentRequests.easySlipData,
      })
      .from(paymentRequests)
      .where(eq(paymentRequests.proposalId, proposalId));

    return legacyRows.map((row) => ({
      ...row,
      paymentType: "INSTALLMENT",
      paymentMethod: "QR",
      slipImageUrl: null,
      verifiedBy: null,
      verifiedAt: null,
      easySlipData:
        row.easySlipData && typeof row.easySlipData === "object" && !Array.isArray(row.easySlipData)
          ? row.easySlipData as Record<string, unknown>
          : null,
    }));
  }
}

function fileNameFromUrl(url: string, fallback: string) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return name || fallback;
  } catch {
    return fallback;
  }
}

function normalizeCustomerDocuments(
  lead: Record<string, unknown> | null,
  proposal: Record<string, unknown> | null,
): CustomerDocument[] {
  const documents: CustomerDocument[] = [];
  const seenUrls = new Set<string>();
  const addDocument = (document: CustomerDocument) => {
    if (!document.url || seenUrls.has(document.url)) return;
    seenUrls.add(document.url);
    documents.push(document);
  };

  const config = asRecord(proposal?.configurationData ?? lead?.configurationSnapshot);
  if (Array.isArray(config.customerDocuments)) {
    config.customerDocuments.forEach((value, index) => {
      const document = asRecord(value);
      const url = typeof document.url === "string" ? document.url : "";
      if (!url) return;
      addDocument({
        id: typeof document.id === "string" ? document.id : `customer-document-${index}`,
        name: typeof document.name === "string"
          ? document.name
          : fileNameFromUrl(url, `Customer document ${index + 1}`),
        url,
        verified: document.verified === true,
        sizeBytes: typeof document.sizeBytes === "number"
          ? document.sizeBytes
          : typeof document.size === "number" ? document.size : null,
        mimeType: typeof document.mimeType === "string" ? document.mimeType : null,
        canVerify: Boolean(proposal),
      });
    });
  }

  const addProposalFile = (key: string, label: string, mimeType = "application/pdf") => {
    const url = proposal?.[key];
    if (typeof url !== "string" || !url) return;
    addDocument({
      id: key,
      name: label,
      url,
      verified: key === "signedDocumentDriveUrl",
      sizeBytes: null,
      mimeType,
      canVerify: false,
    });
  };

  addProposalFile("signedDocumentDriveUrl", "Signed Quotation PDF");
  addProposalFile("revisedPdfUrl", "Revised Quotation PDF");
  addProposalFile("pdfUrl", "Quotation PDF");

  if (Array.isArray(proposal?.surveyPhotos)) {
    proposal.surveyPhotos.forEach((value, index) => {
      if (typeof value !== "string" || !value) return;
      addDocument({
        id: `survey-photo-${index}`,
        name: `Site Survey Photo ${index + 1}`,
        url: value,
        verified: false,
        sizeBytes: null,
        mimeType: "image/*",
        canVerify: false,
      });
    });
  }

  const leadDocuments = lead?.proposalDocuments;
  if (Array.isArray(leadDocuments)) {
    leadDocuments.forEach((value, index) => {
      const document = asRecord(value);
      const url = typeof document.fileUrl === "string" ? document.fileUrl : "";
      if (!url) return;
      addDocument({
        id: typeof document.id === "string" ? document.id : `lead-document-${index}`,
        name: fileNameFromUrl(url, `Proposal document ${index + 1}`),
        url,
        verified: document.status === "APPROVED",
        sizeBytes: null,
        mimeType: "application/pdf",
        canVerify: false,
      });
    });
  }

  return documents;
}

function uploadedDocumentsFromRequestRows(
  documentRequests: QuotationDocumentRequestRow[],
  paymentRequestRows: PaymentRequestRow[],
): CustomerDocument[] {
  return [
    ...documentRequests
      .filter((request) => Boolean(request.fileUrl))
      .map((request) => ({
        id: `document-request-${request.id}`,
        name: request.documentName,
        url: request.fileUrl || "",
        verified: request.status === "APPROVED",
        sizeBytes: null,
        mimeType: null,
        canVerify: false,
      })),
    ...paymentRequestRows
      .filter((request) => Boolean(request.slipUrl))
      .map((request) => ({
        id: `payment-slip-${request.id}`,
        name: `Payment slip: ${request.title}`,
        url: request.slipUrl || "",
        verified: request.status === "PAID",
        sizeBytes: null,
        mimeType: null,
        canVerify: false,
      })),
  ];
}

export default async function AdminCrmRecordPage({
  params,
}: CrmWorkbenchPageProps) {
  const { locale, id } = await params;

  // A relative asset URL can otherwise be interpreted as a CRM record ID by
  // this dynamic segment. Return a normal 404 before any auth or DB work.
  if (isStaticAssetRequest(id)) {
    notFound();
  }

  await connection();
  await requireStaff();

  await ensurePaymentRequestSchema().catch((error: unknown) => {
    console.error("[Admin CRM] payment-request schema reconciliation failed:", error);
  });

  const [lead, proposal, products, serviceFees, logs, existingJobTicket, allFinancings, initialPaymentRequests, initialDocumentRequests, initialDeliveryDocuments, erpnextBaseUrlRaw, documentTemplateCatalog] = await Promise.all([
    db.query.leads.findFirst({
      where: (leads, { eq }) => eq(leads.id, id),
      with: {
        savedConfiguration: {
          with: {
            user: true,
          },
        },
        proposalDocuments: true,
        installationProject: true,
      },
    }),
    db.query.proposals.findFirst({
      where: (proposals, { eq }) => eq(proposals.id, id),
      with: {
        user: true,
        selectedFinancing: true,
      },
    }),
    listCatalogProducts({ sort: "newest", take: 100 }).then((result) =>
      result.products.sort((left, right) => right.recommendPriority - left.recommendPriority),
    ),
    db.query.serviceFeeConfigs.findMany({
      where: (configs, { eq }) => eq(configs.isActive, true),
      orderBy: (configs, { desc }) => [desc(configs.createdAt)],
    }),
    getActivityLogsForCrm(id),
    db.query.installationJobTickets.findFirst({
      where: eq(installationJobTickets.quotationId, id),
      columns: {
        id: true,
      },
    }),
    db.query.financingOptions.findMany(),
    getPaymentRequestsForCrm(id),
    db.query.quotationDocumentRequests.findMany({
      where: eq(quotationDocumentRequests.quotationId, id),
      with: {
        attachments: true,
      },
      orderBy: [desc(quotationDocumentRequests.createdAt)],
    }).catch(() => []),
    db.query.quotationDeliveryDocuments.findMany({
      where: and(
        eq(quotationDeliveryDocuments.quotationId, id),
        ne(quotationDeliveryDocuments.status, "ARCHIVED"),
      ),
      with: {
        attachments: {
          orderBy: (attachments, { asc }) => [asc(attachments.createdAt)],
        },
      },
      orderBy: [desc(quotationDeliveryDocuments.createdAt)],
    }).catch(() => []),
    getSystemSetting("erpnext_site_endpoint"),
    getQuotationDocumentTemplateCatalog(),
  ]);

  const resolvedProposal = proposal
    ? await getProposalWithExpiration(proposal)
    : null;
  const initialRow = lead
    ? mapLeadToCrmRow(lead)
    : resolvedProposal
      ? mapProposalToCrmRow(resolvedProposal)
      : null;

  if (!initialRow) {
    notFound();
  }

  const initialErpnextEquipment = initialRow.erpnextQuotationId
    ? await getErpnextQuotationEquipment(initialRow.erpnextQuotationId)
    : [];
  const salesThread = proposal
    ? await getSalesThreadByProposal(id)
    : lead
      ? await getSalesThreadByLead(id)
      : null;

  return (
    <QueryProvider>
      <CrmWorkBenchClient
        key={initialRow.id}
        initialRow={initialRow}
      availableProducts={products.map((product: AvailableProductRow) => ({
        id: product.id,
        brand: product.brand,
        model: product.model,
        price: product.price,
        imageUrl: product.imageUrl,
        stock: product.stock,
        categoryName: product.category?.name || null,
        wattageCapacity: product.wattageCapacity || null,
      }))}
      availableServiceFees={serviceFees.map((fee: AvailableServiceFeeRow) => ({
        id: fee.id,
        name: fee.name,
        erpItemCode: fee.erpItemCode,
        basePrice: fee.basePrice,
        isActive: fee.isActive,
        createdAt: fee.createdAt.toISOString(),
      }))}
      activityLogs={logs.map((log) => ({
        id: log.id,
        action: log.action,
        description: log.description,
        userId: log.userId,
        createdAt: log.createdAt.toISOString(),
      }))}
      locale={locale}
      salesThread={salesThread}
      erpnextBaseUrl={(erpnextBaseUrlRaw || process.env.ERPNEXT_BASE_URL || "").trim().replace(/\/$/, "")}
      initialErpnextEquipment={initialErpnextEquipment}
      initialCustomerDocuments={[
        ...normalizeCustomerDocuments(
          lead as unknown as Record<string, unknown> | null,
          proposal as unknown as Record<string, unknown> | null,
        ),
        ...uploadedDocumentsFromRequestRows(
          initialDocumentRequests as QuotationDocumentRequestRow[],
          initialPaymentRequests as PaymentRequestRow[],
        ),
      ]}
      initialHasJobTicket={Boolean(existingJobTicket)}
      initialJobTicketId={existingJobTicket?.id || null}
      financingOptions={allFinancings}
      initialPaymentRequests={(initialPaymentRequests as PaymentRequestRow[]).map((pr) => ({
        id: pr.id,
        proposalId: pr.proposalId,
        title: pr.title,
        amountRequested: Number(pr.amountRequested),
        paymentType: pr.paymentType,
        paymentMethod: pr.paymentMethod,
        status: pr.status,
        slipUrl: pr.slipUrl,
        slipImageUrl: pr.slipImageUrl,
        verifiedBy: pr.verifiedBy,
        verifiedAt: pr.verifiedAt?.toISOString() || null,
        easySlipData: pr.easySlipData,
      }))}
      initialDocumentRequests={(initialDocumentRequests as QuotationDocumentRequestRow[]).map((request) => ({
        id: request.id,
        documentName: request.documentName,
        descriptionHint: request.descriptionHint,
        requestType: request.requestType as "FILE" | "LOCATION" | "CONTACT_INFO",
        isRequired: request.isRequired,
        status: request.status,
        fileUrl: request.fileUrl,
        metadata: request.metadata,
      }))}
      initialDeliveryDocuments={(initialDeliveryDocuments as QuotationDeliveryDocumentRow[]).map((document) => ({
        id: document.id,
        quotationId: document.quotationId,
        deliveryType: document.deliveryType,
        title: document.title,
        description: document.description,
        fileUrl: document.fileUrl,
        storageProvider: document.storageProvider,
        storageFileId: document.storageFileId,
        fallbackUrl: document.fallbackUrl,
        status: document.status,
        metadata: document.metadata,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      }))}
        initialDocumentTemplateCatalog={documentTemplateCatalog}
      />
    </QueryProvider>
  );
}
