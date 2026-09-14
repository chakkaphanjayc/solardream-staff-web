"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CirclePlus,
  FileCheck,
  FileText,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  User,
  Zap,
  X,
  Minus,
  Wrench,
  ExternalLink,
  FileImage,
  MapPin,
  Compass,
  CreditCard,
  PenLine,
  Mail,
  Copy,
  Link2,
  CheckCircle2,
  PackageCheck,
  Eye,
  UploadCloud,
  Archive,
  FolderOpen,
  Hash,
  Send,
  Phone,
  Check,
  ChevronRight,
  SlidersHorizontal,
  Clock,
} from "@/components/ui/icons";
import type { LifecyclePhase } from "@/components/admin/crm/LifecycleStepper";
import { convertLeadToProposal } from "@/app/actions/lead";
import {
  createErpnextQuotationFromLead,
  ensureErpnextQuotationSync,
  type ErpnextQuotationEquipmentItem,
} from "@/app/actions/erpnextQuotation";
import { approveProposalRevision } from "@/app/actions/proposals";
import { generatePaymentRequestAction, verifyClientPaymentSlipAction, processPaymentRequestSlipAction } from "@/app/actions/paymentRequests";
import PaymentInvoiceModal from "@/components/payments/PaymentInvoiceModal";
import PaymentReceiptModal from "@/components/payments/PaymentReceiptModal";
import { toast } from "sonner";
import {
  updateRevisionMatrix,
} from "@/app/actions/fulfillment";
import { cn } from "@/lib/utils";
import { getBrowserPublicOrigin } from "@/lib/siteUrl";
import { FULFILLMENT_INSTALLATION } from "@/lib/fulfillment";
import { type CrmRow } from "@/lib/crmRows";
import dynamic from "next/dynamic";
const SiteLocationMap = dynamic(() => import("@/components/admin/SiteLocationMap"), { ssr: false });
import {
  AuditLogSidebar,
  AuditLogTrigger,
  type AuditTimelineItem,
} from "@/components/ui/AuditLogSidebar";
import ConfirmActionModal from "@/components/layout/ConfirmActionModal";
import SolarCard from "@/components/ui/SolarCard";
import BoqBuilder from "@/components/admin/BoqBuilder";
import QuotationDocumentPreviewLoader, { type QuotationDocumentPreviewKind } from "@/components/admin/QuotationDocumentPreviewLoader";
import Skeleton from "@/components/ui/skeleton";
import { GsapReveal, GsapSpinner } from "@/components/ui/GsapMotion";
import { useQuotation } from "@/hooks/useQuotation";
import SalesThreadCard from "@/components/admin/SalesThreadCard";
import type { SalesThread } from "@/types/salesThread";
import {
  cancelQuotationChain,
  confirmSignedContractAndCloseDeal,
  markQuotationLostChain,
  sendQuotationForCustomerApproval,
  sendQuotationToCustomer,
} from "@/app/actions/quotationActions";
import { dispatchQuotationForSigning } from "@/app/actions/quotationDispatch";
import PrepareSigningDispatchModal, { type DispatchConfig } from "@/components/admin/PrepareSigningDispatchModal";
import {
  saveQuotationDocumentRequests,
  verifyQuotationDocumentRequestAction,
} from "@/app/actions/quotationDocumentRequests";
import {
  CUSTOMER_DOCUMENT_REQUEST_TEMPLATES,
  getDocumentRequestTemplateByName,
  type DocumentRequestType,
} from "@/lib/customerDocumentRequests";
import {
  getQuotationDeliveryDocumentVersion,
  QUOTATION_DELIVERY_DOCUMENT_TEMPLATES,
  WARRANTY_DISCLOSURE_TEMPLATES,
  type QuotationDeliveryDocumentType,
} from "@/lib/quotationDeliveryDocuments";
import { approveAndCreateJobTicketAction, toggleCustomerDocumentVerificationAction } from "@/app/actions/handover";
import Combobox from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { saveQuotationDocumentTemplateCatalog } from "@/app/actions/quotationDocumentTemplates";
import type {
  DocumentRequestTemplateConfig,
  DeliveryDocumentTemplateConfig,
  QuotationDocumentTemplateCatalog,
  WarrantyDisclosureTemplateConfig,
} from "@/lib/quotationDocumentTemplates";
import type {
  ErpnextCustomerCandidate,
  ErpnextCustomerBindingState,
  ErpnextIntegrationData,
} from "./crmWorkbench.types";
import { getSalesWorkspaceCopy } from "@/components/admin/crm/sales-workspace/copy";
import {
  ActivityLog,
  CommercialSummaryCard,
  CurrentAction,
  CustomerSummaryCard,
  DocumentChecklist,
  ERPConnectionCard,
  HandoffChecklist,
  SalesStageStepper,
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceButton,
  WorkspaceMetricStrip,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge,
  WorkspaceTabs,
} from "@/components/admin/crm/sales-workspace/workspace-ui";
import {
  deriveSalesWorkspaceState,
  type SalesWorkspaceTabId,
} from "@/lib/sales-workspace/workflow";

type ProductOption = {
  id: string;
  brand: string;
  model: string;
  price: number;
  imageUrl: string;
  stock: number;
  categoryName: string | null;
  wattageCapacity: number | null;
};

type ServiceFeeOption = {
  id: string;
  name: string;
  erpItemCode: string;
  basePrice: number;
  isActive: boolean;
  createdAt: string | Date;
};

type RevisionLineItem = {
  key: string;
  productId: string | null;
  item_code: string;
  brand: string;
  model: string;
  description: string;
  qty: number;
  unitPrice: number;
  thumbnailUrl: string | null;
  categoryName: string | null;
};

type ServiceFeeLineItem = {
  key: string;
  serviceFeeId: string;
  name: string;
  erpItemCode: string;
  basePrice: number;
  qty: number;
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

type EasySlipData = {
  rawSlip?: {
    sender?: {
      displayName?: string;
      name?: string;
    };
    transRef?: string;
    amount?: {
      amount?: number | string;
    };
    transDate?: string;
    transTime?: string;
    receiver?: {
      account?: string;
    };
  };
  senderName?: string;
  transRef?: string;
};

type PaymentRequest = {
  id: string;
  proposalId: string;
  title: string;
  amountRequested: number;
  paymentType: "FULL" | "INSTALLMENT";
  paymentMethod: "QR" | "BANK_TRANSFER";
  status: "PENDING" | "AWAITING_VERIFICATION" | "PAID" | "FAILED";
  slipUrl: string | null;
  slipImageUrl: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  easySlipData: EasySlipData | null;
};

type QuotationDocumentRequestStatus = "PENDING" | "UPLOADED" | "APPROVED";

type QuotationDocumentRequest = {
  id?: string;
  documentName: string;
  descriptionHint?: string | null;
  requestType?: DocumentRequestType;
  isRequired: boolean;
  status: QuotationDocumentRequestStatus;
  fileUrl: string | null;
  metadata?: unknown;
  attachments?: Array<{
    id?: string;
    fileName?: string;
    fileUrl?: string;
    metadata?: unknown;
    createdAt?: string | Date;
  }>;
};

type QuotationDeliveryDocument = {
  id?: string;
  quotationId?: string;
  deliveryType: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  storageProvider?: string | null;
  storageFileId?: string | null;
  fallbackUrl?: string | null;
  status: string;
  metadata?: unknown;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    storageProvider: string;
    storageFileId?: string | null;
    fallbackUrl?: string | null;
    metadata?: unknown;
    createdAt: string;
    updatedAt: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

type FinancingOption = {
  id: string;
  providerName?: string | null;
  financeType?: string | null;
  interestRate?: string | null;
  maxTermMonths?: number | null;
  marketingTag?: string | null;
};

type WorkbenchProps = {
  initialRow: CrmRow;
  salesThread: SalesThread | null;
  availableProducts: ProductOption[];
  availableServiceFees: ServiceFeeOption[];
  activityLogs?: AuditTimelineItem[];
  locale: string;
  erpnextBaseUrl?: string;
  initialCustomerDocuments: CustomerDocument[];
  initialHasJobTicket: boolean;
  initialJobTicketId?: string | null;
  financingOptions?: FinancingOption[];
  initialPaymentRequests?: PaymentRequest[];
  initialDocumentRequests?: QuotationDocumentRequest[];
  initialDeliveryDocuments?: QuotationDeliveryDocument[];
  initialErpnextEquipment?: ErpnextQuotationEquipmentItem[];
  initialDocumentTemplateCatalog?: QuotationDocumentTemplateCatalog;
};

type ConfirmActionState =
  | {
      kind: "route-installation" | "route-purchase" | "generate-quotation" | "create-erp-customer-and-generate" | "send-approval" | "start-revision";
      title: string;
      message: string;
      confirmLabel: string;
      intent?: "primary" | "destructive";
    }
  | {
      kind: "mark-lost";
      title: string;
      message: string;
      confirmLabel: string;
      intent?: "primary" | "destructive";
    }
  | {
      kind: "delete-line-item";
      title: string;
      message: string;
      confirmLabel: string;
      intent?: "primary" | "destructive";
      key: string;
    }
  | null;

type CustomerRevisionRequest = {
  message: string;
  requestedAt: string | null;
  requestedBy: string | null;
};

function formatThb(value: number | null) {
  if (value === null) return "No value";
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getQuotationDocumentNo(proposalId: string) {
  return `QT-${proposalId.slice(0, 8).toUpperCase()}`;
}

function getDefaultPortalLinkExpiry() {
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getCustomerRevisionRequests(configurationData: unknown): CustomerRevisionRequest[] {
  const revisionRequests = asRecord(configurationData).revisionRequests;
  if (!Array.isArray(revisionRequests)) return [];

  return revisionRequests.flatMap((value) => {
    const request = asRecord(value);
    const message = asString(request.message);
    if (!message) return [];

    return [{
      message,
      requestedAt: asString(request.requestedAt) || null,
      requestedBy: asString(request.requestedBy) || null,
    }];
  });
}

function formatRevisionRequestDate(value: string | null, locale: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString(locale === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getFirstString(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const value = asString(source[key]);
      if (value) return value;
    }
  }
  return "";
}

function getFirstNumber(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      const parsed = typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function getTechnicalProfile(row: CrmRow) {
  const config = asRecord(row.configurationData);
  const raw = asRecord(row.raw);
  const dynamic = asRecord(config.dynamicCalculations);
  const summary = asRecord(config.summary);
  const profile = asRecord(config.systemProfile);
  const answers = asRecord(config.wizardAnswers);
  const contact = asRecord(config.customerContact);
  const sources = [config, dynamic, summary, profile, answers, raw];

  const targetCapacity =
    row.systemSizeKwp ??
    getFirstNumber(sources, ["targetCapacity", "targetSystemSize", "systemSizeKwp", "systemkWp", "system_size_kw"]);
  const estimatedBudget =
    row.value ??
    getFirstNumber(sources, ["estimatedBudget", "preliminaryEstimatedBudget", "totalPrice", "grandTotal", "systemPackagePrice"]);
  const monthlySavings =
    getFirstNumber(sources, ["predictedMonthlySavings", "calculatedMonthlySavings", "estimatedMonthlySavings", "monthlySavings"]) ??
    null;
  const inverterArchitecture = getFirstString(sources, [
    "inverterArchitecture",
    "inverterType",
    "inverterProfile",
    "architecture",
  ]) || "Not specified";
  const smartAddOns = [
    ...getStringList(config.smartAddOns),
    ...getStringList(config.addOns),
    ...getStringList(dynamic.smartAddOns),
    ...getStringList(dynamic.addOns),
  ].filter((value, index, array) => array.indexOf(value) === index);
  const preferredContactTime = getFirstString([config, dynamic, answers, contact, raw], [
    "preferredDateTime",
    "preferredContactTime",
    "preferred_contact_time",
    "contactTime",
  ]);
  const leadRequirements = getFirstString([raw, config], ["notes", "requirements", "customerNotes", "customer_notes"]);

  return {
    targetCapacity,
    estimatedBudget,
    inverterArchitecture,
    smartAddOns,
    monthlySavings,
    fullName: row.customerName,
    phone: row.phone || getFirstString([config, contact, raw], ["phone", "phoneNumber", "contactPhoneNumber"]),
    email: row.email,
    postalCode: getFirstString([config, contact, raw], ["postalCode", "postal_code", "zipCode"]),
    preferredContactTime,
    leadRequirements,
  };
}

function formatFileSize(sizeBytes: number | null) {
  if (sizeBytes === null) return "Size unavailable";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageDocument(document: CustomerDocument) {
  if (document.mimeType?.startsWith("image/")) return true;
  if (document.name && /\.(avif|gif|jpe?g|png|webp)$/i.test(document.name)) return true;
  return /\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(document.url);
}

function isPdfDocument(document: CustomerDocument) {
  if (document.mimeType === "application/pdf") return true;
  if (document.name && /\.pdf$/i.test(document.name)) return true;
  return /\.pdf(?:$|\?)/i.test(document.url);
}

function getDocumentPreviewKind(document: CustomerDocument): QuotationDocumentPreviewKind {
  if (isImageDocument(document)) return "image";
  if (isPdfDocument(document)) return "pdf";
  return "unknown";
}

function getAdminDocumentPreviewUrl(recordId: string, document: CustomerDocument, download = false) {
  const params = new URLSearchParams({
    documentId: document.id,
    sourceUrl: document.url,
  });
  if (download) params.set("download", "1");
  return `/api/admin/quotations/${encodeURIComponent(recordId)}/document-preview?${params.toString()}`;
}

type LifecycleState = {
  phase: LifecyclePhase;
  isSentToCustomer: boolean;
  customerEmbedUrl: string;
  magicLink: string;
  previewUrl: string;
};

function getLifecycleState(row: CrmRow, locale: string): LifecycleState {
  const config = asRecord(row.configurationData);
  const dispatch = asRecord(config.dispatch);
  const delivery = asRecord(config.delivery);
  const status = row.status.toUpperCase();
  const isSentToCustomer = delivery.isSentToCustomer === true || dispatch.isSentToCustomer === true;
  const customerEmbedUrl = getFirstString(
    [row as unknown as Record<string, unknown>, dispatch, config],
    ["customerEmbedUrl", "clientEmbedUrl", "client_embed_url", "customer_embed_url"]
  );
  const magicLink = row.type === "PROPOSAL" ? `/${locale}/portal/${row.id}` : "";
  const previewUrl = row.signedDocumentDriveUrl || row.pdfUrl || customerEmbedUrl || "";

  let phase: LifecyclePhase = 1;
  if (row.erpnextQuotationId && status === "AWAITING_STAFF_SIGNATURE") {
    phase = 2;
  } else if (status === "AWAITING_CLIENT_SIGNATURE" && !isSentToCustomer) {
    phase = 3;
  } else if (status === "AWAITING_CLIENT_SIGNATURE" && isSentToCustomer) {
    phase = 4;
  } else if (status === "CLIENT_SIGNED_PENDING_REVIEW") {
    phase = 5;
  } else if (status === "FULLY_SIGNED" || status === "SIGNED") {
    phase = 6;
  } else if (row.erpnextQuotationId) {
    phase = 2;
  }

  return {
    phase,
    isSentToCustomer,
    customerEmbedUrl,
    magicLink,
    previewUrl,
  };
}

function absoluteCustomerLink(link: string) {
  if (!link) return "";
  if (/^https?:\/\//i.test(link)) return link;
  return `${getBrowserPublicOrigin()}${link.startsWith("/") ? link : `/${link}`}`;
}

function compactCustomerLink(link: string) {
  const absoluteLink = absoluteCustomerLink(link);
  if (!absoluteLink) return "";

  try {
    const url = new URL(absoluteLink);
    const token = url.searchParams.get("token");
    return token
      ? `${url.origin}/verify/…/${token.slice(-8)}`
      : `${url.origin}${url.pathname}`;
  } catch {
    return absoluteLink;
  }
}

function getLocalPortalTestOrigin() {
  const localUrl = new URL(window.location.origin);
  if (localUrl.hostname === "0.0.0.0") localUrl.hostname = "localhost";
  return localUrl.origin;
}

const DOCUMENT_REQUEST_TEMPLATES = CUSTOMER_DOCUMENT_REQUEST_TEMPLATES;

function getDocumentRequestStatusTone(status: QuotationDocumentRequestStatus) {
  if (status === "APPROVED") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  if (status === "UPLOADED") return "border-sky-400/30 bg-sky-500/10 text-sky-300";
  return "border-amber-400/30 bg-amber-500/10 text-amber-300";
}

function getUploadedFileName(request: QuotationDocumentRequest): string | null {
  if (!request.fileUrl) return null;
  if (request.attachments && request.attachments.length > 0 && request.attachments[0].fileName) {
    return request.attachments[0].fileName;
  }
  if (request.metadata && typeof request.metadata === "object") {
    const meta = request.metadata as Record<string, unknown>;
    if (typeof meta.originalFileName === "string" && meta.originalFileName.trim()) {
      return meta.originalFileName.trim();
    }
    if (typeof meta.storedFileName === "string" && meta.storedFileName.trim()) {
      return meta.storedFileName.trim();
    }
  }
  if (request.fileUrl) {
    try {
      const urlObj = new URL(request.fileUrl);
      const pathname = urlObj.pathname;
      const lastSegment = pathname.split("/").pop();
      if (lastSegment && lastSegment.includes(".")) {
        return decodeURIComponent(lastSegment);
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function normalizeDocumentRequestName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function getLifecycleStatusBadge(phase: LifecyclePhase) {
  if (phase === 1) return "Status: Ready for ERP sync";
  if (phase === 2) return "Action: Staff signature required";
  if (phase === 3) return "Action: Ready to send";
  if (phase === 4) return "Status: Waiting for client";
  if (phase === 5) return "Action: Admin review required";
  return "Status: Approved";
}

function normalizeItems(row: CrmRow, productsById: Map<string, ProductOption>) {
  const sourceItems = Array.isArray(row.configurationData?.items) ? row.configurationData.items : [];
  if (sourceItems.length === 0) return [];

  return sourceItems.map((item, index) => {
    const record = asRecord(item);
    const productId = typeof record.productId === "string" ? record.productId : null;
    const product = productId ? productsById.get(productId) : undefined;
    const qty = Math.max(1, asNumber(record.qty ?? record.quantity ?? record.count, 1));
    const unitPrice = asNumber(record.rate ?? record.unitPrice ?? record.price ?? product?.price, product?.price ?? 0);
    const itemCode = String(record.item_code || record.itemCode || record.sku || product?.model || `ITEM-${index + 1}`);
    const brand = String(record.brand || product?.brand || "").trim();
    const model = String(record.model || product?.model || record.productName || record.name || "").trim();
    const description = String(
      record.description ||
        [brand, model].filter(Boolean).join(" ") ||
        product?.categoryName ||
        "Solar hardware component"
    );

    return {
      key: `${productId || itemCode}-${index}`,
      productId,
      item_code: itemCode,
      brand,
      model,
      description,
      qty,
      unitPrice,
      thumbnailUrl: product?.imageUrl || null,
      categoryName: product?.categoryName || null,
    } satisfies RevisionLineItem;
  });
}

function lineItemFromProduct(product: ProductOption, index: number): RevisionLineItem {
  return {
    key: `${product.id}-${Date.now()}-${index}`,
    productId: product.id,
    item_code: product.model || `ITEM-${index + 1}`,
    brand: product.brand,
    model: product.model,
    description: [product.brand, product.model].filter(Boolean).join(" "),
    qty: 1,
    unitPrice: product.price,
    thumbnailUrl: product.imageUrl,
    categoryName: product.categoryName,
  };
}

function serviceFeeLineItemFromOption(fee: ServiceFeeOption, index: number): ServiceFeeLineItem {
  return {
    key: `${fee.id}-${Date.now()}-${index}`,
    serviceFeeId: fee.id,
    name: fee.name,
    erpItemCode: fee.erpItemCode,
    basePrice: fee.basePrice,
    qty: 1,
  };
}

function CustomerTechnicalProfile({
  profile,
}: {
  profile: ReturnType<typeof getTechnicalProfile>;
}) {
  const t = useTranslations("AdminCrmTechnicalProfile");
  const smartAddOns = profile.smartAddOns.length > 0 ? profile.smartAddOns : [t("noSmartAddons")];

  return (
    <GsapReveal className="space-y-4">
      <SolarCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/35 px-3 py-1.5 text-xs font-black text-[#0369a1]">
              <Compass className="h-4 w-4" />
              {t("badge")}
            </div>
            <h3 className="mt-4 text-2xl font-black tracking-tight text-gray-100 text-wrap balance">
              {t("title")}
            </h3>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-gray-400">
              {t("description")}
            </p>
            {profile.leadRequirements ? (
              <div className="mt-4 max-w-3xl rounded-xl border border-[#B7D1EA]/40 bg-[#B7D1EA]/10 p-4">
                <p className="text-xs font-black text-[#B7D1EA]">Notes / Requirements</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-100">{profile.leadRequirements}</p>
              </div>
            ) : null}
          </div>
          <div className="rounded-xl bg-[#0F172A] px-4 py-3 text-sm font-black text-gray-100">
            {profile.targetCapacity !== null ? `${profile.targetCapacity.toFixed(2)} kWp` : t("capacityPending")}
          </div>
        </div>
      </SolarCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <SolarCard className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-[#0369a1]" />
            <h4 className="text-lg font-black text-gray-100">{t("systemSpecifications")}</h4>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ProfileTile
              label={t("targetCapacity")}
              value={profile.targetCapacity !== null ? `${profile.targetCapacity.toFixed(2)} kWp` : t("notSpecified")}
              emphasis
            />
            <ProfileTile
              label={t("budget")}
              value={profile.estimatedBudget !== null ? formatThb(profile.estimatedBudget) : t("notSpecified")}
              emphasis
            />
            <ProfileTile
              label={t("inverterArchitecture")}
              value={profile.inverterArchitecture}
            />
            <ProfileTile
              label={t("monthlySavings")}
              value={profile.monthlySavings !== null ? formatThb(profile.monthlySavings) : t("notSpecified")}
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs font-black text-slate-400">{t("smartAddons")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {smartAddOns.map((addon) => (
                <span
                  key={addon}
                  className="rounded-full border border-slate-800 bg-[#141B2D] px-3 py-1.5 text-xs font-black text-slate-100"
                >
                  {addon}
                </span>
              ))}
            </div>
          </div>
        </SolarCard>

        <SolarCard className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#0369a1]" />
            <h4 className="text-lg font-black text-gray-100">{t("communicationProfile")}</h4>
          </div>
          <div className="mt-5 space-y-3">
            <ProfileTile label={t("fullName")} value={profile.fullName || t("unknownCustomer")} compact />
            <ProfileTile label={t("phone")} value={profile.phone || t("noPhone")} compact />
            <ProfileTile label={t("email")} value={profile.email || t("noEmail")} compact />
            <ProfileTile label={t("postalCode")} value={profile.postalCode || t("notSpecified")} compact />
            <div className="rounded-xl border border-[#B7D1EA]/60 bg-[#B7D1EA]/25 p-4">
              <p className="text-xs font-black text-[#0369a1]">{t("preferredContactTime")}</p>
              <p className="mt-1 text-base font-black leading-6 text-gray-100">
                {profile.preferredContactTime || t("contactTimePending")}
              </p>
              <p className="mt-1 text-xs font-semibold text-gray-400">
                {t("contactTimeHint")}
              </p>
            </div>
          </div>
        </SolarCard>
      </div>
    </GsapReveal>
  );
}

function ProfileTile({
  label,
  value,
  compact = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className={cn(
        "mt-1 break-words font-black text-slate-100",
        emphasis ? "text-2xl leading-tight tracking-tight" : compact ? "text-sm leading-6" : "text-base leading-6"
      )}>
        {value}
      </p>
    </div>
  );
}

function QuotationDocumentRequestCard({
  requests,
  templates,
  customDocumentName,
  onCustomDocumentNameChange,
  onAddTemplate,
  onAddCustom,
  onToggleRequired,
  onRemoveRequest,
  onViewFile,
  onVerifyRequest,
  onUpdateCustomerView,
  onConfigureTemplates,
  busyAction,
}: {
  requests: QuotationDocumentRequest[];
  templates: DocumentRequestTemplateConfig[];
  customDocumentName: string;
  onCustomDocumentNameChange: (value: string) => void;
  onAddTemplate: (name: string) => void;
  onAddCustom: () => void;
  onToggleRequired: (index: number) => void;
  onRemoveRequest: (index: number) => void;
  onViewFile: (request: QuotationDocumentRequest) => void;
  onVerifyRequest: (request: QuotationDocumentRequest, decision: "APPROVE" | "REJECT") => void;
  onUpdateCustomerView: () => void;
  onConfigureTemplates: () => void;
  busyAction: string | null;
}) {
  const t = useTranslations("AdminCrmDocumentRequests");

  return (
    <div className="rounded-md border border-[#30363d] bg-[#161b22] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-[#30363d] p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#58a6ff]/20 bg-[#58a6ff]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#58a6ff]">
            <FileText className="h-3.5 w-3.5" />
            {t("badge")}
          </div>
          <h3 className="mt-3 text-base font-semibold text-[#f0f6fc]">
            {t("title")}
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#8b949e]">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onConfigureTemplates}
            className="inline-flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] hover:bg-[#30363d] px-3 py-1.5 text-xs font-medium text-[#c9d1d9] transition-colors cursor-pointer"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t("configureTemplates")}
          </button>
          <button
            type="button"
            onClick={onUpdateCustomerView}
            disabled={busyAction === "update-document-requests"}
            className="inline-flex items-center gap-2 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] px-3 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
          >
            {busyAction === "update-document-requests" ? <GsapSpinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {t("updateCustomerView")}
          </button>
        </div>
      </div>

      {/* Count bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#30363d] bg-[#0d1117]/40 px-5 py-3">
        <p className="text-xs font-medium text-[#8b949e]">
          {t("requestCount", { count: requests.length })}
        </p>
      </div>

      {/* Add documents section */}
      <div className="p-5 space-y-4">
        <div className="space-y-3 rounded-md border border-[#30363d] bg-[#0d1117] p-4">
          {/* Template quick-add chips */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b949e]">
              {t("templates")}
            </p>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => {
                const alreadyAdded = requests.some((request) =>
                  normalizeDocumentRequestName(request.documentName).toLocaleLowerCase("th-TH") ===
                  template.documentName.toLocaleLowerCase("th-TH")
                );

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onAddTemplate(template.documentName)}
                    disabled={alreadyAdded}
                    title={template.descriptionHint || template.documentName}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs font-medium leading-5 transition cursor-pointer",
                      alreadyAdded
                        ? "cursor-not-allowed border-[#30363d] bg-[#161b22] text-[#484f58]"
                        : "border-[#30363d] bg-[#21262d] text-[#c9d1d9] hover:border-[#58a6ff]/40 hover:text-[#58a6ff]",
                    )}
                  >
                    <CirclePlus className="h-3.5 w-3.5 text-[#58a6ff] shrink-0" />
                    {template.documentName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom document name input */}
          <div className="border-t border-[#30363d] pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b949e]">
              {t("customDocument")}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={customDocumentName}
                onChange={(event) => onCustomDocumentNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAddCustom();
                  }
                }}
                placeholder={t("customDocumentPlaceholder")}
                className="min-h-9 flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm font-medium text-[#f0f6fc] placeholder-[#484f58] outline-none transition focus:border-[#58a6ff]/60 focus:ring-1 focus:ring-[#58a6ff]/20"
              />
              <button
                type="button"
                onClick={onAddCustom}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] hover:bg-[#30363d] px-3 text-xs font-medium text-[#c9d1d9] transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                {t("add")}
              </button>
            </div>
          </div>
        </div>

        {/* Document list */}
        <div className="overflow-hidden rounded-md border border-[#30363d] bg-[#0d1117]">
          {requests.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center px-5 py-8 text-center">
              <div>
                <FileText className="mx-auto h-7 w-7 text-[#484f58]" />
                <p className="mt-3 text-sm font-semibold text-[#8b949e]">{t("emptyTitle")}</p>
                <p className="mt-1 text-xs text-[#484f58]">{t("emptyDescription")}</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#30363d]">
              {requests.map((request, index) => {
                const uploadedFileName = getUploadedFileName(request);

                return (
                  <div
                    key={`${request.id || request.documentName}-${index}`}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#161b22]/60"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                        <FileText className="h-3.5 w-3.5 text-[#58a6ff] shrink-0" />
                        <h4 className="text-xs font-semibold text-[#f0f6fc] leading-snug">
                          {request.documentName}
                        </h4>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium shrink-0",
                            getDocumentRequestStatusTone(request.status),
                          )}
                        >
                          {request.status}
                        </span>
                        {request.requestType && request.requestType !== "FILE" ? (
                          <span className="rounded-full border border-[#58a6ff]/30 bg-[#58a6ff]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#58a6ff] shrink-0">
                            {request.requestType === "LOCATION" ? t("locationFields") : t("contactFields")}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {request.descriptionHint ? (
                      <p className="text-xs leading-relaxed text-[#8b949e]">
                        {request.descriptionHint}
                      </p>
                    ) : null}

                    {uploadedFileName ? (
                      <div className="flex max-w-full items-center gap-2 rounded-md border border-[#58a6ff]/20 bg-[#58a6ff]/8 px-3 py-2 text-xs">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-[#58a6ff]" />
                        <span className="font-medium text-[#8b949e] shrink-0">Uploaded:</span>
                        <span className="truncate font-mono font-medium text-[#c9d1d9]" title={uploadedFileName}>
                          {uploadedFileName}
                        </span>
                      </div>
                    ) : (
                      !request.descriptionHint && (
                        <p className="text-xs text-[#484f58]">
                          {t("waitingForDelivery")}
                        </p>
                      )
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#30363d] mt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {request.fileUrl ? (
                          <button
                            type="button"
                            onClick={() => onViewFile(request)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#21262d] hover:bg-[#30363d] px-2.5 py-1 text-xs font-medium text-[#c9d1d9] transition-colors cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {t("view")}
                          </button>
                        ) : null}
                        {request.id && request.fileUrl && request.status === "UPLOADED" ? (
                          <button
                            type="button"
                            onClick={() => onVerifyRequest(request, "APPROVE")}
                            disabled={busyAction === `verify-doc-request-${request.id}-APPROVE`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#238636]/40 bg-[#238636]/10 hover:bg-[#238636]/20 px-2.5 py-1 text-xs font-medium text-[#3fb950] transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
                          >
                            {busyAction === `verify-doc-request-${request.id}-APPROVE` ? t("saving") : t("approve")}
                          </button>
                        ) : null}
                        {request.id && request.fileUrl && request.status === "APPROVED" ? (
                          <button
                            type="button"
                            onClick={() => onVerifyRequest(request, "REJECT")}
                            disabled={busyAction === `verify-doc-request-${request.id}-REJECT`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#d29922]/30 bg-[#d29922]/10 hover:bg-[#d29922]/15 px-2.5 py-1 text-xs font-medium text-[#d29922] transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
                          >
                            {busyAction === `verify-doc-request-${request.id}-REJECT` ? t("saving") : t("return")}
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleRequired(index)}
                          className={cn(
                            "inline-flex min-w-[130px] items-center justify-between rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                            request.isRequired
                              ? "border-[#f85149]/30 bg-[#f85149]/10 text-[#f85149]"
                              : "border-[#30363d] bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]",
                          )}
                          aria-pressed={request.isRequired}
                        >
                          <span>{request.isRequired ? t("required") : t("optional")}</span>
                          <span
                            className={cn(
                              "grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold transition",
                              request.isRequired ? "bg-[#f85149] text-white" : "bg-[#30363d] text-[#8b949e]",
                            )}
                          >
                            {request.isRequired ? "R" : "O"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveRequest(index)}
                          className="grid h-7 w-7 place-items-center rounded-md border border-[#f85149]/40 bg-transparent text-[#f85149] transition-colors hover:bg-[#f85149]/10 cursor-pointer"
                          aria-label={t("removeDocument", { name: request.documentName })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentTemplateManager({
  isOpen,
  catalog,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  catalog: QuotationDocumentTemplateCatalog;
  onClose: () => void;
  onSave: (catalog: QuotationDocumentTemplateCatalog) => Promise<void>;
}) {
  const t = useTranslations("AdminCrmDocumentTemplates");
  const [draft, setDraft] = useState(catalog);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<"outbound" | "inbound">("outbound");

  const updateRequest = (index: number, patch: Partial<DocumentRequestTemplateConfig>) => {
    setDraft((current) => ({
      ...current,
      requests: current.requests.map((template, templateIndex) => templateIndex === index ? { ...template, ...patch } : template),
    }));
  };
  const updateDelivery = (index: number, patch: Partial<DeliveryDocumentTemplateConfig>) => {
    setDraft((current) => ({
      ...current,
      deliveries: current.deliveries.map((template, templateIndex) => templateIndex === index ? { ...template, ...patch } : template),
    }));
  };
  const updateWarranty = (index: number, patch: Partial<WarrantyDisclosureTemplateConfig>) => {
    setDraft((current) => ({ ...current, warranties: current.warranties.map((template, templateIndex) => templateIndex === index ? { ...template, ...patch } : template) }));
  };
  const addRequestTemplate = () => {
    setDraft((current) => ({
      ...current,
      requests: [...current.requests, {
        id: `custom-${crypto.randomUUID()}`,
        documentName: t("newClientDocument"),
        descriptionHint: null,
        requestType: "FILE",
        isRequired: false,
      }],
    }));
  };
  const addDeliveryTemplate = () => setDraft((current) => ({
    ...current,
    deliveries: [...current.deliveries, { deliveryType: `CUSTOM_${crypto.randomUUID()}`, title: "Additional customer document", description: "Additional document shared with the customer.", required: false }],
  }));
  const addWarrantyTemplate = () => setDraft((current) => ({
    ...current,
    warranties: [...current.warranties, { id: `warranty-${crypto.randomUUID()}`, equipment: "Additional warranty coverage", coverage: "Describe the warranty coverage and duration.", isVisibleToClient: true }],
  }));
  const save = async () => {
    setIsSaving(true);
    await onSave(draft);
    setIsSaving(false);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="full">
      <DialogHeader>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#B7D1EA]">{t("eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-black text-white">{t("title")}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{t("description")}</p>
      </DialogHeader>
      <DialogBody className="space-y-8 overflow-y-auto">
        <div className="sticky top-0 z-10 -mx-2 border-b border-slate-800 bg-[#0F172A] px-2 pb-4" role="tablist" aria-label={t("title")}>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              role="tab"
              aria-selected={activeTemplateTab === "outbound"}
              onClick={() => setActiveTemplateTab("outbound")}
              className={cn(
                "min-h-16 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]",
                activeTemplateTab === "outbound"
                  ? "border-[#B7D1EA] bg-[#B7D1EA]/15 text-white"
                  : "border-slate-800 bg-[#0B1121] text-slate-400 hover:border-slate-700 hover:text-slate-200",
              )}
            >
              <span className="block text-sm font-black">{t("outboundTab")}</span>
              <span className="mt-1 block text-xs font-medium text-slate-400">{t("outboundCount", { count: draft.deliveries.length + draft.warranties.length })}</span>
              <span className="mt-1 block text-xs text-slate-500">{t("outboundTabDescription")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTemplateTab === "inbound"}
              onClick={() => setActiveTemplateTab("inbound")}
              className={cn(
                "min-h-16 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]",
                activeTemplateTab === "inbound"
                  ? "border-[#B7D1EA] bg-[#B7D1EA]/15 text-white"
                  : "border-slate-800 bg-[#0B1121] text-slate-400 hover:border-slate-700 hover:text-slate-200",
              )}
            >
              <span className="block text-sm font-black">{t("inboundTab")}</span>
              <span className="mt-1 block text-xs font-medium text-slate-400">{t("inboundCount", { count: draft.requests.length })}</span>
              <span className="mt-1 block text-xs text-slate-500">{t("inboundTabDescription")}</span>
            </button>
          </div>
        </div>
        {activeTemplateTab === "outbound" ? (
          <>
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-black text-white">{t("deliveryDocuments")}</h3><button type="button" onClick={addDeliveryTemplate} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#B7D1EA]/50 px-4 text-xs font-bold text-[#B7D1EA] transition hover:bg-[#B7D1EA]/10"><Plus className="h-4 w-4" />Add delivery document</button></div>
          <div className="mt-3 space-y-3">
            {draft.deliveries.map((template, index) => (
              <div key={template.deliveryType} className="grid gap-3 rounded-xl border border-slate-800 bg-[#0B1121] p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto_auto]">
                <input value={template.title} onChange={(event) => updateDelivery(index, { title: event.target.value })} className="min-h-11 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-sm font-bold text-white" aria-label={t("deliveryDocumentTitle")} />
                <input value={template.description} onChange={(event) => updateDelivery(index, { description: event.target.value })} className="min-h-11 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-sm text-slate-200" aria-label={t("deliveryDocumentDescription")} />
                <label className="inline-flex min-h-11 items-center gap-2 text-xs font-bold text-slate-200"><input type="checkbox" checked={template.required} onChange={(event) => updateDelivery(index, { required: event.target.checked })} className="h-4 w-4 accent-[#B7D1EA]" />{t("required")}</label>
                {template.deliveryType.startsWith("CUSTOM_") ? <button type="button" onClick={() => setDraft((current) => ({ ...current, deliveries: current.deliveries.filter((_, templateIndex) => templateIndex !== index) }))} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-400/50 px-3 text-rose-300 hover:bg-rose-500/10" aria-label={`Remove ${template.title}`}><X className="h-4 w-4" /></button> : <span />}
              </div>
            ))}
          </div>
        </section>
        <section className="border-t border-slate-800 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-black text-white">Warranty disclosure</h3><p className="mt-1 text-sm text-slate-300">Only client-visible rows appear in the customer portal.</p></div><button type="button" onClick={addWarrantyTemplate} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#B7D1EA]/50 px-4 text-xs font-bold text-[#B7D1EA] transition hover:bg-[#B7D1EA]/10"><Plus className="h-4 w-4" />Add warranty coverage</button></div>
          <div className="mt-3 space-y-3">{draft.warranties.map((template, index) => <div key={template.id} className="grid gap-3 rounded-xl border border-slate-800 bg-[#0B1121] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto_auto]"><input value={template.equipment} onChange={(event) => updateWarranty(index, { equipment: event.target.value })} className="min-h-11 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-sm font-bold text-white" aria-label="Warranty equipment" /><input value={template.coverage} onChange={(event) => updateWarranty(index, { coverage: event.target.value })} className="min-h-11 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-sm text-slate-200" aria-label="Warranty coverage" /><label className="inline-flex min-h-11 items-center gap-2 text-xs font-bold text-slate-200"><input type="checkbox" checked={template.isVisibleToClient} onChange={(event) => updateWarranty(index, { isVisibleToClient: event.target.checked })} className="h-4 w-4 accent-[#B7D1EA]" />Show to client</label><button type="button" onClick={() => setDraft((current) => ({ ...current, warranties: current.warranties.filter((_, templateIndex) => templateIndex !== index) }))} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-400/50 px-3 text-rose-300 hover:bg-rose-500/10" aria-label={`Remove ${template.equipment}`}><X className="h-4 w-4" /></button></div>)}</div>
        </section>
          </>
        ) : (
        <section className="border-t border-slate-800 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-base font-black text-white">{t("requestTemplates")}</h3><p className="mt-1 text-sm text-slate-300">{t("requestTemplatesDescription")}</p></div>
            <button type="button" onClick={addRequestTemplate} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#B7D1EA]/50 px-4 text-xs font-bold text-[#B7D1EA] transition hover:bg-[#B7D1EA]/10"><Plus className="h-4 w-4" />{t("createTemplate")}</button>
          </div>
          <div className="mt-3 space-y-3">
            {draft.requests.map((template, index) => (
              <div key={template.id} className="grid gap-3 rounded-xl border border-slate-800 bg-[#0B1121] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_150px_auto_auto]">
                <input value={template.documentName} onChange={(event) => updateRequest(index, { documentName: event.target.value })} className="min-h-11 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-sm font-bold text-white" aria-label={t("requestTemplateName")} />
                <input value={template.descriptionHint || ""} onChange={(event) => updateRequest(index, { descriptionHint: event.target.value || null })} className="min-h-11 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-sm text-slate-200" aria-label={t("requestTemplateDescription")} />
                <select value={template.requestType} onChange={(event) => updateRequest(index, { requestType: event.target.value as DocumentRequestType })} className="min-h-11 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-xs font-bold text-white"><option value="FILE">{t("fileUpload")}</option><option value="LOCATION">{t("locationGps")}</option><option value="CONTACT_INFO">{t("contactDetails")}</option></select>
                <label className="inline-flex min-h-11 items-center gap-2 text-xs font-bold text-slate-200"><input type="checkbox" checked={template.isRequired} onChange={(event) => updateRequest(index, { isRequired: event.target.checked })} className="h-4 w-4 accent-[#B7D1EA]" />{t("required")}</label>
                <button type="button" onClick={() => setDraft((current) => ({ ...current, requests: current.requests.filter((_, templateIndex) => templateIndex !== index) }))} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-400/50 bg-transparent px-3 text-rose-300 hover:bg-rose-500/10" aria-label={t("deleteDocument", { name: template.documentName })}><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </section>
        )}
      </DialogBody>
      <DialogFooter>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-slate-700 px-4 text-xs font-bold text-slate-200">{t("cancel")}</button>
        <button type="button" onClick={() => void save()} disabled={isSaving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#B7D1EA] px-4 text-xs font-black text-[#0F172A] disabled:opacity-60">{isSaving ? <GsapSpinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{t("saveConfiguration")}</button>
      </DialogFooter>
    </Dialog>
  );
}

type DeliveryUploadSelection = {
  deliveryType: QuotationDeliveryDocumentType;
  documentTitle: string;
  file: File;
};

function DeliveryUploadConfirmationDialog({
  selection,
  isUploading,
  onClose,
  onConfirm,
}: {
  selection: DeliveryUploadSelection | null;
  isUploading: boolean;
  onClose: () => void;
  onConfirm: (selection: DeliveryUploadSelection) => Promise<boolean>;
}) {
  const t = useTranslations("AdminCrmDeliveryDocuments");
  const file = selection?.file || null;
  const isPdf = Boolean(file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")));
  const isImage = Boolean(file?.type.startsWith("image/"));
  const previewUrl = useMemo(() => {
    if (!file || (!isPdf && !isImage)) return null;
    return URL.createObjectURL(file);
  }, [file, isImage, isPdf]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <Dialog isOpen={selection !== null} onClose={isUploading ? () => undefined : onClose} size="md">
      <DialogHeader>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#B7D1EA]">{t("uploadReviewEyebrow")}</p>
        <h2 className="mt-2 text-xl font-black text-white">{t("uploadReviewTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("uploadReviewDescription")}</p>
      </DialogHeader>
      <DialogBody className="space-y-4 overflow-y-auto">
        {selection && file ? (
          <>
            <div className="rounded-xl border border-slate-700 bg-[#0B1121] p-4">
              <p className="text-sm font-black text-white">{selection.documentTitle}</p>
              <p className="mt-2 truncate text-sm font-semibold text-[#D7E8F8]" title={file.name}>{file.name}</p>
              <p className="mt-1 text-xs text-slate-400">{formatFileSize(file.size)} · {file.type || t("unknownFileType")}</p>
            </div>
            {previewUrl && isPdf ? (
              <div className="h-96 overflow-hidden rounded-xl border border-slate-700 bg-[#0B1121]">
                <QuotationDocumentPreviewLoader
                  key={previewUrl}
                  name={file.name}
                  url={previewUrl}
                  kind="pdf"
                  pdfFile={file}
                />
              </div>
            ) : null}
            {previewUrl && isImage ? (
              <div className="flex max-h-72 justify-center overflow-hidden rounded-xl border border-slate-700 bg-[#0B1121] p-3">
                <Image src={previewUrl} alt={t("filePreview", { name: file.name })} width={1200} height={900} unoptimized className="h-auto max-h-64 w-auto rounded-lg object-contain" />
              </div>
            ) : null}
            {!previewUrl ? (
              <div className="rounded-xl border border-slate-700 bg-[#0B1121] p-4 text-sm leading-6 text-slate-300">
                {t("filePreviewUnavailable")}
              </div>
            ) : null}
          </>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <button type="button" onClick={onClose} disabled={isUploading} className="min-h-11 rounded-lg border border-slate-700 px-4 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">{t("cancel")}</button>
        <button
          type="button"
          disabled={!selection || isUploading}
          onClick={() => {
            if (!selection) return;
            void onConfirm(selection).then((uploaded) => {
              if (uploaded) onClose();
            });
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#B7D1EA] px-4 text-xs font-black text-[#0F172A] transition hover:bg-[#99BFE3] disabled:cursor-wait disabled:opacity-60"
        >
          {isUploading ? <GsapSpinner className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
          {t("confirmUpload")}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

function CustomerDeliveryPayloadMatrix({
  record,
  documents,
  templates,
  warrantyTemplates,
  onUpload,
  onArchive,
  onViewFile,
  onConfigureTemplates,
  busyAction,
}: {
  record: CrmRow;
  documents: QuotationDeliveryDocument[];
  templates: DeliveryDocumentTemplateConfig[];
  warrantyTemplates: WarrantyDisclosureTemplateConfig[];
  onUpload: (deliveryType: QuotationDeliveryDocumentType, file: File) => Promise<boolean>;
  onArchive: (document: QuotationDeliveryDocument) => Promise<boolean>;
  onViewFile: (document: CustomerDocument) => void;
  onConfigureTemplates: () => void;
  busyAction: string | null;
}) {
  const t = useTranslations("AdminCrmDeliveryDocuments");
  const [archiveConfirmationId, setArchiveConfirmationId] = useState<string | null>(null);
  const [uploadSelection, setUploadSelection] = useState<DeliveryUploadSelection | null>(null);
  const finalQuotationUrl = record.revisedPdfUrl || record.pdfUrl || record.signedDocumentDriveUrl || null;
  const activeDocuments = documents.filter((document) => document.status !== "ARCHIVED");
  const documentsByType = new Map(activeDocuments.map((document) => [document.deliveryType, document]));
  const deliveryMutationInProgress = busyAction?.startsWith("upload-delivery-") === true
    || busyAction?.startsWith("archive-delivery-") === true;
  const deliveryDriveConfig = asRecord(record.configurationData.quotationDeliveryDrive);
  const metadataFolderUrl = activeDocuments
    .map((document) => asString(asRecord(document.metadata).quotationFolderUrl))
    .find(Boolean);
  const quotationFolderUrl = asString(deliveryDriveConfig.quotationFolderUrl) || metadataFolderUrl || "";
  const deliverables = templates.map((template) => {
    const saved = documentsByType.get(template.deliveryType);
    const generatedFinalUrl = template.deliveryType === "FINAL_QUOTATION" ? finalQuotationUrl : null;

    return {
      ...template,
      href: saved?.fileUrl || generatedFinalUrl,
      status: saved?.status || (generatedFinalUrl ? "READY" : "PENDING"),
      storageProvider: saved?.storageProvider || null,
      saved,
      version: getQuotationDeliveryDocumentVersion(saved, template.deliveryType === "FINAL_QUOTATION" ? Math.max(1, asNumber(record.raw.revisionNumber, 1)) : 1),
    };
  });

  return (
    <SolarCard className="overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-[#1E293B]/70 p-5 sm:p-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
            <PackageCheck className="h-3.5 w-3.5" />
            {t("badge")}
          </div>
          <h3 className="mt-3 text-lg font-black text-gray-100">{t("title")}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-400">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quotationFolderUrl ? (
            <a
              href={quotationFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#1E293B] bg-[#0F172A] px-4 py-2 text-xs font-black text-gray-200 transition hover:bg-[#0B1121] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1121]"
            >
              <FolderOpen className="h-4 w-4" />
              {t("openQuotationFolder")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
          <button type="button" onClick={onConfigureTemplates} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#B7D1EA]/40 bg-[#B7D1EA]/10 px-4 py-2 text-xs font-black text-[#D7E8F8] transition hover:bg-[#B7D1EA]/20 hover:text-white"><Settings2 className="h-4 w-4" />{t("configureDocuments")}</button>
        </div>
      </div>

      <div className="m-5 overflow-hidden rounded-xl border border-slate-800 bg-[#0B1121] sm:m-6">
        {deliverables.map((item) => (
          (() => {
            const finalQuotation = item.deliveryType === "FINAL_QUOTATION";
            const uploadLabel = item.href
              ? finalQuotation ? t("replacePdf") : t("replaceFile")
              : finalQuotation ? t("uploadPdf") : t("uploadFile");
            const accept = finalQuotation
              ? ".pdf,application/pdf"
              : ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.docx,.xlsx,.pptx,.txt";
            const savedMetadata = asRecord(item.saved?.metadata);
            const previewDocument = item.href ? {
              id: item.saved?.id ? `delivery-${item.saved.id}` : item.deliveryType,
              name: asString(savedMetadata.originalFileName) || item.title,
              url: item.href,
              verified: item.status === "READY",
              sizeBytes: null,
              mimeType: finalQuotation
                ? "application/pdf"
                : asString(savedMetadata.contentType) || null,
              canVerify: false,
            } satisfies CustomerDocument : null;
            return (
              <div key={item.deliveryType} className="grid gap-4 border-b border-slate-800/80 p-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center sm:px-5 hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold border",
                    item.href
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-700 bg-slate-800 text-slate-400"
                  )}>
                    {item.href ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" /> : <FileText className="h-4.5 w-4.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-100 truncate">{item.title}</p>
                      <span className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider",
                        item.href
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                          : item.required ? "border-amber-400/30 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-800 text-slate-400",
                      )}>
                        {item.href ? t("ready") : item.required ? t("required") : t("optional")}
                      </span>
                      {item.href ? (
                        <span className="shrink-0 rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[10px] font-extrabold text-sky-200">
                          {t("version", { version: item.version })}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.description}</p>
                    {item.saved?.attachments && item.saved.attachments.length > 1 ? (
                      <details className="mt-2 text-[11px] text-slate-400">
                        <summary className="w-fit cursor-pointer font-bold text-slate-300 hover:text-white">{t("versionHistory", { count: item.saved.attachments.length })}</summary>
                        <ul className="mt-2 space-y-1.5">
                          {[...item.saved.attachments].reverse().map((attachment) => {
                            const attachmentVersion = getQuotationDeliveryDocumentVersion({ ...item.saved!, metadata: attachment.metadata, attachments: [] }, 1);
                            return (
                              <li key={attachment.id} className="flex items-center gap-2">
                                <span>{t("version", { version: attachmentVersion })}</span>
                                <a href={attachment.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate text-[#B7D1EA] hover:text-white">{attachment.fileName}</a>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {finalQuotation && record.erpnextQuotationId ? (
                    <a
                      href={`/api/admin/quotations/${encodeURIComponent(record.id)}/pdf`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#B7D1EA]/50 bg-[#B7D1EA]/10 px-3 text-[11px] font-bold text-[#D7E8F8] transition hover:bg-[#B7D1EA]/20 hover:text-white"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>{t("downloadErpnextPdf")}</span>
                    </a>
                  ) : null}
                  {item.href ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (previewDocument) onViewFile(previewDocument);
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#B7D1EA]/40 bg-[#B7D1EA]/10 px-3 text-[11px] font-bold text-[#D7E8F8] transition hover:bg-[#B7D1EA]/20 hover:text-white"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{t("viewFile")}</span>
                    </button>
                  ) : null}
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-[11px] font-bold text-slate-200 transition hover:bg-slate-800 hover:text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>{t("openFile")}</span>
                    </a>
                  ) : null}

                  <label
                    aria-busy={busyAction === `upload-delivery-${item.deliveryType}`}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-[11px] font-bold text-slate-200 transition hover:bg-slate-800 hover:border-[#B7D1EA] hover:text-[#B7D1EA]",
                      deliveryMutationInProgress && "cursor-wait opacity-60",
                    )}
                  >
                    {busyAction === `upload-delivery-${item.deliveryType}` ? (
                      <GsapSpinner className="h-3.5 w-3.5 text-[#B7D1EA]" />
                    ) : (
                      <UploadCloud className="h-3.5 w-3.5 text-[#B7D1EA]" />
                    )}
                    <span>{uploadLabel}</span>
                    <input
                      type="file"
                      accept={accept}
                      aria-label={`${uploadLabel}: ${item.title}`}
                      className="sr-only"
                      disabled={deliveryMutationInProgress}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) {
                          setUploadSelection({
                            deliveryType: item.deliveryType,
                            documentTitle: item.title,
                            file,
                          });
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {item.saved?.id && archiveConfirmationId !== item.saved.id ? (
                    <button
                      type="button"
                      onClick={() => setArchiveConfirmationId(item.saved?.id || null)}
                      disabled={deliveryMutationInProgress}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 text-[11px] font-bold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60 cursor-pointer"
                      title="Archive document"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                {item.saved?.id && archiveConfirmationId === item.saved.id ? (
                  <div
                    className="w-full mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3"
                    role="group"
                    aria-label={t("confirmArchiving", { name: item.title })}
                  >
                    <p className="text-xs font-semibold leading-5 text-amber-100">
                      {t("archiveConfirmation")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setArchiveConfirmationId(null)}
                        disabled={deliveryMutationInProgress}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 text-xs font-black text-gray-200 transition hover:bg-[#0B1121] disabled:cursor-wait disabled:opacity-60"
                      >
                        {t("cancel")}
                      </button>
                      <button
                        type="button"
                        aria-busy={busyAction === `archive-delivery-${item.saved.id}`}
                        onClick={() => {
                          void onArchive(item.saved!).then((archived) => {
                            if (archived) setArchiveConfirmationId(null);
                          });
                        }}
                        disabled={deliveryMutationInProgress}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-black text-white transition hover:bg-amber-500 disabled:cursor-wait disabled:opacity-60"
                      >
                        {busyAction === `archive-delivery-${item.saved.id}` ? <GsapSpinner className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        {t("moveToArchive")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()
        ))}
      </div>

      <div className="m-5 mt-0 overflow-hidden border-t border-slate-700 pt-5 sm:m-6 sm:mt-0">
        <div className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#0B1121]">
        <div className="border-b border-[#1E293B] px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">{t("warrantyDisclosure")}</p>
        </div>
        <div className="divide-y divide-[#1E293B]">
          {warrantyTemplates.map((row) => (
            <div key={row.equipment} className="grid gap-2 px-4 py-3 md:grid-cols-[260px_1fr]">
              <p className="text-sm font-black text-gray-100">{row.equipment}</p>
              <p className="text-sm leading-6 text-gray-400">{row.coverage}</p>
            </div>
          ))}
        </div>
        </div>
      </div>
      <DeliveryUploadConfirmationDialog
        selection={uploadSelection}
        isUploading={deliveryMutationInProgress}
        onClose={() => setUploadSelection(null)}
        onConfirm={(selection) => onUpload(selection.deliveryType, selection.file)}
      />
    </SolarCard>
  );
}

type PortalLinkTimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
};

function calculatePortalLinkTimeLeft(expiresAt: string): PortalLinkTimeLeft {
  const targetTime = new Date(expiresAt).getTime();
  const diff = targetTime - Date.now();

  if (Number.isNaN(targetTime) || diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    isExpired: false,
  };
}

function PortalLinkCountdown({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState<PortalLinkTimeLeft>(() => calculatePortalLinkTimeLeft(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculatePortalLinkTimeLeft(expiresAt));
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (timeLeft.isExpired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-400 border border-rose-500/30">
        <Clock className="h-3 w-3 text-rose-400" />
        <span>Link Expired</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
      <Clock className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
      <span>
        Expires in: {timeLeft.days > 0 ? `${timeLeft.days}d ` : ""}
        {String(timeLeft.hours).padStart(2, "0")}h {String(timeLeft.minutes).padStart(2, "0")}m {String(timeLeft.seconds).padStart(2, "0")}s
      </span>
    </span>
  );
}

export default function CrmWorkBenchClient({
  initialRow,
  salesThread,
  availableProducts,
  availableServiceFees,
  activityLogs = [],
  locale,
  erpnextBaseUrl = "",
  initialCustomerDocuments,
  initialHasJobTicket,
  initialJobTicketId = null,
  financingOptions = [],
  initialPaymentRequests = [],
  initialDocumentRequests = [],
  initialDeliveryDocuments = [],
  initialErpnextEquipment = [],
  initialDocumentTemplateCatalog,
}: WorkbenchProps) {
  const t = useTranslations("AdminCrmWorkbench");
  const tCrm = useTranslations("AdminCrm");
  const financialT = useTranslations("AdminCrmFinancial");
  const router = useRouter();
  const [renderedAt] = useState(() => Date.now());
  const productsById = useMemo(() => new Map(availableProducts.map((product) => [product.id, product])), [availableProducts]);
  const serviceFeesById = useMemo(() => new Map(availableServiceFees.map((fee) => [fee.id, fee])), [availableServiceFees]);

  const [record, setRecord] = useState(initialRow);
  const [erpCustomerState, setErpCustomerState] = useState<ErpnextCustomerBindingState>(
    initialRow.erpnextCustomerId ? "LINKED" : "IDLE",
  );
  const [erpCustomerMessage, setErpCustomerMessage] = useState("");
  const [erpCustomerCandidates, setErpCustomerCandidates] = useState<ErpnextCustomerCandidate[]>([]);
  const [lineItems, setLineItems] = useState<RevisionLineItem[]>(() => normalizeItems(initialRow, productsById));
  const [serviceFeeItems, setServiceFeeItems] = useState<ServiceFeeLineItem[]>(() => {
    const config = asRecord(initialRow.configurationData);
    const sourceFees = Array.isArray(config.serviceFees)
      ? config.serviceFees
      : Array.isArray(config.service_fees)
        ? config.service_fees
        : [];

    return sourceFees
      .map((fee, index) => {
        const recordFee = asRecord(fee);
        const serviceFeeId = typeof recordFee.serviceFeeId === "string"
          ? recordFee.serviceFeeId
          : typeof recordFee.id === "string"
            ? recordFee.id
            : "";
        const catalogFee = serviceFeeId ? serviceFeesById.get(serviceFeeId) : undefined;
        const name = String(recordFee.name || catalogFee?.name || "").trim();
        const erpItemCode = String(recordFee.erpItemCode || recordFee.erp_item_code || catalogFee?.erpItemCode || "").trim();
        const basePrice = asNumber(recordFee.basePrice ?? recordFee.rate ?? catalogFee?.basePrice, catalogFee?.basePrice ?? 0);
        const qty = Math.max(1, asNumber(recordFee.qty ?? 1, 1));

        if (!name && !erpItemCode) return null;

        return {
          key: `${serviceFeeId || erpItemCode}-${index}`,
          serviceFeeId,
          name,
          erpItemCode,
          basePrice,
          qty,
        } satisfies ServiceFeeLineItem;
      })
      .filter((item): item is ServiceFeeLineItem => item !== null);
  });
  const [revisionNotes, setRevisionNotes] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [serviceFeeSearch, setServiceFeeSearch] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelingQuotation, setCancelingQuotation] = useState(false);
  const [markingLost, setMarkingLost] = useState(false);
  const [brokenThumbnails, setBrokenThumbnails] = useState<Record<string, boolean>>({});
  const [brokenProductThumbnails, setBrokenProductThumbnails] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);
  const [debugPayload, setDebugPayload] = useState<unknown>(null);
  const [isErrorExpanded, setIsErrorExpanded] = useState(true);
  const [revisionDraft, setRevisionDraft] = useState<{ amendedFrom: string; lines: import("@/types/boq").BoqLine[] } | null>(null);

  const [customerDocs, setCustomerDocs] = useState<CustomerDocument[]>(initialCustomerDocuments);
  const [documentRequests, setDocumentRequests] = useState<QuotationDocumentRequest[]>(initialDocumentRequests);
  const [deliveryDocuments, setDeliveryDocuments] = useState<QuotationDeliveryDocument[]>(initialDeliveryDocuments);
  const [documentTemplateCatalog, setDocumentTemplateCatalog] = useState<QuotationDocumentTemplateCatalog>(
    initialDocumentTemplateCatalog || {
      requests: DOCUMENT_REQUEST_TEMPLATES,
      deliveries: QUOTATION_DELIVERY_DOCUMENT_TEMPLATES,
      warranties: WARRANTY_DISCLOSURE_TEMPLATES,
    },
  );
  const [isDocumentTemplateEditorOpen, setIsDocumentTemplateEditorOpen] = useState(false);
  const [customDocumentName, setCustomDocumentName] = useState("");
  const [activeDocument, setActiveDocument] = useState<CustomerDocument | null>(null);
  const [hasJobTicket, setHasJobTicket] = useState(initialHasJobTicket);
  const [activeTab, setActiveTab] = useState<SalesWorkspaceTabId>("overview");
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  useEffect(() => {
    if (!isAuditOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAuditOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuditOpen]);

  const [paymentRequestsList, setPaymentRequestsList] = useState<PaymentRequest[]>(
    initialPaymentRequests || []
  );
  const [prAmount, setPrAmount] = useState<string>("");
  const [prTitle, setPrTitle] = useState<string>("เงินมัดจำงวดที่ 1");
  const [prPreset, setPrPreset] = useState<"10" | "30" | "custom">("custom");
  const [prPaymentType, setPrPaymentType] = useState<"FULL" | "INSTALLMENT">("INSTALLMENT");
  const [prPaymentMethod, setPrPaymentMethod] = useState<"QR" | "BANK_TRANSFER">("QR");
  const [copiedPrId, setCopiedPrId] = useState<string | null>(null);
  const [copyingPaymentRequestId, setCopyingPaymentRequestId] = useState<string | null>(null);
  const [viewingSlipRequest, setViewingSlipRequest] = useState<PaymentRequest | null>(null);
  const [invoiceModalPr, setInvoiceModalPr] = useState<PaymentRequest | null>(null);
  const [receiptModalPr, setReceiptModalPr] = useState<PaymentRequest | null>(null);
  const [isUploadingSlipPrId, setIsUploadingSlipPrId] = useState<string | null>(null);

  const handleAdminUploadSlip = async (paymentRequestId: string, file: File) => {
    setIsUploadingSlipPrId(paymentRequestId);
    const formData = new FormData();
    formData.set("file", file);
    const result = await processPaymentRequestSlipAction(paymentRequestId, formData);
    setIsUploadingSlipPrId(null);
    if (!result.success || !result.paymentRequestId) {
      toast.error(result.error || "Failed to upload payment slip");
      return;
    }
    toast.success("อัปโหลดสลิปเรียบร้อยแล้ว");
    setPaymentRequestsList((current) =>
      current.map((req) =>
        req.id === result.paymentRequestId
          ? {
              ...req,
              status: "AWAITING_VERIFICATION" as const,
            }
          : req
      )
    );
  };
  const [copiedMagicLink, setCopiedMagicLink] = useState(false);
  const [dispatchMagicLink, setDispatchMagicLink] = useState<string | null>(null);
  const [portalLinkExpiryDays, setPortalLinkExpiryDays] = useState<1 | 7 | 14 | 30 | 90>(14);
  const [portalLinkDestination, setPortalLinkDestination] = useState<"public" | "local">("public");
  const [savedPortalLink, setSavedPortalLink] = useState<string | null>(null);
  const [savedPortalLinkExpiresAt, setSavedPortalLinkExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !record?.id) return;
    let cancelled = false;
    let storedLink: { link: string; expiresAt: string } | null = null;
    try {
      const stored = localStorage.getItem(`sd_portal_link_${record.id}`);
      if (stored) {
        const parsed = JSON.parse(stored) as { link?: string; expiresAt?: string };
        if (parsed.link && parsed.expiresAt) {
          storedLink = { link: parsed.link, expiresAt: parsed.expiresAt };
        }
      }
    } catch {}

    if (storedLink) {
      queueMicrotask(() => {
        if (cancelled || !storedLink) return;
        setSavedPortalLink(storedLink.link);
        setSavedPortalLinkExpiresAt(storedLink.expiresAt);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [record?.id]);
  const hasCompletedQuotation = deliveryDocuments.some((document) => (
    document.deliveryType === "FINAL_QUOTATION" && document.status === "READY" && Boolean(document.fileUrl)
  ));
  const finalQuotation = deliveryDocuments.find((doc) => doc.deliveryType === "FINAL_QUOTATION");
  const signedContractDocument = deliveryDocuments.find((doc) => doc.deliveryType === "SIGNED_CONTRACT");
  const hasClientApproval = Boolean(record.signedAt) || ["SIGNED", "VERIFIED_IN_PROGRESS", "FULLY_SIGNED", "PAID"].includes(record.status.toUpperCase());
  const erpQuotationCreated = Boolean(record.erpnextQuotationId);
  const technicalProfile = useMemo(() => getTechnicalProfile(record), [record]);
  const lifecycle = useMemo(() => getLifecycleState(record, locale), [record, locale]);
  const customerRevisionRequests = useMemo(
    () => getCustomerRevisionRequests(record.configurationData),
    [record.configurationData],
  );
  const latestCustomerRevisionRequest = customerRevisionRequests.at(-1) ?? null;
  const activeDocumentPreviewUrl = activeDocument
    ? getAdminDocumentPreviewUrl(record.id, activeDocument)
    : "";
  const activeDocumentDownloadUrl = activeDocument
    ? getAdminDocumentPreviewUrl(record.id, activeDocument, true)
    : "";
  const activeDocumentPreviewKind = activeDocument
    ? getDocumentPreviewKind(activeDocument)
    : "unknown";
  const viewingSlipPreviewUrl = viewingSlipRequest && (viewingSlipRequest.slipImageUrl || viewingSlipRequest.slipUrl)
    ? getAdminDocumentPreviewUrl(record.id, {
      id: `payment-slip-${viewingSlipRequest.id}`,
      name: `Payment slip ${viewingSlipRequest.title}`,
      url: viewingSlipRequest.slipImageUrl || viewingSlipRequest.slipUrl || "",
      verified: viewingSlipRequest.status === "PAID",
      sizeBytes: null,
      mimeType: "image/*",
      canVerify: false,
    })
    : "";
  const erpQuotationUrl = record.erpnextQuotationId && erpnextBaseUrl
    ? `${erpnextBaseUrl.replace(/\/$/, "")}/app/quotation/${encodeURIComponent(record.erpnextQuotationId)}`
    : "";
  const erpCustomerUrl = record.erpnextCustomerId && erpnextBaseUrl
    ? `${erpnextBaseUrl.replace(/\/$/, "")}/app/customer/${encodeURIComponent(record.erpnextCustomerId)}`
    : "";
  const erpSync = asRecord(record.configurationData.erpSync);
  const baseBundleItemCode = asString(record.configurationData.productBundleItemCode)
    || asString(record.configurationData.bundleItemCode)
    || asString(record.configurationData.basePackageItemCode)
    || asString(record.configurationData.erpnextBundleItemCode)
    || asString(record.raw?.productBundleItemCode)
    || null;
  const erpSyncStatus = asString(erpSync.status) || (record.erpnextQuotationId ? "SYNCED" : "NOT CREATED");
  const erpSyncError = asString(erpSync.error || erpSync.quotationLostSyncError);
  const erpSyncUpdatedAt = asString(erpSync.updatedAt);
  const erpSyncIsHealthy = Boolean(record.erpnextQuotationId) && !/(FAILED|PENDING|ERROR)/i.test(erpSyncStatus);
  const erpnextIntegration: ErpnextIntegrationData = {
    erpCustomerId: record.erpnextCustomerId || null,
    erpQuotationId: record.erpnextQuotationId || null,
    customerUrl: erpCustomerUrl || null,
    quotationUrl: erpQuotationUrl || null,
    syncState: erpSyncStatus,
    syncUpdatedAt: erpSyncUpdatedAt || null,
    syncError: erpSyncError || null,
    isSynced: erpSyncIsHealthy,
    customerBindingState: erpCustomerState,
    customerBindingMessage: erpCustomerMessage || null,
    customerCandidates: erpCustomerCandidates,
  };
  const quotationSnapshot = useQuotation(record.type === "PROPOSAL" ? record.id : null);

  const selectPreset = (preset: "10" | "30" | "custom") => {
    setPrPreset(preset);
    if (preset === "10") {
      const val = Math.round(totalValue * 0.1);
      setPrAmount(val.toString());
      setPrTitle("เงินมัดจำงวดแรก (10%)");
    } else if (preset === "30") {
      const val = Math.round(totalValue * 0.3);
      setPrAmount(val.toString());
      setPrTitle("เงินมัดจำงวดแรก (30%)");
    } else {
      setPrAmount("");
      setPrTitle("เงินมัดจำงวดที่ 1");
    }
  };

  const selectPaymentType = (paymentType: "FULL" | "INSTALLMENT") => {
    setPrPaymentType(paymentType);
    if (paymentType === "FULL") {
      setPrAmount(totalValue.toFixed(2));
      setPrTitle("ชำระเต็มจำนวน");
      setPrPreset("custom");
    } else {
      setPrAmount("");
      setPrTitle("เงินมัดจำงวดที่ 1");
      setPrPreset("custom");
    }
  };

  const handleGeneratePaymentRequest = async () => {
    const amount = Number(prAmount);
    if (!amount || amount <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      return;
    }
    if (!prTitle.trim()) {
      toast.error("กรุณาระบุชื่อเรียกงวดชำระเงิน");
      return;
    }

    setBusyAction("generate-payment-request");
    const result = await generatePaymentRequestAction(record.id, amount, prTitle, {
      paymentType: prPaymentType,
      paymentMethod: prPaymentMethod,
    });
    if (result.success && result.paymentRequest) {
	      const mappedPr = {
	        id: result.paymentRequest.id,
	        proposalId: result.paymentRequest.proposalId,
	        title: result.paymentRequest.title,
	        amountRequested: Number(result.paymentRequest.amountRequested),
	        paymentType: result.paymentRequest.paymentType as PaymentRequest["paymentType"],
	        paymentMethod: result.paymentRequest.paymentMethod as PaymentRequest["paymentMethod"],
	        status: result.paymentRequest.status as PaymentRequest["status"],
	        slipUrl: result.paymentRequest.slipUrl,
	        slipImageUrl: result.paymentRequest.slipImageUrl,
	        verifiedBy: result.paymentRequest.verifiedBy,
	        verifiedAt: result.paymentRequest.verifiedAt?.toISOString() || null,
	        easySlipData: asRecord(result.paymentRequest.easySlipData) as EasySlipData,
	      };
      setPaymentRequestsList((current) => [mappedPr, ...current]);
      toast.success("สร้างลิงก์ชำระเงินสำเร็จแล้ว!");
      setPrAmount("");
      setPrTitle("เงินมัดจำงวดที่ 1");
      setPrPreset("custom");
      setPrPaymentType("INSTALLMENT");
      setPrPaymentMethod("QR");
    } else {
      toast.error(result.error || "ไม่สามารถสร้างลิงก์ชำระเงินได้");
    }
    setBusyAction(null);
  };

  const handleVerifyPaymentSlip = async (
    paymentRequestId: string,
    decision: "APPROVE" | "REJECT",
  ) => {
    setBusyAction(`verify-payment-${paymentRequestId}-${decision}`);
    const result = await verifyClientPaymentSlipAction(paymentRequestId, decision);
    if (!result.success || !result.paymentRequest) {
      toast.error(result.error || "Failed to verify payment slip");
      setBusyAction(null);
      return;
    }

    setPaymentRequestsList((current) => current.map((request) => (
      request.id === result.paymentRequest.id
        ? {
          ...request,
          status: result.paymentRequest.status as PaymentRequest["status"],
          slipUrl: result.paymentRequest.slipUrl,
          slipImageUrl: result.paymentRequest.slipImageUrl,
          verifiedBy: result.paymentRequest.verifiedBy,
          verifiedAt: result.paymentRequest.verifiedAt?.toISOString() || null,
          easySlipData: (result.paymentRequest.easySlipData as EasySlipData | null) || null,
        }
        : request
    )));
    setViewingSlipRequest((current) => (
      current?.id === result.paymentRequest.id
        ? {
          ...current,
          status: result.paymentRequest.status as PaymentRequest["status"],
          slipUrl: result.paymentRequest.slipUrl,
          slipImageUrl: result.paymentRequest.slipImageUrl,
          verifiedBy: result.paymentRequest.verifiedBy,
          verifiedAt: result.paymentRequest.verifiedAt?.toISOString() || null,
          easySlipData: (result.paymentRequest.easySlipData as EasySlipData | null) || null,
        }
        : current
    ));
    toast.success(decision === "APPROVE" ? "Payment slip verified" : "Payment slip rejected");
    setBusyAction(null);
  };

  const handleCopyLink = async (prId: string) => {
    setCopyingPaymentRequestId(prId);
    try {
      const response = await fetch(`/api/admin/proposals/${encodeURIComponent(record.id)}/portal-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Issue a dedicated guest capability without invalidating a previously delivered link.
        body: JSON.stringify({ action: "ISSUE", expiresInDays: 14 }),
      });
      const payload = await response.json() as { success?: boolean; token?: string; expiresAt?: string; error?: string };
      if (!response.ok || !payload.success || !payload.token) {
        throw new Error(payload.error || "Unable to issue a secure payment link.");
      }

      const linkUrl = new URL("/api/auth/verify-guest", getBrowserPublicOrigin());
      linkUrl.searchParams.set("mode", "proposal");
      linkUrl.searchParams.set("locale", locale || "th");
      linkUrl.searchParams.set("proposalId", record.id);
      linkUrl.searchParams.set("token", payload.token);
      const link = linkUrl.toString();
      const expiresAt = payload.expiresAt || getDefaultPortalLinkExpiry();
      await navigator.clipboard.writeText(link);
      setSavedPortalLink(link);
      setSavedPortalLinkExpiresAt(expiresAt);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`sd_portal_link_${record.id}`, JSON.stringify({ link, expiresAt }));
        } catch {}
      }
      setCopiedPrId(prId);
      toast.success("Secure payment link copied. It can be opened in an incognito browser.");
      setTimeout(() => setCopiedPrId(null), 2000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to copy the secure payment link.");
    } finally {
      setCopyingPaymentRequestId(null);
    }
  };

	  const handleViewDocumentRequestFile = (request: QuotationDocumentRequest) => {
	    if (!request.fileUrl) return;
	    const meta = (request.metadata && typeof request.metadata === "object" ? request.metadata : {}) as Record<string, unknown>;
	    const attachmentMeta = (request.attachments?.[0]?.metadata && typeof request.attachments[0].metadata === "object" ? request.attachments[0].metadata : {}) as Record<string, unknown>;

	    const mimeType = (typeof meta.contentType === "string" && meta.contentType) ||
	                     (typeof attachmentMeta.contentType === "string" && attachmentMeta.contentType) ||
	                     null;
	    const sizeBytes = (typeof meta.byteSize === "number" ? meta.byteSize : null) ||
	                      (typeof attachmentMeta.byteSize === "number" ? attachmentMeta.byteSize : null);

	    setActiveDocument({
	      id: request.id ? `document-request-${request.id}` : request.documentName,
	      name: request.documentName,
	      url: request.fileUrl,
	      verified: request.status === "APPROVED",
	      sizeBytes,
	      mimeType,
	      canVerify: false,
	    });
	  };

	  const handleUploadDeliveryDocument = async (deliveryType: QuotationDeliveryDocumentType, file: File): Promise<boolean> => {
	    setBusyAction(`upload-delivery-${deliveryType}`);
	    const template = documentTemplateCatalog.deliveries.find((item) => item.deliveryType === deliveryType);
	    const formData = new FormData();
	    formData.set("proposal_id", record.id);
	    formData.set("delivery_type", deliveryType);
	    formData.set("title", template?.title || deliveryType);
	    formData.set("description", template?.description || "");
	    formData.set("file", file);

      try {
        const response = await fetch("/api/proposals/delivery-document-upload", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json() as {
          success: boolean;
          error?: string;
          deliveryDocument?: QuotationDeliveryDocument;
        };
        if (!response.ok || !payload.success || !payload.deliveryDocument) {
          throw new Error(payload.error || "Failed to upload delivery document.");
        }

	        setDeliveryDocuments((current) => {
	          const exists = current.some((item) => item.deliveryType === payload.deliveryDocument?.deliveryType);
	          return exists
	            ? current.map((item) => item.deliveryType === payload.deliveryDocument?.deliveryType ? payload.deliveryDocument : item)
	            : [payload.deliveryDocument, ...current].filter(Boolean) as QuotationDeliveryDocument[];
	        });
	        const deliveryMetadata = asRecord(payload.deliveryDocument.metadata);
	        if (asString(deliveryMetadata.quotationFolderUrl)) {
	          setRecord((current) => {
	            const currentDriveConfig = asRecord(current.configurationData.quotationDeliveryDrive);
	            return {
	              ...current,
	              configurationData: {
	                ...current.configurationData,
	                quotationDeliveryDrive: {
	                  ...currentDriveConfig,
	                  userFolderId: asString(deliveryMetadata.userFolderId) || currentDriveConfig.userFolderId,
	                  userFolderUrl: asString(deliveryMetadata.userFolderUrl) || currentDriveConfig.userFolderUrl,
	                  quotationFolderId: asString(deliveryMetadata.quotationFolderId) || currentDriveConfig.quotationFolderId,
	                  quotationFolderUrl: asString(deliveryMetadata.quotationFolderUrl),
	                  archiveFolderId: asString(deliveryMetadata.archiveFolderId) || currentDriveConfig.archiveFolderId,
	                  archiveFolderUrl: asString(deliveryMetadata.archiveFolderUrl) || currentDriveConfig.archiveFolderUrl,
	                },
	              },
	            };
	          });
	        }
	        toast.success(`${template?.title || "Delivery document"} uploaded.`);
	        return true;
	      } catch (error: unknown) {
	        toast.error(error instanceof Error ? error.message : "Failed to upload delivery document.");
	        return false;
	      } finally {
	        setBusyAction(null);
	      }
	  };

	  const handleArchiveDeliveryDocument = async (document: QuotationDeliveryDocument) => {
	    if (!document.id) {
	      toast.error("This delivery document cannot be archived yet.");
	      return false;
	    }

	    setBusyAction(`archive-delivery-${document.id}`);
	    try {
	      const response = await fetch(
	        `/api/proposals/delivery-documents/${encodeURIComponent(document.id)}/archive`,
	        { method: "POST" },
	      );
	      const payload = await response.json() as {
	        success: boolean;
	        error?: string;
	        deliveryDocument?: QuotationDeliveryDocument;
	      };
	      if (!response.ok || !payload.success || !payload.deliveryDocument) {
	        throw new Error(payload.error || "Failed to archive delivery document.");
	      }

	      setDeliveryDocuments((current) => current.filter((item) => item.id !== document.id));
	      toast.success(`${document.title} moved to Archive.`);
	      return true;
	    } catch (error: unknown) {
	      toast.error(error instanceof Error ? error.message : "Failed to archive delivery document.");
	      return false;
	    } finally {
	      setBusyAction(null);
	    }
	  };

	  const handleVerifyDocumentRequest = async (
	    request: QuotationDocumentRequest,
	    decision: "APPROVE" | "REJECT",
	  ) => {
	    if (!request.id) {
	      toast.error("Save this document request before verification.");
	      return;
	    }

	    setBusyAction(`verify-doc-request-${request.id}-${decision}`);
	    const result = await verifyQuotationDocumentRequestAction(record.id, request.id, decision);
	    if (!result.success || !result.request) {
	      toast.error(result.error || "Failed to verify customer document.");
	      setBusyAction(null);
	      return;
	    }

	    const nextStatus = result.request.status as QuotationDocumentRequestStatus;
	    setDocumentRequests((current) => current.map((item) => (
	      item.id === result.request.id
	        ? {
	          ...item,
	          status: nextStatus,
	          fileUrl: result.request.fileUrl,
	        }
	        : item
	    )));
	    setCustomerDocs((current) => current.map((document) => (
	      document.id === `document-request-${result.request.id}`
	        ? { ...document, verified: nextStatus === "APPROVED" }
	        : document
	    )));
	    toast.success(decision === "APPROVE" ? "Customer document approved." : "Document returned for re-upload.");
	    setBusyAction(null);
	  };

  const handleToggleVerification = async (docId: string, currentVerified: boolean) => {
    setBusyAction(`verify-${docId}`);
    const nextStatus = !currentVerified;
    const result = await toggleCustomerDocumentVerificationAction(record.id, docId, nextStatus);
    if (result.success && result.documents) {
      setCustomerDocs((current) => current.map((document) => {
        const updated = result.documents?.find((candidate) => candidate.id === document.id);
        return updated ? { ...document, verified: updated.verified } : document;
      }));
      toast.success("Document verification state updated.");
    } else {
      toast.error(result.error || "Failed to toggle document verification.");
    }
    setBusyAction(null);
  };

  const addDocumentRequest = (templateOrName: DocumentRequestTemplateConfig | string) => {
    const documentName = normalizeDocumentRequestName(typeof templateOrName === "string" ? templateOrName : templateOrName.documentName);
    if (!documentName) {
      toast.error("กรุณาระบุชื่อเอกสาร");
      return;
    }

    const exists = documentRequests.some((request) =>
      normalizeDocumentRequestName(request.documentName).toLocaleLowerCase("th-TH") ===
      documentName.toLocaleLowerCase("th-TH")
    );

    if (exists) {
      toast.warning("มีรายการเอกสารนี้อยู่แล้ว");
      return;
    }

    const template = typeof templateOrName === "string"
      ? documentTemplateCatalog.requests.find((item) => item.documentName === documentName) || getDocumentRequestTemplateByName(documentName)
      : templateOrName;

    setDocumentRequests((current) => [
      ...current,
      {
        documentName,
        descriptionHint: template?.descriptionHint || null,
        requestType: template?.requestType || "FILE",
        isRequired: true,
        status: "PENDING",
        fileUrl: null,
      },
    ]);
    setCustomDocumentName("");
  };

  const handleSaveDocumentTemplateCatalog = async (catalog: QuotationDocumentTemplateCatalog) => {
    const result = await saveQuotationDocumentTemplateCatalog(catalog);
    if (!result.success || !result.catalog) {
      toast.error(result.error || "Failed to save document templates.");
      return;
    }
    setDocumentTemplateCatalog(result.catalog);
    setIsDocumentTemplateEditorOpen(false);
    toast.success("Document templates saved.");
  };

  const toggleDocumentRequestRequired = (index: number) => {
    setDocumentRequests((current) => current.map((request, requestIndex) =>
      requestIndex === index ? { ...request, isRequired: !request.isRequired } : request
    ));
  };

  const removeDocumentRequest = (index: number) => {
    setDocumentRequests((current) => current.filter((_, requestIndex) => requestIndex !== index));
  };

  const persistDocumentRequests = async () => {
    const result = await saveQuotationDocumentRequests(record.id, documentRequests.map((request) => ({
      id: request.id,
      documentName: request.documentName,
      descriptionHint: request.descriptionHint || null,
      requestType: request.requestType || "FILE",
      isRequired: request.isRequired,
      metadata: request.metadata,
    })));

    if (!result.success) {
      return { success: false as const, error: result.error || "Failed to save document requests." };
    }

    setDocumentRequests((result.requests || []).map((request) => ({
      id: request.id,
      documentName: request.documentName,
      descriptionHint: request.descriptionHint,
      requestType: request.requestType as DocumentRequestType,
      isRequired: request.isRequired,
      status: request.status as QuotationDocumentRequestStatus,
      fileUrl: request.fileUrl,
      metadata: request.metadata,
    })));

    return { success: true as const };
  };

  const handleUpdateCustomerDocumentRequests = async () => {
    setBusyAction("update-document-requests");
    try {
      const result = await persistDocumentRequests();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer document checklist updated.");
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  };

  const handleHandoverQuotation = async () => {
    setBusyAction("handover");
    const result = await approveAndCreateJobTicketAction(record.id);
    if (result.success && result.ticket) {
      setRecord((prev) => ({
        ...prev,
        status: "SIGNED",
      }));
      setHasJobTicket(true);
      toast.success("Quotation confirmed and Job Ticket generated.");
      router.refresh();
    } else {
      toast.error(result.error || "Quotation handover failed.");
    }
    setBusyAction(null);
  };

  const handleConfirmSignedContract = async () => {
    if (record.type !== "PROPOSAL") return;
    setBusyAction("confirm-signed-contract");
    setStatusMsg("");
    const result = await confirmSignedContractAndCloseDeal(record.id);
    if (result.success && result.proposal) {
      setRecord((prev) => ({
        ...prev,
        status: "FULLY_SIGNED",
        dispatchStatus: "SIGNED",
        configurationData: asRecord(result.proposal!.configurationData) as CrmRow["configurationData"],
      }));
      toast.success("ยืนยันเอกสารลงนามและปิดดีลเรียบร้อยแล้ว");
      if (result.warning) {
        toast.warning(result.warning);
      }
      router.refresh();
    } else {
      toast.error(result.error || "ไม่สามารถยืนยันเอกสารลงนามได้");
      setStatusMsg(`Error: ${result.error || "Failed to confirm signed contract."}`);
    }
    setBusyAction(null);
  };

  const handleCopyMagicLink = async () => {
    setBusyAction("portal-access");
    try {
      const response = await fetch(`/api/admin/proposals/${encodeURIComponent(record.id)}/portal-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ROTATE", expiresInDays: portalLinkExpiryDays }),
      });
      const payload = await response.json() as { success?: boolean; token?: string; expiresAt?: string; error?: string };
      if (!response.ok || !payload.success || !payload.token) {
        throw new Error(payload.error || "Unable to issue secure portal access.");
      }
      const linkUrl = new URL(
        "/api/auth/verify-guest",
        portalLinkDestination === "local" ? getLocalPortalTestOrigin() : getBrowserPublicOrigin(),
      );
      linkUrl.searchParams.set("mode", "proposal");
      linkUrl.searchParams.set("locale", locale || "th");
      linkUrl.searchParams.set("proposalId", record.id);
      linkUrl.searchParams.set("token", payload.token);
      if (portalLinkDestination === "local") linkUrl.searchParams.set("destination", "local");
      const link = linkUrl.toString();
      const expiresAt = payload.expiresAt || new Date(Date.now() + portalLinkExpiryDays * 24 * 60 * 60 * 1000).toISOString();
      await navigator.clipboard.writeText(link);
      setDispatchMagicLink(link);
      setSavedPortalLink(link);
      setSavedPortalLinkExpiresAt(expiresAt);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`sd_portal_link_${record.id}`, JSON.stringify({ link, expiresAt }));
        } catch {}
      }
      setCopiedMagicLink(true);
      toast.success(portalLinkDestination === "local" ? "คัดลอก Local Test Portal Link แล้ว" : "คัดลอก Secure Portal Link แล้ว");
      setTimeout(() => setCopiedMagicLink(false), 1800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to copy secure portal link.");
    } finally {
      setBusyAction(null);
    }
  };

  const lineItemsTotal = useMemo(() => lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0), [lineItems]);
  const serviceFeeTotal = useMemo(() => serviceFeeItems.reduce((sum, item) => sum + item.qty * item.basePrice, 0), [serviceFeeItems]);
  const calculatedTotal = lineItemsTotal + serviceFeeTotal;
  const fallbackTotal = Number(
    record.value ||
      record.configurationData?.totalPrice ||
      (record.raw as Record<string, unknown> | null)?.grand_total ||
      (record.raw as Record<string, unknown> | null)?.totalPrice ||
      0
  );
  const totalValue = calculatedTotal > 0 ? calculatedTotal : fallbackTotal;
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return availableProducts.filter((product) => {
      if (!query) return true;
      return [product.brand, product.model, product.categoryName || "", product.id]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [availableProducts, productSearch]);
  const availableServiceFeeOptions = useMemo(() => {
    return availableServiceFees.filter((fee) => !serviceFeeItems.some((item) => item.serviceFeeId === fee.id));
  }, [availableServiceFees, serviceFeeItems]);
  const filteredServiceFeeOptions = useMemo(() => {
    const query = serviceFeeSearch.trim().toLowerCase();
    if (!query) return availableServiceFeeOptions;

    return availableServiceFeeOptions.filter((fee) => {
      return [fee.name, fee.erpItemCode, String(fee.basePrice)]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [availableServiceFeeOptions, serviceFeeSearch]);
  const proposalRecord = record.type === "PROPOSAL";
  const liveTotalLabel = formatThb(totalValue);
  const pendingEvaluation = record.status.toUpperCase() === "PENDING_EVALUATION" || asRecord(record.configurationData).pendingEvaluation === true;
  const requiresInstallation = record.fulfillmentType === FULFILLMENT_INSTALLATION || record.configurationData?.requiresInstallation === true;
  const canSendForApproval =
    proposalRecord &&
    requiresInstallation &&
    !["CANCELLED", "LOST", "FULLY_PAID"].includes(record.status.toUpperCase());
  const isSendToCustomerActive =
    proposalRecord &&
    !["CANCELLED", "LOST", "FULLY_PAID"].includes(record.status.toUpperCase());
  const canStartCustomerRequestedRevision =
    proposalRecord &&
    record.status.toUpperCase() === "REVISION_REQUESTED" &&
    Boolean(record.erpnextQuotationId) &&
    record.paymentStatus === "Unpaid";

  const workspaceCopy = useMemo(() => getSalesWorkspaceCopy(locale), [locale]);
  const requiredDocumentRequests = useMemo(
    () => documentRequests.filter((request) => request.isRequired),
    [documentRequests],
  );
  const approvedRequiredDocumentCount = requiredDocumentRequests.filter(
    (request) => request.status === "APPROVED",
  ).length;
  const hasRequiredDocuments =
    requiredDocumentRequests.length === 0 ||
    approvedRequiredDocumentCount === requiredDocumentRequests.length;
  const hasVerifiedPaymentRequest = paymentRequestsList.some((request) => request.status === "PAID");
  const hasPaymentComplete =
    record.paymentStatus === "Paid 100%" ||
    (paymentRequestsList.length > 0 && paymentRequestsList.every((request) => request.status === "PAID"));
  const hasDeposit =
    record.paymentStatus === "Deposit Paid" ||
    record.paymentStatus === "Paid 100%" ||
    hasVerifiedPaymentRequest;
  const hasTechnicalDesign =
    lineItems.length > 0 ||
    Boolean(record.systemSizeKwp || record.panelCount || record.erpnextQuotationId);
  const hasAgreedPrice = Number.isFinite(totalValue) && totalValue > 0;
  const salesWorkspaceState = deriveSalesWorkspaceState({
    record,
    lineItemCount: lineItems.length,
    hasSite: Boolean(record.location || record.installationMapAddress || asRecord(record.configurationData).siteLocation),
    hasTechnicalDesign,
    hasAgreedPrice,
    hasPortalLink: Boolean(savedPortalLink),
    hasSentToCustomer: lifecycle.isSentToCustomer || /PENDING_CUSTOMER|AWAITING_CLIENT_SIGNATURE/i.test(record.status),
    hasClientApproval,
    hasRequiredDocuments,
    requiredDocumentCount: requiredDocumentRequests.length,
    approvedDocumentCount: approvedRequiredDocumentCount,
    hasDeposit,
    hasPaymentComplete,
    hasInstallationProject: hasJobTicket,
    hasCustomerErpBinding: Boolean(record.erpnextCustomerId || erpCustomerState === "LINKED"),
  });

  const updateLineItem = (key: string, patch: Partial<RevisionLineItem>) => {
    setLineItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const markThumbnailBroken = (key: string) => {
    setBrokenThumbnails((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const markProductThumbnailBroken = (key: string) => {
    setBrokenProductThumbnails((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const removeLineItem = (key: string) => {
    setLineItems((prev) => prev.filter((item) => item.key !== key));
  };

  const openConfirmAction = (action: ConfirmActionState) => {
    if (busyAction) return;
    setConfirmAction(action);
  };

  const closeConfirmAction = () => {
    if (busyAction) return;
    setConfirmAction(null);
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;

    const action = confirmAction;
    setConfirmAction(null);

    switch (action.kind) {
      case "generate-quotation":
        await handleGenerateQuotation();
        return;
      case "create-erp-customer-and-generate":
        await handleCreateErpCustomerAndGenerateQuotation();
        return;
      case "send-approval":
        await handleSendForApproval();
        return;
      case "start-revision":
        await handleStartQuotationRevision();
        return;
      case "mark-lost":
        await handleMarkQuotationLost();
        return;
      case "delete-line-item":
        removeLineItem(action.key);
        setStatusMsg("Line item removed from the revision matrix.");
        return;
      default:
        return;
    }
  };

  const appendProduct = (product: ProductOption) => {
    setLineItems((prev) => [...prev, lineItemFromProduct(product, prev.length)]);
    setPickerOpen(false);
  };

  const appendServiceFee = (serviceFeeId: string) => {
    const fee = serviceFeesById.get(serviceFeeId);
    if (!fee) return;
    setServiceFeeItems((prev) => {
      if (prev.some((item) => item.serviceFeeId === serviceFeeId)) {
        return prev;
      }
      return [...prev, serviceFeeLineItemFromOption(fee, prev.length)];
    });
    setServiceFeeSearch("");
  };

  const removeServiceFee = (key: string) => {
    setServiceFeeItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleConvertLead = async () => {
    if (record.type !== "LEAD") return;
    setBusyAction("convert");
    setStatusMsg("");
    const result = await convertLeadToProposal(record.id);
    if (result.error || !result.proposal) {
      setStatusMsg(`Error: ${result.error || "Failed to convert lead."}`);
    } else {
      router.replace(`/${locale}/admin/crm/${result.proposal.id}`, { scroll: false });
      router.refresh();
    }
    setBusyAction(null);
  };



  const runQuotationGeneration = async () => {
    setBusyAction("quotation");
    setStatusMsg("");
    setDebugPayload(null);
    try {
      const result = proposalRecord
        ? await ensureErpnextQuotationSync(record.id)
        : await createErpnextQuotationFromLead(record.id);
      if (result.success) {
        setRecord((prev) => ({
          ...prev,
          erpnextQuotationId: result.quotationId || prev.erpnextQuotationId,
          erpnextCustomerId: result.customerId || prev.erpnextCustomerId,
          status: proposalRecord && prev.status === "DRAFT" ? "SENT" : prev.status,
        }));
        setStatusMsg(`ERPNext quotation generated: ${result.quotationId}`);
        router.refresh();
      } else {
        const errorMessage = "error" in result && typeof result.error === "string"
          ? result.error
          : "Failed to generate quotation.";
        setStatusMsg(`Error: ${errorMessage}`);
        if ("debugPayload" in result && result.debugPayload) {
          setDebugPayload(result.debugPayload);
        }
      }
    } catch (error) {
      setStatusMsg(`Error: ${error instanceof Error ? error.message : "Failed to generate ERPNext quotation."}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartQuotationRevision = async () => {
    setBusyAction("revision-start");
    setStatusMsg("");
    try {
      const response = await fetch(`/api/admin/quotations/${encodeURIComponent(record.id)}/revision`, { method: "POST" });
      const payload = await response.json() as { amendedFrom?: string; lines?: import("@/types/boq").BoqLine[]; reusesExistingDraft?: boolean; error?: string };
      if (!response.ok || !payload.amendedFrom || !payload.lines) throw new Error(payload.error || "Unable to start quotation revision.");
      setRevisionDraft({ amendedFrom: payload.amendedFrom, lines: payload.lines });
      if (latestCustomerRevisionRequest) {
        setRevisionNotes((current) => current.trim() || `Customer revision request (${formatRevisionRequestDate(latestCustomerRevisionRequest.requestedAt, locale)}): ${latestCustomerRevisionRequest.message}`);
      }
      setRecord((current) => ({
        ...current,
        erpnextQuotationId: payload.reusesExistingDraft ? payload.amendedFrom : null,
        status: "DRAFT",
        dispatchStatus: "PENDING_DISPATCH",
        isArchived: false,
        configurationData: {
          ...current.configurationData,
          customerApproval: {
            ...asRecord(current.configurationData.customerApproval),
            status: "REVISION_IN_PROGRESS",
          },
        },
      }));
      setActiveTab("quotation");
      setStatusMsg(
        payload.reusesExistingDraft
          ? `Editing the existing ERPNext draft ${payload.amendedFrom}.`
          : `Drafting revision based on ${payload.amendedFrom}.`,
      );
      router.refresh();
    } catch (error) {
      setStatusMsg(`Error: ${error instanceof Error ? error.message : "Unable to start quotation revision."}`);
    } finally { setBusyAction(null); }
  };

  const handleGenerateQuotation = async () => {
    if (record.erpnextCustomerId || erpCustomerState === "LINKED") {
      await runQuotationGeneration();
      return;
    }

    setBusyAction("customer-lookup");
    setStatusMsg("");
    setErpCustomerState("LOOKING_UP");
    setErpCustomerMessage("Checking ERPNext by customer email and phone…");
    setErpCustomerCandidates([]);

    try {
      const lookup = await postErpCustomerAction("LOOKUP");
      const matches = lookup.matches || [];
      if (matches.length === 1) {
        const matchedCustomer = matches[0];
        const binding = await postErpCustomerAction("BIND", matchedCustomer.id);
        setRecord((current) => ({ ...current, erpnextCustomerId: binding.customerId || matchedCustomer.id }));
        setErpCustomerState("LINKED");
        setErpCustomerMessage(`Linked to ${binding.customerId || matchedCustomer.id}.`);
        setBusyAction(null);
        await runQuotationGeneration();
        return;
      }

      if (matches.length === 0) {
        setErpCustomerState("NO_MATCH");
        setErpCustomerMessage("No exact ERPNext customer match was found.");
        setBusyAction(null);
        openConfirmAction({
          kind: "create-erp-customer-and-generate",
          title: "Customer Record Not Found in ERPNext",
          message: `No existing contract or customer record was found for ${record.customerName}${record.email ? ` (${record.email})` : ""}. Would you like to create a new Customer profile in ERPNext before generating the quotation?`,
          confirmLabel: "Create Customer & Proceed",
          intent: "primary",
        });
        return;
      }

      setErpCustomerCandidates(matches);
      setErpCustomerState("CONFLICT");
      setErpCustomerMessage("Multiple ERPNext customers match this contact. Select the verified customer before continuing.");
      toast.error("Multiple ERPNext customers matched this contact. Select one to continue.");
    } catch (error) {
      setErpCustomerState("ERROR");
      const message = error instanceof Error ? error.message : "ERPNext customer lookup failed.";
      setErpCustomerMessage(message);
      setStatusMsg(`Error: ${message}`);
      toast.error(message);
    } finally {
      setBusyAction((current) => current === "customer-lookup" ? null : current);
    }
  };

  const handleCreateErpCustomerAndGenerateQuotation = async () => {
    setBusyAction("customer-create");
    setErpCustomerState("LOOKING_UP");
    setErpCustomerMessage("Creating and binding the ERPNext customer…");

    try {
      const payload = await postErpCustomerAction("CREATE");
      const customerId = payload.customerId || "";
      if (!customerId) throw new Error("ERPNext did not return a Customer ID.");

      setRecord((current) => ({ ...current, erpnextCustomerId: customerId }));
      setErpCustomerState("LINKED");
      setErpCustomerMessage(`Linked to ${customerId}.`);
      setBusyAction(null);
      await runQuotationGeneration();
    } catch (error) {
      setErpCustomerState("ERROR");
      const message = error instanceof Error ? error.message : "Unable to create the ERPNext customer.";
      setErpCustomerMessage(message);
      setStatusMsg(`Error: ${message}`);
      toast.error(message);
    } finally {
      setBusyAction((current) => current === "customer-create" ? null : current);
    }
  };

  const postErpCustomerAction = async (action: "LOOKUP" | "CREATE" | "BIND", customerId?: string) => {
    const response = await fetch(`/api/admin/proposals/${encodeURIComponent(record.id)}/erp-customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordType: record.type,
        recordId: record.id,
        action,
        ...(customerId ? { customerId } : {}),
      }),
    });
    const payload = await response.json() as {
      success?: boolean;
      error?: string;
      customerId?: string | null;
      matches?: ErpnextCustomerCandidate[];
    };
    if (!response.ok || !payload.success) {
      const error = new Error(payload.error || "ERPNext customer request failed.");
      Object.assign(error, { matches: payload.matches });
      throw error;
    }
    return payload;
  };

  const handleLookupErpCustomer = async () => {
    setErpCustomerState("LOOKING_UP");
    setErpCustomerMessage("Checking ERPNext by customer email and phone…");
    setErpCustomerCandidates([]);
    try {
      const lookup = await postErpCustomerAction("LOOKUP");
      const matches = lookup.matches || [];
      if (matches.length === 0) {
        setErpCustomerState("NO_MATCH");
        setErpCustomerMessage("No exact ERPNext customer match was found.");
        return;
      }
      if (matches.length > 0) {
        setErpCustomerCandidates(matches);
        setErpCustomerState("CONFLICT");
        setErpCustomerMessage("Select the verified ERPNext customer to bind. Name-only matches are never bound automatically.");
        return;
      }
    } catch (error) {
      const matches = (error as { matches?: ErpnextCustomerCandidate[] }).matches;
      if (Array.isArray(matches) && matches.length > 0) setErpCustomerCandidates(matches);
      setErpCustomerState(Array.isArray(matches) && matches.length > 0 ? "CONFLICT" : "ERROR");
      setErpCustomerMessage(error instanceof Error ? error.message : "ERPNext customer lookup failed.");
    }
  };

  const handleBindErpCustomer = async (candidate: ErpnextCustomerCandidate) => {
    setErpCustomerState("LOOKING_UP");
    setErpCustomerMessage(`Binding ${candidate.id}…`);
    try {
      const payload = await postErpCustomerAction("BIND", candidate.id);
      setRecord((current) => ({ ...current, erpnextCustomerId: payload.customerId || candidate.id }));
      setErpCustomerCandidates([]);
      setErpCustomerState("LINKED");
      setErpCustomerMessage(`Linked to ${payload.customerId || candidate.id}.`);
      toast.success("ERPNext customer linked.");
    } catch (error) {
      setErpCustomerState("ERROR");
      setErpCustomerMessage(error instanceof Error ? error.message : "Unable to bind ERPNext customer.");
    }
  };

  const handleCreateErpCustomer = async () => {
    setErpCustomerState("LOOKING_UP");
    setErpCustomerMessage("Creating and binding the ERPNext customer…");
    try {
      const payload = await postErpCustomerAction("CREATE");
      setRecord((current) => ({ ...current, erpnextCustomerId: payload.customerId || current.erpnextCustomerId }));
      setErpCustomerState("LINKED");
      setErpCustomerMessage(`Linked to ${payload.customerId}.`);
      toast.success("ERPNext customer linked.");
    } catch (error) {
      setErpCustomerState("ERROR");
      setErpCustomerMessage(error instanceof Error ? error.message : "Unable to create ERPNext customer.");
    }
  };

  const handleSendForApproval = async () => {
    if (!proposalRecord || !canSendForApproval) return;
    setBusyAction("send-approval");
    setStatusMsg("");

    const result = await sendQuotationForCustomerApproval(record.id);
    if (result.success) {
      setRecord((prev) => ({
        ...prev,
        status: "PENDING_CUSTOMER_SIGNATURE",
        configurationData: {
          ...prev.configurationData,
          customerApproval: {
            ...(asRecord(prev.configurationData?.customerApproval)),
            status: "PENDING_CUSTOMER_SIGNATURE",
            documentNo: result.documentNo,
          },
        },
      }));
      setStatusMsg(t("status.sentForApproval", { id: result.documentNo || record.id }));
      router.refresh();
    } else {
      setStatusMsg(`Error: ${result.error || "Failed to send quotation for approval."}`);
    }

    setBusyAction(null);
  };

  const handleRevisionSave = async () => {
    if (!proposalRecord) return;
    setBusyAction("revision");
    setStatusMsg("");
    const itemsPayload = lineItems.map((item) => ({
      productId: item.productId,
      item_code: item.item_code,
      brand: item.brand || undefined,
      model: item.model || undefined,
      description: item.description || undefined,
      qty: item.qty,
      rate: item.unitPrice,
      amount: item.qty * item.unitPrice,
    }));

    const serviceFeesPayload = serviceFeeItems.map((item) => ({
      serviceFeeId: item.serviceFeeId || undefined,
      name: item.name,
      erpItemCode: item.erpItemCode,
      basePrice: item.basePrice,
      qty: item.qty,
      rate: item.basePrice,
      amount: item.qty * item.basePrice,
    }));

    const result = await updateRevisionMatrix(record.id, {
      items: itemsPayload,
      serviceFees: serviceFeesPayload,
      totalPrice: totalValue,
      notes: revisionNotes || null,
    });
    if (result.error) {
      setStatusMsg(`Error: ${result.error}`);
    } else {
      const nextConfig = asRecord(record.configurationData);
      const existingHistory = Array.isArray(nextConfig.revisionMatrixHistory) ? nextConfig.revisionMatrixHistory : [];
      setRecord((prev) => ({
        ...prev,
        value: totalValue,
        valueLabel: liveTotalLabel,
        configurationData: {
          ...prev.configurationData,
          items: itemsPayload,
          serviceFees: serviceFeesPayload,
          totalPrice: totalValue,
          revisionMatrixHistory: existingHistory,
        },
      }));
      setStatusMsg("Revision matrix saved.");
      router.refresh();
    }
    setBusyAction(null);
  };



  const handleSendToCustomer = async () => {
    if (!proposalRecord) return;
    setBusyAction("send-to-customer");
    setStatusMsg("");
    try {
      const documentRequestResult = await persistDocumentRequests();
      if (!documentRequestResult.success) {
        toast.error(documentRequestResult.error);
        setStatusMsg(`Error: ${documentRequestResult.error}`);
        return;
      }

      const result = await sendQuotationToCustomer(record.id);
      if (result.success && result.proposal) {
        setRecord((prev) => ({
          ...prev,
          status: result.proposal!.status,
          configurationData: asRecord(result.proposal!.configurationData) as CrmRow["configurationData"],
        }));
        toast.success(t("toast.sentToCustomer"));
        router.refresh();
      } else {
        toast.error(result.error || t("toast.sendToCustomerFailed"));
        setStatusMsg(`Error: ${result.error || "Failed to send quotation to customer."}`);
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t("toast.sendToCustomerError"));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDispatchForSigningWithConfig = async (config: DispatchConfig) => {
    if (!proposalRecord) return;

    setBusyAction("dispatch-signing");
    try {
      const result = await dispatchQuotationForSigning(record.id, record.wizardLeadId, config);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setDispatchMagicLink(result.magicLink);
      setRecord((current) => ({
        ...current,
        dispatchStatus: result.dispatchStatus,
        status: "AWAITING_CLIENT_SIGNATURE",
      }));
      setIsDispatchModalOpen(false);
      try {
        await navigator.clipboard.writeText(result.magicLink);
        toast.success("Signing link configured, prepared and copied.");
      } catch {
        toast.success("Signing link configured and prepared. Copy it from the documents panel.");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the signing link.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleApproveRevision = async () => {
    if (!proposalRecord) return;
    setBusyAction("approve");
    setStatusMsg("");
    const result = await approveProposalRevision(record.id);
    if (result.error) {
      setStatusMsg(`Error: ${result.error}`);
    } else {
      setRecord((prev) => ({ ...prev, status: "SIGNED" }));
      setStatusMsg("Revision approved.");
      router.refresh();
    }
    setBusyAction(null);
  };

  const handleCancelQuotation = async () => {
    setCancelingQuotation(true);
    setStatusMsg("");
    try {
      const result = await cancelQuotationChain(record.id);
      if (!result.success) {
        setStatusMsg(`Error: ${result.error || "Unable to cancel quotation."}`);
      } else {
        setRecord((prev) => ({ ...prev, status: "CANCELLED", isArchived: true }));
        setStatusMsg("Quotation cancelled successfully.");
        setIsCancelModalOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to cancel quotation.";
      setStatusMsg(`Error: ${message}`);
    } finally {
setCancelingQuotation(false);
    }
  };

  const handleMarkQuotationLost = async () => {
    if (!proposalRecord) return;

    setMarkingLost(true);
    setStatusMsg("");
    try {
      const result = await markQuotationLostChain(record.id);
      if (!result.success) {
        const message = result.error || "Unable to mark quotation as lost.";
        setStatusMsg(`Error: ${message}`);
        toast.error(message);
        return;
      }

      setRecord((previous) => ({
        ...previous,
        status: "LOST",
        configurationData: result.proposal?.configurationData as CrmRow["configurationData"] ?? previous.configurationData,
      }));
      const message = result.warning || "Quotation marked as lost and ERPNext has been updated.";
      setStatusMsg(message);
      toast.success(message);
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to mark quotation as lost.";
      setStatusMsg(`Error: ${message}`);
      toast.error(message);
    } finally {
      setMarkingLost(false);
    }
  };

  const handleWorkspaceAction = () => {
    switch (salesWorkspaceState.currentAction.action) {
      case "convert":
        void handleConvertLead();
        return;
      case "boq":
        setActiveTab("boq");
        return;
      case "quotation":
      case "sign":
        setActiveTab("quotation");
        return;
      case "payment":
        setActiveTab("payment");
        return;
      case "handoff":
        setActiveTab("handoff");
        return;
      case "none":
        return;
    }
  };

  const hasWorkspaceActionRunning = Boolean(
    busyAction && [
      "convert",
      "customer-lookup",
      "customer-create",
      "quotation",
      "send-approval",
      "portal-access",
      "handover",
      "generate-payment-request",
    ].some((action) => busyAction.includes(action)),
  );

  const internalCost = getFirstNumber(
    [asRecord(record.configurationData), asRecord(record.raw)],
    ["internalCost", "internal_cost", "boqInternalCost", "totalCost", "estimatedCost"],
  );
  const recommendedPrice = getFirstNumber(
    [asRecord(record.configurationData), asRecord(record.raw)],
    ["recommendedSellingPrice", "recommendedPrice", "suggestedSellingPrice"],
  ) ?? totalValue;
  const agreedSellingPrice = getFirstNumber(
    [asRecord(record.configurationData), asRecord(record.raw)],
    ["agreedSellingPrice", "agreedPrice", "sellingPrice", "customerAgreedPrice", "totalPrice"],
  ) ?? (record.value ?? null);
  const grossMargin = internalCost !== null && agreedSellingPrice !== null
    ? agreedSellingPrice - internalCost
    : null;
  const marginPercentage = internalCost !== null && agreedSellingPrice && agreedSellingPrice > 0
    ? (grossMargin! / agreedSellingPrice) * 100
    : null;
  const workspaceCurrency = (value: number | null) => value === null ? "Not set" : formatThb(value);
  const commercialSummaryValues = {
    internalCost: workspaceCurrency(internalCost),
    recommendedPrice: workspaceCurrency(recommendedPrice),
    agreedPrice: workspaceCurrency(agreedSellingPrice),
    margin: workspaceCurrency(grossMargin),
    marginPercent: marginPercentage === null ? "Not set" : `${marginPercentage.toFixed(1)}%`,
  };

  const siteAddress = record.installationMapAddress || record.location;
  const currentErpConnectionState = erpCustomerState === "ERROR" || /FAILED|ERROR/i.test(erpSyncStatus)
    ? "error" as const
    : hasWorkspaceActionRunning && (busyAction?.includes("customer") || busyAction?.includes("quotation"))
      ? "syncing" as const
      : record.erpnextCustomerId
        ? "connected" as const
        : "not-connected" as const;
  const handoffChecklistItems = [
    { id: "acceptance", label: "Quotation accepted", complete: hasClientApproval, detail: "Acceptance belongs to the current quotation version." },
    { id: "documents", label: "Required documents complete", complete: hasRequiredDocuments, detail: `${approvedRequiredDocumentCount} of ${requiredDocumentRequests.length} required documents approved.` },
    { id: "deposit", label: "Deposit received", complete: hasDeposit, detail: hasDeposit ? "A verified payment milestone is recorded." : "Verify the first payment milestone before handoff." },
    { id: "customer", label: "Customer connected", complete: Boolean(record.erpnextCustomerId), detail: record.erpnextCustomerId || "Connect the stable ERPNext customer ID." },
    { id: "technical", label: "Technical design approved", complete: hasTechnicalDesign && hasAgreedPrice, detail: hasTechnicalDesign && hasAgreedPrice ? "BOQ and commercial total are available." : "Complete the BOQ and commercial review." },
  ];
  const handoffReady = handoffChecklistItems.every((item) => item.complete);
  const workspaceDocumentItems = [
    ...documentRequests.map((request, index) => ({
      id: request.id || `request-${index}`,
      label: request.documentName,
      required: request.isRequired,
      status: request.status,
      detail: request.descriptionHint || undefined,
      visibleToCustomer: true,
    })),
    ...deliveryDocuments.map((document, index) => ({
      id: document.id || `delivery-${index}`,
      label: document.title,
      required: false,
      status: document.status,
      detail: document.description || "Customer-facing quotation document",
      visibleToCustomer: true,
    })),
  ];

  return (
    <div data-bagui="crm-workbench" className="sales-workspace admin-crm-workbench min-h-full pb-16 font-sans">
      {/* Breadcrumbs and Top Header Row */}
      <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="crm-workspace-topbar flex flex-wrap items-center justify-between gap-4">
          <Link
            href={`/${locale}/admin/crm`}
            className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {workspaceCopy.backToCrm}
          </Link>
          <div className="crm-workspace-topbar-actions flex min-w-0 shrink-0 flex-wrap items-center gap-2">
            <WorkspaceStatusBadge className="whitespace-nowrap" tone={salesWorkspaceState.isTerminal ? "danger" : "info"}>
              {salesWorkspaceState.statusLabel}
            </WorkspaceStatusBadge>
            <AuditLogTrigger
              className="whitespace-nowrap"
              onClick={() => setIsAuditOpen(true)}
              count={activityLogs.length}
              label={t("navigation.openHistory")}
            />
          </div>
        </div>

        <header className="mt-4 rounded-2xl border border-slate-200/90 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-slate-500">
                <span className="font-mono font-semibold text-slate-800">{getQuotationDocumentNo(record.id)}</span>
                <span className="font-mono">{record.trackRequestNumber}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", salesWorkspaceState.isTerminal ? "bg-rose-500" : "bg-sky-600")} />
                  {record.status.replaceAll("_", " ")}
                </span>
                <span>{requiresInstallation ? workspaceCopy.installationIncluded : workspaceCopy.supplyOnly}</span>
              </div>
              <h1 className="mt-2 text-2xl font-bold leading-8 tracking-[-0.025em] text-slate-950 sm:text-[28px]">{record.customerName}</h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-600">
                {siteAddress || "Sales case workspace"} · {workspaceCopy.caseLabel} {getQuotationDocumentNo(record.id)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              {record.type === "PROPOSAL" && lifecycle.phase === 3 ? (
                <button
                  type="button"
                  onClick={() => void handleSendToCustomer()}
                  disabled={busyAction === "send-to-customer"}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-700 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {t("actions.sendToCustomer")}
                </button>
              ) : null}
              {record.type === "PROPOSAL" && lifecycle.phase === 5 ? (
                <button
                  type="button"
                  onClick={() => void handleConfirmSignedContract()}
                  disabled={busyAction === "confirm-signed-contract"}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-700 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyAction === "confirm-signed-contract" ? <GsapSpinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  {t("actions.confirmSignedContract")}
                </button>
              ) : null}
              {record.type === "PROPOSAL" && lifecycle.phase === 6 && !hasJobTicket ? (
                <button
                  type="button"
                  onClick={handleHandoverQuotation}
                  disabled={busyAction === "handover"}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-700 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyAction === "handover" ? <GsapSpinner className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}
                  {t("actions.confirmHandover")}
                </button>
              ) : null}
              {proposalRecord && !["CANCELLED", "LOST", "FULLY_PAID"].includes(record.status.toUpperCase()) ? (
                <button
                  type="button"
                  onClick={() => openConfirmAction({ kind: "mark-lost", title: t("lostConfirmation.title"), message: t("lostConfirmation.description"), confirmLabel: t("lostConfirmation.confirm"), intent: "destructive" })}
                  disabled={markingLost || busyAction !== null}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-[12px] font-bold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {markingLost ? <GsapSpinner className="h-4 w-4" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                  {t("actions.markLost")}
                </button>
              ) : null}
            </div>
          </div>
          {statusMsg ? (
            <div className={cn("mt-5 rounded-xl border px-4 py-3 text-[13px]", statusMsg.startsWith("Error") ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")} role="status">
              {statusMsg}
            </div>
          ) : null}
        </header>

        <div className="mt-4">
          <WorkspaceMetricStrip
            metrics={[
              { label: workspaceCopy.metrics.quotationPrice, value: totalValue > 0 ? liveTotalLabel : "Not set", supporting: record.erpnextQuotationId || "Draft quotation", icon: CreditCard, tone: "info" },
              { label: workspaceCopy.metrics.systemSize, value: record.systemSizeKwp !== null ? `${record.systemSizeKwp.toFixed(2)} kWp` : "Not set", supporting: requiresInstallation ? workspaceCopy.installationIncluded : workspaceCopy.supplyOnly, icon: Zap, tone: "success" },
              { label: workspaceCopy.metrics.panelQuantity, value: record.panelCount !== null ? `${record.panelCount}` : "Not set", supporting: "Panels in current scope", icon: PackageCheck, tone: "info" },
              { label: workspaceCopy.metrics.estimatedSaving, value: technicalProfile.monthlySavings !== null ? formatThb(technicalProfile.monthlySavings) : "Not set", supporting: "per month", icon: Compass, tone: "warning" },
            ]}
          />
        </div>

        <div className="mt-4">
          <SalesStageStepper state={salesWorkspaceState} copy={workspaceCopy} />
        </div>

        <div className="mt-4">
          <CurrentAction state={salesWorkspaceState} copy={workspaceCopy} onAction={handleWorkspaceAction} isBusy={hasWorkspaceActionRunning} />
        </div>

        <div className="mt-4">
          <WorkspaceTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            copy={workspaceCopy}
            counts={{ documents: documentRequests.length, payment: paymentRequestsList.length, activity: activityLogs.length }}
          />
        </div>
        <div className="mb-4 hidden">
          <Link
            href={`/${locale}/admin/crm`}
            className="inline-flex items-center gap-2 text-xs font-medium text-[#8b949e] transition-colors hover:text-[#c9d1d9]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("navigation.backToCrm")}
          </Link>
        </div>

        {/* Top Header Bar (GitHub Dark Mode Style) */}
        <div className="mb-6 hidden rounded-md border border-[#30363d] bg-[#161b22] p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Left Side: Name, ID, Dot Statuses */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs font-medium text-[#8b949e]">
                  {getQuotationDocumentNo(record.id)}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#8b949e]">
                  <Hash className="h-3.5 w-3.5" />
                  {record.trackRequestNumber}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-[#8b949e]">
                  <span className={cn(
                    "h-2 w-2 rounded-full",
                    record.status.toUpperCase() === "APPROVED" || record.status.toUpperCase() === "FULLY_PAID"
                      ? "bg-[#3fb950]"
                      : record.status.toUpperCase() === "LOST" || record.status.toUpperCase() === "CANCELLED"
                        ? "bg-[#f85149]"
                        : "bg-[#d29922]"
                  )} />
                  <span className="font-medium text-[#c9d1d9]">{record.status.replaceAll("_", " ")}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-[#8b949e]">
                  {requiresInstallation ? "🛠️ Installation" : "📦 Supply Only"}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#f0f6fc]">
                {record.customerName}
              </h1>
            </div>

            {/* Right Side: Header Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <AuditLogTrigger
                onClick={() => setIsAuditOpen(true)}
                count={activityLogs.length}
                label={t("navigation.openHistory")}
              />

              {record.type === "PROPOSAL" && lifecycle.phase === 3 && (
                <button
                  type="button"
                  onClick={() => void handleSendToCustomer()}
                  disabled={busyAction === "send-to-customer"}
                  className="inline-flex items-center gap-2 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <Mail className="h-4 w-4" />
                  {t("actions.sendToCustomer")}
                </button>
              )}

              {record.type === "PROPOSAL" && lifecycle.phase === 5 && (
                <button
                  type="button"
                  onClick={() => void handleConfirmSignedContract()}
                  disabled={busyAction === "confirm-signed-contract"}
                  className="inline-flex items-center gap-2 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {busyAction === "confirm-signed-contract" ? <GsapSpinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  {t("actions.confirmSignedContract")}
                </button>
              )}

              {record.type === "PROPOSAL" && lifecycle.phase === 6 && !hasJobTicket && (
                <button
                  type="button"
                  onClick={handleHandoverQuotation}
                  disabled={busyAction === "handover"}
                  className="inline-flex items-center gap-2 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {busyAction === "handover" ? <GsapSpinner className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                  {t("actions.confirmHandover")}
                </button>
              )}

              {proposalRecord && !["CANCELLED", "LOST", "FULLY_PAID"].includes(record.status.toUpperCase()) && (
                <button
                  type="button"
                  onClick={() =>
                    openConfirmAction({
                      kind: "mark-lost",
                      title: t("lostConfirmation.title"),
                      message: t("lostConfirmation.description"),
                      confirmLabel: t("lostConfirmation.confirm"),
                      intent: "destructive",
                    })
                  }
                  disabled={markingLost || busyAction !== null}
                  className="inline-flex items-center gap-2 rounded-md border border-[#da3633]/40 bg-[#da3633]/10 hover:bg-[#da3633]/20 px-3 py-1.5 text-xs font-medium text-[#f85149] transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {markingLost ? <GsapSpinner className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  {t("actions.markLost")}
                </button>
              )}
            </div>
          </div>

          {statusMsg && (
            <div className={cn(
              "rounded-md border p-3 text-xs font-medium",
              statusMsg.startsWith("Error")
                ? "border-[#da3633]/40 bg-[#da3633]/10 text-[#f85149]"
                : "border-[#238636]/40 bg-[#238636]/10 text-[#3fb950]"
            )}>
              {statusMsg}
            </div>
          )}
        </div>

        <div className="mb-6 hidden">
          <SalesThreadCard thread={salesThread} locale={locale} compact />
        </div>

        {/* Horizontal Navigation Tabs (GitHub Style) */}
        <div className="hidden border-b border-[#30363d] mb-6">
          <nav className="-mb-px flex gap-2 overflow-x-auto" aria-label="Quotation workspace tabs">
            {([
              { id: "boq", label: t("tabs.technicalConfiguration"), sub: "Technical Spec & BOQ" },
              { id: "quotation", label: "Quotation", sub: "Quotation & Approval" },
              { id: "payment", label: t("tabs.financialRequisitions"), sub: "Financial Terms & Handover" },
            ] as const).map((tab) => {
              const isActive = activeTab === tab.id;
              const isLocked = tab.id === "quotation"
                ? !record.erpnextQuotationId
                : tab.id === "payment"
                  ? !hasCompletedQuotation || !hasClientApproval
                  : false;

              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => {
                    if (isLocked) {
                      setStatusMsg(tab.id === "quotation"
                        ? "Create the ERPNext quotation before opening Quotation tab."
                        : "Upload the completed quotation and wait for client approval before opening Financial Regulations tab.");
                      return;
                    }
                    setActiveTab(tab.id);
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none cursor-pointer",
                    isActive
                      ? "border-[#C58F61] text-[#f0f6fc] font-semibold"
                      : isLocked
                        ? "border-transparent text-[#484f58] cursor-not-allowed"
                        : "border-transparent text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#8b949e]"
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.id === "quotation" && finalQuotation && (
                    <span className="rounded-full bg-[#30363d] px-2 py-0.5 text-xs font-mono text-[#f0f6fc]">1</span>
                  )}
                  {tab.id === "payment" && paymentRequestsList.length > 0 && (
                    <span className="rounded-full bg-[#30363d] px-2 py-0.5 text-xs font-mono text-[#f0f6fc]">{paymentRequestsList.length}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 2-Column Layout (70% Left / 30% Right Sticky) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
          {/* Left Column (70% Width) */}
          <div className="space-y-6">
            {/* Tab Contents */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <WorkspaceCard as="section" className="p-5 sm:p-6">
                  <WorkspaceSectionHeading
                    title={workspaceCopy.overview}
                    description="One working view for the request, its current decision, and the next operationally safe step."
                  />
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{workspaceCopy.currentStage}</p>
                      <p className="mt-2 text-[16px] font-bold text-slate-950">{workspaceCopy.stages[salesWorkspaceState.currentStage]}</p>
                      <p className="mt-1 text-[12px] text-slate-600">{salesWorkspaceState.statusLabel}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Request source</p>
                      <p className="mt-2 text-[16px] font-bold text-slate-950">{record.source === "SOLAR_WIZARD_BOM" ? "Solar sizing" : "Inbound request"}</p>
                      <p className="mt-1 text-[12px] text-slate-600">{record.trackRequestNumber}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Scope readiness</p>
                      <p className="mt-2 text-[16px] font-bold text-slate-950">{lineItems.length} BOQ item{lineItems.length === 1 ? "" : "s"}</p>
                      <p className="mt-1 text-[12px] text-slate-600">{siteAddress ? "Site requirement captured" : "Site requirement needed"}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)]">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Request context</p>
                      <p className="mt-2 text-[13px] leading-6 text-slate-700">
                        {technicalProfile.leadRequirements || "No written request notes have been captured for this case."}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Next decision</p>
                      <p className="mt-2 text-[13px] leading-6 text-slate-700">{salesWorkspaceState.currentAction.description}</p>
                    </div>
                  </div>
                  {!siteAddress ? (
                    <WorkspaceEmptyState
                      icon={MapPin}
                      title="Site requirement not captured"
                      description="Add the installation address or site location before the design can be treated as ready."
                    />
                  ) : null}
                </WorkspaceCard>

                <div className="grid gap-6 xl:grid-cols-2">
                  <CommercialSummaryCard values={commercialSummaryValues} copy={workspaceCopy} />
                  <WorkspaceCard as="section" className="p-5 sm:p-6">
                    <WorkspaceSectionHeading title="Readiness signals" description="These signals are derived from the current case record and linked artifacts." />
                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      {salesWorkspaceState.currentAction.facts.slice(0, 4).map((fact) => (
                        <div key={fact.id} className={cn("rounded-lg px-3 py-2.5 text-[12px]", fact.complete ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950")}>
                          <div className="flex items-start gap-2">
                            {fact.complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />}
                            <span className="font-semibold leading-4">{fact.label}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </WorkspaceCard>
                </div>
              </div>
            )}

            {activeTab === "documents" && (
              <DocumentChecklist
                items={workspaceDocumentItems}
                copy={workspaceCopy}
                emptyMessage="Customer-facing files and required uploads will appear here as the case progresses."
                action={
                  <WorkspaceButton variant="secondary" icon={ChevronRight} onClick={() => setActiveTab("quotation")}>
                    Manage files
                  </WorkspaceButton>
                }
              />
            )}

            {activeTab === "handoff" && (
              <HandoffChecklist
                items={handoffChecklistItems}
                ready={handoffReady}
                copy={workspaceCopy}
                onCreateProject={() => void handleHandoverQuotation()}
                isBusy={busyAction === "handover"}
              />
            )}

            {activeTab === "activity" && <ActivityLog items={activityLogs} copy={workspaceCopy} />}

            {activeTab === "quotation" ? <CommercialSummaryCard values={commercialSummaryValues} copy={workspaceCopy} /> : null}

            {activeTab === "boq" && (
              <div className="space-y-4">
                <CustomerTechnicalProfile profile={technicalProfile} />
                {record.type === "PROPOSAL" && !erpQuotationCreated ? (
                  <BoqBuilder
                    proposalId={record.id}
                    initialBundleCode={baseBundleItemCode}
                    initialLines={revisionDraft?.lines}
                    amendedFrom={revisionDraft?.amendedFrom}
                    onCreated={(quotationId, grandTotal) => {
                      const finalVal = grandTotal ?? null;
                      setRecord((current) => ({ ...current, erpnextQuotationId: quotationId, value: finalVal, valueLabel: formatThb(finalVal), raw: { ...current.raw, grand_total: finalVal ?? undefined, total: finalVal ?? undefined } }));
                      setStatusMsg(`ERPNext quotation generated: ${quotationId}`);
                      router.refresh();
                    }}
                  />
                ) : null}
                {!erpQuotationCreated ? (
                  <div className="rounded-md border border-[#d29922]/40 bg-[#d29922]/10 p-4 text-xs font-medium text-[#d29922]" role="status">
                    Create the ERPNext quotation before continuing to the quotation step.
                  </div>
                ) : null}
              </div>
            )}

            {activeTab === "quotation" && (() => {
              const customerPortalUrl = absoluteCustomerLink(`/${locale}/portal/${record.id}`);
              const hasSecureLink = Boolean(savedPortalLink);
              const isPortalLinkValid = hasSecureLink && savedPortalLinkExpiresAt
                ? new Date(savedPortalLinkExpiresAt).getTime() > renderedAt
                : false;

              return (
                <GsapReveal className="space-y-6">

                  {/* ── Revision-requested banner ──────────────────────────────── */}
                  {latestCustomerRevisionRequest && (
                    <div className="rounded-md border border-[#d29922]/40 bg-[#d29922]/8 p-4 space-y-1 shadow-sm">
                      <div className="flex items-start gap-3">
                        <PenLine className="h-4 w-4 text-[#d29922] shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#d29922]">
                            Customer Revision Request
                          </p>
                          <p className="text-xs text-[#e3b341] mt-0.5 leading-relaxed">
                            {latestCustomerRevisionRequest.message || "Customer requested changes to this quotation."}
                          </p>
                          {latestCustomerRevisionRequest.requestedAt && (
                            <p className="text-[10px] text-[#8b949e] mt-1 font-mono">
                              Requested: {new Date(latestCustomerRevisionRequest.requestedAt).toLocaleString("th-TH")}
                            </p>
                          )}
                        </div>
                        {canStartCustomerRequestedRevision && (
                          <button
                            type="button"
                            onClick={() => openConfirmAction({
                              kind: "start-revision",
                              title: "Start Customer-Requested Revision",
                              message: "This will create a new ERPNext amendment from the current quotation and reset the signing workflow. Continue?",
                              confirmLabel: "Start Revision",
                              intent: "primary",
                            })}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#d29922]/20 hover:bg-[#d29922]/30 border border-[#d29922]/40 text-[#e3b341] px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0"
                          >
                            <PenLine className="h-3.5 w-3.5" />
                            Start Revision
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Confirm Signed Contract (phase 5 = CLIENT_SIGNED_PENDING_REVIEW) ── */}
                  {record.type === "PROPOSAL" && lifecycle.phase === 5 && (
                    <div className="rounded-md border border-[#238636]/40 bg-[#238636]/8 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="h-4 w-4 text-[#3fb950] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-[#3fb950]">Client Signed — Pending Admin Review</p>
                          <p className="text-xs text-[#8b949e] mt-0.5">
                            Upload the countersigned contract PDF, then confirm to close this deal and generate the job ticket.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleConfirmSignedContract()}
                        disabled={busyAction === "confirm-signed-contract"}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] text-white px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {busyAction === "confirm-signed-contract" ? <GsapSpinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        <span>Confirm Signed Deal</span>
                      </button>
                    </div>
                  )}

                  {/* ── 1. Secure Portal Link Generator ──────────────────────────── */}
                  {record.type === "PROPOSAL" && (
                    <div className="rounded-md border border-[#30363d] bg-[#161b22] p-5 space-y-4 shadow-sm">
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#30363d] pb-4">
                        <div>
                          <h3 className="text-base font-semibold text-[#f0f6fc] flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-[#58a6ff]" />
                            <span>Customer Portal Link</span>
                          </h3>
                          <p className="text-xs text-[#8b949e] mt-0.5">
                            Issue a time-limited secure token link for the customer to view quotation, sign documents, and upload required files
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {record.type === "PROPOSAL" && (
                            <button
                              type="button"
                              onClick={() => setIsDispatchModalOpen(true)}
                              disabled={busyAction === "dispatch-signing"}
                              className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] text-white px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>Dispatch for E-Signature</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expiry picker + generate button */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8b949e]">Link valid for:</span>
                          <div className="flex items-center gap-1">
                            {([1, 7, 14, 30, 90] as const).map((days) => (
                              <button
                                key={days}
                                type="button"
                                onClick={() => setPortalLinkExpiryDays(days)}
                                className={cn(
                                  "rounded-md px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer",
                                  portalLinkExpiryDays === days
                                    ? "bg-[#58a6ff]/15 border-[#58a6ff]/40 text-[#58a6ff]"
                                    : "bg-[#21262d] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]"
                                )}
                              >
                                {days}d
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setPortalLinkDestination("public");
                              void handleCopyMagicLink();
                            }}
                            disabled={busyAction === "portal-access"}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#58a6ff]/15 hover:bg-[#58a6ff]/25 border border-[#58a6ff]/30 text-[#58a6ff] px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {busyAction === "portal-access" ? <GsapSpinner className="h-3.5 w-3.5" /> : copiedMagicLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{copiedMagicLink ? "Copied!" : "Generate & Copy Secure Link"}</span>
                          </button>
                          <button
                            type="button"
                            title="Generate local test link"
                            onClick={() => {
                              setPortalLinkDestination("local");
                              void handleCopyMagicLink();
                            }}
                            disabled={busyAction === "portal-access"}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#8b949e] px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Local</span>
                          </button>
                        </div>
                      </div>

                      {/* Saved link display */}
                      {hasSecureLink && savedPortalLink ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">Last Generated Link</span>
                            {savedPortalLinkExpiresAt ? (
                              <PortalLinkCountdown expiresAt={savedPortalLinkExpiresAt} />
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 bg-[#0d1117] border border-[#30363d] rounded-md p-3">
                            <span className="flex-1 truncate font-mono text-[11px] text-[#c9d1d9] select-all min-w-0">
                              {compactCustomerLink(savedPortalLink)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(savedPortalLink);
                                toast.success("Copied saved portal link");
                              }}
                              className="shrink-0 inline-flex items-center gap-1 text-[#8b949e] hover:text-[#58a6ff] transition-colors cursor-pointer text-xs"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            {isPortalLinkValid && (
                              <a
                                href={savedPortalLink}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 inline-flex items-center gap-1 text-[#8b949e] hover:text-[#58a6ff] transition-colors text-xs"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 bg-[#0d1117] border border-[#30363d] rounded-md p-3">
                          <span className="text-[#58a6ff] font-semibold shrink-0 text-xs">Base Portal URL:</span>
                          <span className="truncate text-[#c9d1d9] select-all flex-1 font-mono text-[11px]">
                            {customerPortalUrl}
                          </span>
                        </div>
                      )}

                      {/* Dispatch magic link display (post-dispatch) */}
                      {dispatchMagicLink && (
                        <div className="rounded-md border border-[#238636]/30 bg-[#238636]/8 p-3 space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3fb950]">E-Signature Link (dispatched)</p>
                          <div className="flex items-center gap-2">
                            <span className="flex-1 truncate font-mono text-[11px] text-[#c9d1d9] select-all">
                              {compactCustomerLink(dispatchMagicLink)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(dispatchMagicLink);
                                toast.success("Dispatch link copied");
                              }}
                              className="shrink-0 text-[#8b949e] hover:text-[#58a6ff] cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── 2. Outbound Delivery Documents (with upload / archive) ───── */}
                  <CustomerDeliveryPayloadMatrix
                    record={record}
                    documents={deliveryDocuments}
                    templates={documentTemplateCatalog.deliveries}
                    warrantyTemplates={documentTemplateCatalog.warranties}
                    onUpload={handleUploadDeliveryDocument}
                    onArchive={handleArchiveDeliveryDocument}
                    onViewFile={(doc) => setActiveDocument(doc)}
                    onConfigureTemplates={() => setIsDocumentTemplateEditorOpen(true)}
                    busyAction={busyAction}
                  />

                  {/* ── 3. Inbound Customer Document Checklist ────────────────────── */}
                  <QuotationDocumentRequestCard
                    requests={documentRequests}
                    templates={documentTemplateCatalog.requests}
                    customDocumentName={customDocumentName}
                    onCustomDocumentNameChange={setCustomDocumentName}
                    onAddTemplate={(name) => addDocumentRequest(name)}
                    onAddCustom={() => addDocumentRequest(customDocumentName)}
                    onToggleRequired={toggleDocumentRequestRequired}
                    onRemoveRequest={removeDocumentRequest}
                    onViewFile={handleViewDocumentRequestFile}
                    onVerifyRequest={handleVerifyDocumentRequest}
                    onUpdateCustomerView={handleUpdateCustomerDocumentRequests}
                    onConfigureTemplates={() => setIsDocumentTemplateEditorOpen(true)}
                    busyAction={busyAction}
                  />
                </GsapReveal>
              );
            })()}

            {activeTab === "payment" ? <CommercialSummaryCard values={commercialSummaryValues} copy={workspaceCopy} /> : null}

            {activeTab === "payment" && (
              <GsapReveal className="space-y-6">
                {/* Deposit Request Generator */}
                <SolarCard className="p-5 space-y-4 bg-[#161b22] border-[#30363d]">
                  <div>
                    <h3 className="text-base font-semibold text-[#f0f6fc] flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-[#58a6ff]" />
                      <span>{t("payments.title")}</span>
                    </h3>
                    <p className="text-xs text-[#8b949e] mt-0.5">
                      {t("payments.description")}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <fieldset>
                        <legend className="text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">{t("payments.paymentType")}</legend>
                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                          {(["FULL", "INSTALLMENT"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => selectPaymentType(type)}
                              className={cn(
                                "rounded-md border p-3 text-left text-xs transition-colors cursor-pointer flex flex-col justify-between min-h-16",
                                prPaymentType === type
                                  ? "border-[#58a6ff] bg-[#388bfd]/10 text-[#f0f6fc]"
                                  : "border-[#30363d] bg-[#21262d] text-[#8b949e] hover:border-[#8b949e]"
                              )}
                            >
                              <span className="font-medium text-[#f0f6fc]">
                                {type === "FULL" ? t("payments.fullPayment") : t("payments.installmentDeposit")}
                              </span>
                              <span className="text-[10px] text-[#8b949e] mt-1">
                                {type === "FULL" ? t("payments.fullPaymentThai") : t("payments.installmentDepositThai")}
                              </span>
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend className="text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">{t("payments.paymentMethod")}</legend>
                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                          {(["QR", "BANK_TRANSFER"] as const).map((method) => (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setPrPaymentMethod(method)}
                              className={cn(
                                "rounded-md border p-3 text-left text-xs transition-colors cursor-pointer flex flex-col justify-between min-h-16",
                                prPaymentMethod === method
                                  ? "border-[#58a6ff] bg-[#388bfd]/10 text-[#f0f6fc]"
                                  : "border-[#30363d] bg-[#21262d] text-[#8b949e] hover:border-[#8b949e]"
                              )}
                            >
                              <span className="font-medium text-[#f0f6fc]">
                                {method === "QR" ? t("payments.promptPayQr") : t("payments.bankTransfer")}
                              </span>
                              <span className="text-[10px] text-[#8b949e] mt-1">
                                {method === "QR" ? t("payments.scanQr") : t("payments.bankTransferThai")}
                              </span>
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    </div>

                    {/* Presets Row */}
                    {prPaymentType === "INSTALLMENT" && (
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-[#8b949e] mb-2">
                          {t("payments.selectDepositOption")}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {(["10", "30", "custom"] as const).map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => selectPreset(preset)}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer",
                                prPreset === preset
                                  ? "bg-[#388bfd]/15 text-[#58a6ff] border-[#58a6ff]"
                                  : "bg-[#21262d] text-[#8b949e] border-[#30363d] hover:text-[#c9d1d9]"
                              )}
                            >
                              {preset === "10" && t("payments.depositPreset", { percent: 10, amount: formatThb(totalValue * 0.1) })}
                              {preset === "30" && t("payments.depositPreset", { percent: 30, amount: formatThb(totalValue * 0.3) })}
                              {preset === "custom" && t("payments.customAmount")}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Amount & Title Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">
                            {t("payments.depositAmount")}
                          </span>
                          <input
                            type="number"
                            value={prAmount}
                            onChange={(e) => {
                              setPrAmount(e.target.value);
                              setPrPreset("custom");
                            }}
                            disabled={prPaymentType === "INSTALLMENT" && prPreset !== "custom"}
                            placeholder={t("payments.customAmountPlaceholder")}
                            className="mt-1.5 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#f0f6fc] font-medium outline-none placeholder:text-[#484f58] focus:border-[#58a6ff] transition-colors"
                          />
                        </label>
                      </div>
                      <div>
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">
                            {t("payments.descriptionTitle")}
                          </span>
                          <input
                            type="text"
                            value={prTitle}
                            onChange={(e) => setPrTitle(e.target.value)}
                            placeholder={t("payments.descriptionPlaceholder")}
                            className="mt-1.5 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#f0f6fc] font-medium outline-none placeholder:text-[#484f58] focus:border-[#58a6ff] transition-colors"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleGeneratePaymentRequest}
                        disabled={busyAction === "generate-payment-request"}
                        className="inline-flex items-center gap-2 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-1.5 text-xs font-medium border border-[rgba(240,246,252,0.1)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {busyAction === "generate-payment-request" ? (
                          <GsapSpinner className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        <span>{t("payments.generateLink")}</span>
                      </button>
                    </div>
                  </div>
                </SolarCard>

                {/* Payment History & Slip Viewer */}
                <SolarCard className="p-5 space-y-4 bg-[#161b22] border-[#30363d]">
                  <div>
                    <h3 className="text-base font-semibold text-[#f0f6fc] flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#58a6ff]" />
                      <span>{t("payments.historyTitle")}</span>
                    </h3>
                    <p className="text-xs text-[#8b949e] mt-0.5">
                      {t("payments.historyDescription")}
                    </p>
                  </div>

                  <div className="overflow-x-auto w-full">
                    <table className="min-w-[650px] w-full table-auto text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#30363d] text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">
                          <th className="py-2">{t("payments.table.titleRequestId")}</th>
                          <th className="py-2 text-right">{t("payments.table.amount")}</th>
                          <th className="py-2 text-center">{t("payments.table.status")}</th>
                          <th className="py-2 text-right">{t("payments.table.actions")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#30363d] text-xs">
                        {paymentRequestsList.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-[#8b949e]">
                              {t("payments.noRequests")}
                            </td>
                          </tr>
                        ) : (
                          paymentRequestsList.map((pr) => (
                            <tr key={pr.id} className="hover:bg-[#21262d] transition-colors">
                              <td className="py-3">
                                <p className="font-medium text-[#f0f6fc]">{pr.title}</p>
                                <p className="font-mono text-[10px] text-[#8b949e]">ID: {pr.id.slice(0, 8).toUpperCase()}</p>
                              </td>
                              <td className="py-3 text-right font-mono text-[#f0f6fc]">
                                {formatThb(pr.amountRequested)}
                              </td>
                              <td className="py-3 text-center">
                                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#8b949e]">
                                  <span className={cn(
                                    "h-2 w-2 rounded-full",
                                    pr.status === "PAID" ? "bg-[#3fb950]" : pr.status === "AWAITING_VERIFICATION" ? "bg-[#d29922]" : "bg-[#8b949e]"
                                  )} />
                                  {pr.status}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => setInvoiceModalPr(pr)}
                                    className="inline-flex items-center gap-1 rounded-md bg-[#1f6feb]/20 hover:bg-[#1f6feb]/30 border border-[#1f6feb]/40 px-2.5 py-1 text-[11px] font-bold text-[#58a6ff] transition-colors cursor-pointer"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    <span>ใบแจ้งชำระเงิน</span>
                                  </button>
                                  {pr.status === "PAID" && (
                                    <button
                                      type="button"
                                      onClick={() => setReceiptModalPr(pr)}
                                      className="inline-flex items-center gap-1 rounded-md bg-[#238636]/20 hover:bg-[#238636]/30 border border-[#238636]/40 px-2.5 py-1 text-[11px] font-bold text-[#3fb950] transition-colors cursor-pointer"
                                    >
                                      <FileCheck className="h-3.5 w-3.5 text-[#3fb950]" />
                                      <span>ใบเสร็จ</span>
                                    </button>
                                  )}
                                  {pr.slipUrl && (
                                    <a
                                      href={pr.slipUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md bg-[#238636]/20 hover:bg-[#238636]/30 border border-[#238636]/40 px-2.5 py-1 text-[11px] font-bold text-[#3fb950] transition-colors cursor-pointer"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      <span>สลิป</span>
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void handleCopyLink(pr.id)}
                                    className="inline-flex items-center gap-1 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] px-2.5 py-1 text-[11px] text-[#c9d1d9] transition-colors cursor-pointer"
                                  >
                                    {copiedPrId === pr.id ? t("payments.copied") : t("payments.copySecureLink")}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </SolarCard>
              </GsapReveal>
            )}

            {/* Dynamic Bottom CTA Bar (Replacing bugged "Proceed to Step 2" button) */}
            <div className="hidden rounded-md border border-[#30363d] bg-[#161b22] p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div>
                <p className="text-xs text-[#8b949e]">
                  {activeTab === "boq" && "Next Stage: Quotation Preview & Document Signatures"}
                  {activeTab === "documents" && "Next Stage: Financial Terms & Deposit Payments"}
                  {activeTab === "payment" && "Final Stage: Handover & Field Project Ticket"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Secondary Back Action */}
                {activeTab === "quotation" && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("boq")}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                  >
                    ← Technical Spec
                  </button>
                )}
                {activeTab === "payment" && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("quotation")}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                  >
                    ← Quotation
                  </button>
                )}

                {/* Primary Dynamic Action */}
                {activeTab === "boq" && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("quotation")}
                    disabled={!erpQuotationCreated}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] text-white px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span>Proceed to Quotation</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                {activeTab === "quotation" && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("payment")}
                    disabled={!hasCompletedQuotation || !hasClientApproval}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] text-white px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span>Proceed to Financial Regulations</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                {activeTab === "payment" && (
                  record.type === "PROPOSAL" && lifecycle.phase === 6 && !hasJobTicket ? (
                    <button
                      type="button"
                      onClick={handleHandoverQuotation}
                      disabled={busyAction === "handover"}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] text-white px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {busyAction === "handover" ? <GsapSpinner className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                      <span>Confirm Handover & Create Job Ticket</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab("quotation")}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Return to Quotation
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Right Column (30% Width - Sticky Sidebar) */}
          <div className="sticky top-6 self-start space-y-4">
            <CustomerSummaryCard
              name={record.customerName}
              email={record.email}
              phone={record.phone}
              location={record.location}
              siteAddress={siteAddress}
              typeLabel={requiresInstallation ? workspaceCopy.installationIncluded : workspaceCopy.supplyOnly}
              copy={workspaceCopy}
            >
              <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-slate-500">Request number</span>
                <span className="font-mono font-semibold text-slate-800">{record.trackRequestNumber}</span>
              </div>
            </CustomerSummaryCard>

            <ERPConnectionCard
              state={currentErpConnectionState}
              customerId={record.erpnextCustomerId}
              quotationId={record.erpnextQuotationId}
              customerUrl={erpCustomerUrl || null}
              quotationUrl={erpQuotationUrl || null}
              syncError={erpSyncError || erpCustomerMessage || null}
              lastSynced={erpSyncUpdatedAt || null}
              copy={workspaceCopy}
              onCreateCustomer={() => void handleCreateErpCustomer()}
              onSync={() => void handleGenerateQuotation()}
              onOpenCustomer={() => {
                if (erpCustomerUrl) window.open(erpCustomerUrl, "_blank", "noopener,noreferrer");
              }}
              onOpenQuotation={() => {
                if (erpQuotationUrl) window.open(erpQuotationUrl, "_blank", "noopener,noreferrer");
              }}
              isBusy={hasWorkspaceActionRunning || busyAction === "customer-lookup" || busyAction === "customer-create" || busyAction === "quotation"}
            />

            <CommercialSummaryCard values={commercialSummaryValues} copy={workspaceCopy} />

            {/* Panel 1: Total Valuation */}
            <div className="hidden rounded-md border border-[#30363d] bg-[#161b22] p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
                  Total Valuation
                </h3>
                {record.erpnextQuotationId ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#3fb950] font-mono">
                    <CheckCircle2 className="h-3.5 w-3.5" /> ERP Synced
                  </span>
                ) : (
                  <span className="text-[11px] text-[#8b949e] font-mono">Draft</span>
                )}
              </div>

              <div className="space-y-1">
                <p className="font-mono text-2xl font-bold text-[#58a6ff]">
                  {totalValue ? formatThb(totalValue) : "฿0.00"}
                </p>
                <p className="text-xs text-[#8b949e]">
                  {record.valueLabel || (totalValue ? `${totalValue.toLocaleString()} THB` : "Pending valuation")}
                </p>
              </div>

              <div className="pt-3 border-t border-[#30363d] flex items-center justify-between text-xs text-[#8b949e]">
                <span>Items: {revisionDraft?.lines?.length ?? 0}</span>
                <span className="text-[#3fb950] font-medium">THB Currency</span>
              </div>
            </div>

            {/* Panel 2: ERPNext Sync Status */}
            <div className="hidden rounded-md border border-[#30363d] bg-[#161b22] p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
                  ERPNext Integration
                </h3>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className={cn("h-2 w-2 rounded-full", erpSyncIsHealthy ? "bg-[#3fb950]" : "bg-[#d29922]")} />
                  <span className="text-[#8b949e] font-mono text-[11px]">{erpSyncStatus}</span>
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#8b949e]">Quotation ID:</span>
                  <span className="font-mono text-[#c9d1d9]">{record.erpnextQuotationId || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#8b949e]">Customer ID:</span>
                  <span className="font-mono text-[#c9d1d9]">{record.erpnextCustomerId || "—"}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#30363d] flex flex-col gap-2">
                {erpQuotationUrl && (
                  <a
                    href={erpQuotationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] rounded-md px-3 py-1.5 text-xs font-medium transition-colors w-full"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-[#58a6ff]" />
                    <span>Open in ERPNext</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleGenerateQuotation}
                  disabled={busyAction === "quotation"}
                  className="inline-flex items-center justify-center gap-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] rounded-md px-3 py-1.5 text-xs font-medium transition-colors w-full cursor-pointer"
                >
                  {busyAction === "quotation" ? (
                    <GsapSpinner className="h-3.5 w-3.5" />
                  ) : (
                    <Zap className="h-3.5 w-3.5 text-[#d29922]" />
                  )}
                  <span>{erpQuotationCreated ? "Re-sync ERPNext" : "Create ERP Quotation"}</span>
                </button>
              </div>
            </div>

            {/* Panel 3: Brief Customer Info */}
            <div className="hidden rounded-md border border-[#30363d] bg-[#161b22] p-4 space-y-3 shadow-sm">
              <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
                Customer Profile
              </h3>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="font-semibold text-[#f0f6fc] text-sm">{record.customerName}</p>
                  <p className="text-[#8b949e] font-mono text-[11px] mt-0.5">Track: #{record.trackRequestNumber}</p>
                </div>
                {record.email && (
                  <div className="flex items-center gap-2 text-[#8b949e]">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{record.email}</span>
                  </div>
                )}
                {record.phone && (
                  <div className="flex items-center gap-2 text-[#8b949e]">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{record.phone}</span>
                  </div>
                )}
                {record.location && (
                  <div className="flex items-start gap-2 text-[#8b949e]">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{record.location}</span>
                  </div>
                )}
                {(() => {
                  const siteLat = (record.installationLatitude ??
                    (record.configurationData?.siteLocation as Record<string, unknown> | undefined)?.latitude ??
                    ((record.configurationData?.wizardAnswers as Record<string, unknown> | undefined)?.siteLocation as Record<string, unknown> | undefined)?.latitude) as number | string | null | undefined;
                  const siteLng = (record.installationLongitude ??
                    (record.configurationData?.siteLocation as Record<string, unknown> | undefined)?.longitude ??
                    ((record.configurationData?.wizardAnswers as Record<string, unknown> | undefined)?.siteLocation as Record<string, unknown> | undefined)?.longitude) as number | string | null | undefined;
                  const siteAddress = (record.installationMapAddress ??
                    record.location ??
                    (record.configurationData?.siteLocation as Record<string, unknown> | undefined)?.displayName) as string | undefined;

                  if (!siteLat && !siteAddress) return null;

                  return (
                    <div className="pt-3 border-t border-[#30363d] space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#c9d1d9]">
                        <MapPin className="h-3.5 w-3.5 text-[#B7D1EA]" />
                        <span>Pinned Site Location</span>
                      </div>
                      <SiteLocationMap
                        latitude={siteLat}
                        longitude={siteLng}
                        displayName={siteAddress}
                        address={record.installationMapAddress}
                        heightClass="h-[180px]"
                      />
                    </div>
                  );
                })()}
                <div className="pt-3 border-t border-[#30363d] flex items-center justify-between text-xs">
                  <span className="text-[#8b949e]">Type:</span>
                  <span className="inline-flex items-center gap-1 text-[#c9d1d9] font-medium">
                    {requiresInstallation ? "🛠️ Installation" : "📦 Supply Only"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AuditLogSidebar
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        logs={activityLogs}
        title="Quotation activity"
        entityLabel={`${record.customerName} · ${getQuotationDocumentNo(record.id)}`}
        emptyMessage="No quotation or linked sales activity has been recorded yet."
      />

      <ConfirmActionModal
        isOpen={confirmAction !== null}
        title={confirmAction?.title || ""}
        message={confirmAction?.message || ""}
        confirmLabel={confirmAction?.confirmLabel || "Confirm"}
        intent={confirmAction?.intent || "primary"}
        isConfirming={busyAction !== null}
        onClose={closeConfirmAction}
        onConfirm={() => void runConfirmAction()}
      />

      <Dialog isOpen={isCancelModalOpen} onClose={() => {
        if (cancelingQuotation) return;
        setIsCancelModalOpen(false);
      }} size="sm">
        <DialogContent className="bg-[#0F172A]">
          <DialogHeader className="border-b border-[#1E293B]/50 pb-4">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-rose-500">{tCrm("confirm.quotationEyebrow")}</p>
              <h2 className="text-xl font-black tracking-tight text-gray-100">
                {tCrm("confirm.quotationTitle")}
              </h2>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4 py-6">
            <div className="rounded-[1.5rem] border border-[#1E293B] bg-[#0F172A]/70 p-4 shadow-none">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">{tCrm("confirm.impactSystems")}</p>
              <ul className="space-y-3.5 text-xs text-gray-300 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5">🔴</span>
                  <div>
                    <strong>Local Database</strong>: {tCrm.rich("confirm.localDatabase", { status: () => <code className="bg-rose-500/10 px-1.5 py-0.5 rounded text-rose-600 font-mono">CANCELLED</code> })}
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5">🔄</span>
                  <div>
                    <strong>ERPNext Integration</strong>: {tCrm("confirm.erpnext")}
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5">📁</span>
                  <div>
                    <strong>Google Drive</strong>: {tCrm("confirm.googleDrive")}
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5">💬</span>
                  <div>
                    <strong>Discord Alert</strong>: {tCrm("confirm.discordAlert")}
                  </div>
                </li>
              </ul>
            </div>

            <div className="rounded-[1.5rem] border border-[#1E293B] bg-[#0F172A]/40 p-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Proposal ID</span>
                <span className="font-mono text-xs font-semibold text-gray-300">{record.id.toUpperCase()}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Customer</span>
                <span className="text-right text-xs font-semibold text-gray-300">
                  {record.customerName}
                  <span className="block font-normal text-gray-400">{record.email || "No email"}</span>
                </span>
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="border-t border-[#1E293B]/50 bg-[#0F172A]">
            <DialogCloseButton className="text-gray-400 hover:text-gray-100 transition-colors font-bold text-xs mr-3">
              {tCrm("actions.cancel")}
            </DialogCloseButton>
            <button
              type="button"
              onClick={handleCancelQuotation}
              disabled={cancelingQuotation}
              className="inline-flex items-center gap-2 bg-[#F1D6B8] hover:bg-[#e0c5a7] text-gray-100 font-bold rounded-xl px-5 py-3 text-xs tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelingQuotation ? tCrm("actions.processing") : tCrm("actions.confirmNetworkCancel")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        isOpen={Boolean(activeDocument)}
        onClose={() => setActiveDocument(null)}
        size="full"
        className="flex flex-col rounded-xl"
      >
        <DialogHeader className="flex items-center justify-between border-b border-[#1E293B] bg-[#0F172A] px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1 pr-4">
            <h3 className="truncate text-base font-black text-gray-100" style={{ fontFamily: "var(--font-urbanist), sans-serif" }}>
              {activeDocument?.name}
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              {activeDocument ? formatFileSize(activeDocument.sizeBytes) : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeDocumentDownloadUrl ? (
              <a
                href={activeDocumentDownloadUrl}
                download
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-xs font-bold text-slate-300 transition hover:bg-[#1E293B] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Download</span>
              </a>
            ) : null}
            {activeDocumentPreviewUrl ? (
              <a
                href={activeDocumentPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-xs font-bold text-slate-300 transition hover:bg-[#1E293B] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Open preview</span>
              </a>
            ) : null}
          </div>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 overflow-hidden bg-[#0B1121] p-0">
          {activeDocument && activeDocumentPreviewUrl ? (
            <QuotationDocumentPreviewLoader
              key={activeDocumentPreviewUrl}
              name={activeDocument.name}
              url={activeDocumentPreviewUrl}
              kind={activeDocumentPreviewKind}
            />
          ) : null}
        </DialogBody>
      </Dialog>

      {viewingSlipRequest && (
        <Dialog
          isOpen={Boolean(viewingSlipRequest)}
          onClose={() => setViewingSlipRequest(null)}
          size="md"
        >
          <DialogContent className="bg-[#0F172A]">
            <DialogHeader className="border-b border-[#1E293B] bg-[#0F172A] px-5 py-4 sm:px-6 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.24em] text-[#B7D1EA]">
                  Manual Verification Portal
                </span>
                <h3 className="text-lg font-black text-gray-100 mt-1">
                  Inspect Bank Slip: {viewingSlipRequest.title}
                </h3>
              </div>
            </DialogHeader>
            <DialogBody className="py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Left side: Slip image preview */}
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-[#1E293B] bg-[#0F172A] min-h-[300px]">
                  {viewingSlipPreviewUrl ? (
                    <Image
                      src={viewingSlipPreviewUrl}
                      alt="Payment Slip"
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                      No slip image uploaded
                    </div>
                  )}
                </div>

                {/* Right side: parsed EasySlip data details */}
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-emerald-300">
                      Expected amount
                    </span>
                    <span className="mt-1 block font-mono text-xl font-black text-emerald-200">
                      {formatThb(viewingSlipRequest.amountRequested)}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A]/70 p-4 shadow-none space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-500 border-b border-[#1E293B] pb-2">
                      EasySlip Auto-Match Data
                    </h4>
                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="block text-[9px] text-gray-500 uppercase font-black tracking-wider">
                          Sender Name (ชื่อผู้โอน)
                        </span>
                        <span className="font-extrabold text-gray-100 mt-0.5 block">
                          {viewingSlipRequest.easySlipData?.rawSlip?.sender?.displayName ||
                            viewingSlipRequest.easySlipData?.rawSlip?.sender?.name ||
                            viewingSlipRequest.easySlipData?.senderName ||
                            "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-500 uppercase font-black tracking-wider">
                          Transaction Ref ID (รหัสอ้างอิง)
                        </span>
                        <span className="font-mono font-bold text-gray-100 mt-0.5 block">
                          {viewingSlipRequest.easySlipData?.rawSlip?.transRef ||
                            viewingSlipRequest.easySlipData?.transRef ||
                            "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-500 uppercase font-black tracking-wider">
                          Amount (ยอดเงิน)
                        </span>
                        <span className="font-mono font-black text-emerald-700 text-sm mt-0.5 block">
                          {formatThb(
                            Number(
                              viewingSlipRequest.easySlipData?.rawSlip?.amount?.amount ||
                                viewingSlipRequest.amountRequested
                            )
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-500 uppercase font-black tracking-wider">
                          Transfer Date/Time (วันเวลาที่โอน)
                        </span>
                        <span className="font-bold text-gray-100 mt-0.5 block">
                          {viewingSlipRequest.easySlipData?.rawSlip?.transDate &&
                          viewingSlipRequest.easySlipData?.rawSlip?.transTime
                            ? `${viewingSlipRequest.easySlipData.rawSlip.transDate} ${viewingSlipRequest.easySlipData.rawSlip.transTime}`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-gray-500 uppercase font-black tracking-wider">
                          Receiving Bank Account (บัญชีผู้รับ)
                        </span>
                        <span className="font-mono font-semibold text-gray-100 mt-0.5 block">
                          {viewingSlipRequest.easySlipData?.rawSlip?.receiver?.account || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#B7D1EA]/10 border border-[#B7D1EA]/30 rounded-2xl p-4 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] font-semibold text-gray-300 leading-relaxed">
                      <p className="font-black text-gray-100 mb-0.5">Manual Inspection</p>
                      Please verify that the bank slip matches your bank statement for security before performing physical deployment scheduling.
                    </div>
                  </div>
                </div>
              </div>
            </DialogBody>
            <DialogFooter className="border-t border-[#1E293B]/50 bg-[#0F172A]">
              <button
                type="button"
                onClick={() => setViewingSlipRequest(null)}
                className="rounded-xl border border-[#1E293B] bg-[#0F172A] hover:bg-[#0B1121] px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors shadow-none cursor-pointer"
              >
                Close
              </button>
              {viewingSlipRequest.status === "AWAITING_VERIFICATION" ? (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleVerifyPaymentSlip(viewingSlipRequest.id, "REJECT")}
                    disabled={busyAction?.startsWith(`verify-payment-${viewingSlipRequest.id}-`)}
                    className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleVerifyPaymentSlip(viewingSlipRequest.id, "APPROVE")}
                    disabled={busyAction?.startsWith(`verify-payment-${viewingSlipRequest.id}-`)}
                    className="rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-[#04120d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Approve & Mark as Paid
                  </button>
                </div>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isDispatchModalOpen && (
        <PrepareSigningDispatchModal
          isOpen={isDispatchModalOpen}
          onClose={() => setIsDispatchModalOpen(false)}
          quotationNumber={record.erpnextQuotationId || record.id}
          version={typeof record.configurationData?.revisionNumber === "number" ? (record.configurationData.revisionNumber as number) : 1}
          customerName={record.customerName || "Customer"}
          customerEmail={record.email || undefined}
          totalPrice={record.value ?? undefined}
          onConfirmDispatch={handleDispatchForSigningWithConfig}
          isSubmitting={busyAction === "dispatch-signing"}
        />
      )}

      <PaymentInvoiceModal
        isOpen={Boolean(invoiceModalPr)}
        onClose={() => setInvoiceModalPr(null)}
        paymentRequest={invoiceModalPr}
        customerInfo={{
          name: record.customerName,
          email: record.email,
          phone: record.phone,
          address: record.installationMapAddress || record.location,
          proposalCode: record.trackRequestNumber || record.erpnextQuotationId || record.id.slice(0, 8).toUpperCase(),
          systemKwp: record.systemSizeKwp,
        }}
        onUploadSlip={handleAdminUploadSlip}
        isUploading={Boolean(isUploadingSlipPrId)}
      />

      <PaymentReceiptModal
        isOpen={Boolean(receiptModalPr)}
        onClose={() => setReceiptModalPr(null)}
        paymentRequest={receiptModalPr}
        customerInfo={{
          name: record.customerName,
          email: record.email,
          phone: record.phone,
          address: record.installationMapAddress || record.location,
          proposalCode: record.trackRequestNumber || record.erpnextQuotationId || record.id.slice(0, 8).toUpperCase(),
          systemKwp: record.systemSizeKwp,
        }}
      />
    </div>
  );
}
