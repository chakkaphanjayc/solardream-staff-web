"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  FileText,
  Layers,
  Mail,
  PackageCheck,
  Phone,
  ShieldCheck,
} from "@/components/ui/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  DocumentRequestUploadGrid,
  hasPendingRequiredDocuments,
} from "@/components/proposals/DocumentRequestUploadGrid";
import type {
  ClientDeliveryDocument,
  ClientDocumentRequest,
  ClientPaymentInstructions,
  ClientPaymentRequest,
  ClientProposal,
  ClientInstallationSnapshot,
  ProposalPortalSnapshotResponseDto,
} from "@/types/proposals";
import { ProjectTaskStepper } from "@/components/proposals/detail/ProjectTaskStepper";
import { PortalRevisionAndBilling } from "@/components/proposals/PortalRevisionAndBilling";
import { deriveQuotationTrackingReference } from "@/lib/trackingReference";
import { getQuotationDeliveryDocumentVersion } from "@/lib/quotationDeliveryDocuments";
import { trackProductEvent } from "@/lib/productAnalytics";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Bento Dashboard Components
import { ProposalBentoHero } from "@/components/proposals/detail/ProposalBentoHero";
import { ProposalSignatureCtaCard } from "@/components/proposals/detail/ProposalSignatureCtaCard";
import { ProposalSignatureModal } from "@/components/proposals/detail/ProposalSignatureModal";
import { ProposalFinancialsCard } from "@/components/proposals/detail/ProposalFinancialsCard";
import { ProposalEmbeddedPdfViewer } from "@/components/proposals/detail/ProposalEmbeddedPdfViewer";
import { ProposalRevisionRequestCard } from "@/components/proposals/detail/ProposalRevisionRequestCard";
import {
  getEffectiveQuotationStatus,
  isQuotationAvailableForSignature,
} from "@/lib/quotationSigningEligibility";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function getTrackRequestNumber(proposal: ClientProposal) {
  const config = asRecord(proposal.configurationData);
  const trackingRef = asString(config.trackingRef) || asString(config.trackingId);
  if (proposal.requestType?.toLowerCase() === "service" && trackingRef) {
    return trackingRef;
  }
  return deriveQuotationTrackingReference(proposal.id);
}

export default function GuestProposalSignView({
  proposal,
  magicTokenSlug,
  initialDocumentRequests = [],
  initialDeliveryDocuments = [],
  initialPaymentRequests = [],
  presentation = "fullscreen",
  showAccountCta = false,
}: {
  proposal: ClientProposal;
  magicTokenSlug?: string | null;
  initialDocumentRequests?: ClientDocumentRequest[];
  initialDeliveryDocuments?: ClientDeliveryDocument[];
  initialPaymentRequests?: ClientPaymentRequest[];
  paymentInstructions?: ClientPaymentInstructions;
  presentation?: "fullscreen" | "embedded";
  showAccountCta?: boolean;
}) {
  const { locale = "th" } = useParams<{ locale?: string }>();
  const t = useTranslations("GuestProposalSign");
  const [currentProposal, setCurrentProposal] = useState(proposal);
  const [documentRequests, setDocumentRequests] = useState(initialDocumentRequests);
  const [deliveryDocuments, setDeliveryDocuments] = useState(initialDeliveryDocuments);
  const [paymentRequests, setPaymentRequests] = useState(initialPaymentRequests);
  const [installation, setInstallation] = useState<ClientInstallationSnapshot>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [hasReviewedQuotation, setHasReviewedQuotation] = useState(false);

  const activeUnpaidPaymentRequests = paymentRequests.filter(
    (r) => r.status === "PENDING" || r.status === "FAILED",
  );

  const [activeTab, setActiveTab] = useState<"quotation" | "payment" | "progress">(() => {
    const effectiveStatus = getEffectiveQuotationStatus(
      proposal.status,
      proposal.dispatchStatus,
    );
    const isSigned = [
      "SIGNED",
      "FULLY_SIGNED",
      "CLIENT_SIGNED_PENDING_REVIEW",
      "APPROVED",
      "APPROVED_BY_CUSTOMER",
      "CUSTOMER_APPROVED",
    ].includes(effectiveStatus);
    const hasUnpaid = initialPaymentRequests.some(
      (r) => r.status === "PENDING" || r.status === "FAILED",
    );
    const isPaidAll =
      initialPaymentRequests.length > 0 &&
      initialPaymentRequests.every((r) => r.status === "PAID");

    if (!isSigned) return "quotation";
    if (hasUnpaid) return "payment";
    if (isPaidAll) return "progress";
    return "payment";
  });

  const snapshotRequestInFlight = useRef(false);
  const refreshSnapshot = useCallback(async () => {
    if (document.visibilityState === "hidden" || snapshotRequestInFlight.current)
      return;
    snapshotRequestInFlight.current = true;
    try {
      const response = await fetch(
        `/api/proposals/${encodeURIComponent(proposal.id)}/portal-snapshot`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        },
      );
      const payload = (await response.json()) as ProposalPortalSnapshotResponseDto;
      if (!response.ok || !payload.success || !payload.snapshot) return;
      const snapshot = payload.snapshot;
      setCurrentProposal((current) => ({
        ...current,
        ...snapshot.proposal,
        user: current.user,
        selectedFinancing: current.selectedFinancing,
        createdAt: current.createdAt,
        updatedAt: String(snapshot.proposal.updatedAt || current.updatedAt),
      }));
      setDocumentRequests(snapshot.documentRequests);
      setDeliveryDocuments(snapshot.deliveryDocuments);
      setPaymentRequests(snapshot.paymentRequests);
      setInstallation(snapshot.installation);
    } finally {
      snapshotRequestInFlight.current = false;
    }
  }, [proposal.id]);

  const handleSignComplete = useCallback(
    (payload?: { status?: string; signed_pdf_url?: string }) => {
      if (payload?.status || payload?.signed_pdf_url) {
        setCurrentProposal((current) => ({
          ...current,
          status: payload.status || "CLIENT_SIGNED_PENDING_REVIEW",
          signedDocumentDriveUrl:
            payload.signed_pdf_url || current.signedDocumentDriveUrl,
          updatedAt: new Date().toISOString(),
        }));
      } else {
        setCurrentProposal((current) => ({
          ...current,
          status: "CLIENT_SIGNED_PENDING_REVIEW",
          updatedAt: new Date().toISOString(),
        }));
      }
      void refreshSnapshot();
    },
    [refreshSnapshot],
  );

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshSnapshot();
    };
    const intervalId = window.setInterval(refreshWhenVisible, 15_000);
    void refreshSnapshot();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshSnapshot]);

  const effectiveStatus = getEffectiveQuotationStatus(
    currentProposal.status,
    currentProposal.dispatchStatus,
  );
  const isSigned = [
    "SIGNED",
    "FULLY_SIGNED",
    "CLIENT_SIGNED_PENDING_REVIEW",
    "APPROVED",
    "APPROVED_BY_CUSTOMER",
    "CUSTOMER_APPROVED",
  ].includes(effectiveStatus);
  const revisionRequested = effectiveStatus === "REVISION_REQUESTED";
  const isSignableStatus = isQuotationAvailableForSignature({
    status: currentProposal.status,
    dispatchStatus: currentProposal.dispatchStatus,
  });
  const notSignableReason = !isSignableStatus
    ? [
        "STAFF_REVIEW",
        "PENDING_REVIEW",
        "DRAFT",
      ].includes(effectiveStatus)
      ? "AWAITING_STAFF"
      : "INVALID_STATUS"
    : null;

  const signatureLocked =
    !isSigned && (revisionRequested || hasPendingRequiredDocuments(documentRequests));
  const pendingRequiredDocumentCount = documentRequests.filter(
    (request) => request.isRequired && request.status === "PENDING",
  ).length;
  const isDocumentUploadPriority =
    !isSigned && pendingRequiredDocumentCount > 0;
  const paymentHasStarted =
    ["DEPOSIT_PAID", "FULLY_PAID"].includes(currentProposal.paymentStatus || "") ||
    paymentRequests.some(
      (request) =>
        request.status === "AWAITING_VERIFICATION" || request.status === "PAID",
    );
  const customerName =
    currentProposal.user?.name ||
    currentProposal.user?.fullName ||
    (locale === "th" ? "ลูกค้า SolarDream" : "SolarDream Customer");
  const trackRequestNumber = getTrackRequestNumber(currentProposal);

  useEffect(() => {
    void trackProductEvent("proposal_request_viewed", {
      proposal_type: currentProposal.requestType || "installation",
      proposal_status: effectiveStatus,
      revision_number: currentProposal.revisionNumber,
    });
  }, [currentProposal.requestType, currentProposal.revisionNumber, effectiveStatus]);

  const handleOpenSignModal = useCallback(() => {
    void trackProductEvent("proposal_signature_started", {
      proposal_type: currentProposal.requestType || "installation",
      proposal_status: effectiveStatus,
      revision_number: currentProposal.revisionNumber,
    });
    setIsSignModalOpen(true);
  }, [currentProposal.requestType, currentProposal.revisionNumber, effectiveStatus]);

  const finalQuotationDocument = deliveryDocuments.find(
    (document) =>
      document.deliveryType === "FINAL_QUOTATION" &&
      document.status === "READY" &&
      Boolean(document.storageFileId || document.fileUrl),
  );
  const hasFinalQuotation = Boolean(finalQuotationDocument);
  const quotationVersion = getQuotationDeliveryDocumentVersion(
    finalQuotationDocument,
    currentProposal.revisionNumber,
  );
  const hasQuotationPdf = Boolean(
    currentProposal.signedDocumentDriveUrl ||
      hasFinalQuotation ||
      currentProposal.revisedPdfUrl ||
      currentProposal.pdfUrl,
  );
  const nativePdfUrl = hasQuotationPdf
    ? `/api/proposals/${encodeURIComponent(proposal.id)}/native-pdf`
    : null;

  const documentStateKey = documentRequests
    .map((request) => `${request.id}:${request.status}:${request.updatedAt}`)
    .join("|");

  return (
    <div
      className={
        presentation === "embedded"
          ? "min-w-0 bg-transparent text-[#1C1C1A]"
          : "min-h-dvh bg-[#F0EEE9] px-4 pb-12 pt-8 text-[#1C1C1A] md:pt-10"
      }
    >
      {showAccountCta && (
        <section className="mx-auto mb-6 flex max-w-7xl flex-col items-center justify-between gap-4 rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-6 shadow-sm sm:flex-row">
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="text-base font-bold text-[#1C1C1A]">{t("saveTitle")}</h2>
            <p className="text-sm font-medium text-[#4E4B44]">{t("saveDescription")}</p>
          </div>
          <Link
            href={`/${locale}/register?reference_number=${encodeURIComponent(
              proposal.id,
            )}`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#B7D1EA] px-6 text-center text-xs font-medium text-white shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/90 hover:shadow-md active:scale-95"
          >
            {t("createAccount")}
          </Link>
        </section>
      )}

      <div className="mx-auto w-full max-w-7xl space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (
              value === "quotation" ||
              value === "payment" ||
              value === "progress"
            ) {
              setActiveTab(value);
            }
          }}
          className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3"
        >
          <div className="lg:col-span-3">
            <ProposalBentoHero
              proposal={currentProposal}
              customerName={customerName}
              trackRequestNumber={trackRequestNumber}
              isSigned={isSigned}
            />
          </div>

          {/* Physical Folder Tabs Navigation Bar */}
          <div className="layer-sticky sticky top-[72px] z-30 -mx-1 my-3 rounded-[24px] border border-[#8E8B83]/15 bg-[#E6E3DC]/95 p-2 shadow-sm backdrop-blur-md md:top-[72px] lg:col-span-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 touch-pan-x overflow-x-auto px-1 pb-1 overscroll-x-contain [scrollbar-width:thin]">
                <TabsList className="flex min-w-max items-end justify-start gap-2 !overflow-visible border-0 bg-transparent p-0 shadow-none">
                  <TabsTrigger
                    value="quotation"
                    className={cn(
                      "group relative flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-xs font-medium transition-all duration-300 sm:text-sm",
                      activeTab === "quotation"
                        ? "z-10 bg-[#B7D1EA] text-white shadow-sm"
                        : "border border-[#8E8B83]/20 bg-[#F0EEE9] text-[#4E4B44] hover:bg-[#A5C2DE]/10 hover:text-[#1C1C1A]",
                    )}
                  >
                    <FileText className="h-4 w-4 stroke-[2] text-current" />
                    <span>
                      {locale === "th"
                        ? "1. ใบเสนอราคา & สเปก"
                        : "1. Quotation & Specs"}
                    </span>
                    {quotationVersion > 1 && (
                      <span className="rounded-full bg-[#DCE8F5] px-2 py-0.5 text-[10px] font-bold text-[#2E2C27]">
                        v{quotationVersion}
                      </span>
                    )}
                  </TabsTrigger>

                  <TabsTrigger
                    value="payment"
                    className={cn(
                      "group relative flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-xs font-medium transition-all duration-300 sm:text-sm",
                      activeTab === "payment"
                        ? "z-10 bg-[#B7D1EA] text-white shadow-sm"
                        : "border border-[#8E8B83]/20 bg-[#F0EEE9] text-[#4E4B44] hover:bg-[#A5C2DE]/10 hover:text-[#1C1C1A]",
                    )}
                  >
                    <CreditCard className="h-4 w-4 stroke-[2] text-current" />
                    <span>
                      {locale === "th"
                        ? "2. การชำระเงิน & สลิป"
                        : "2. Payment & Billing"}
                    </span>
                    {activeUnpaidPaymentRequests.length > 0 && (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        {activeUnpaidPaymentRequests.length}
                      </span>
                    )}
                  </TabsTrigger>

                  <TabsTrigger
                    value="progress"
                    className={cn(
                      "group relative flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-xs font-medium transition-all duration-300 sm:text-sm",
                      activeTab === "progress"
                        ? "z-10 bg-[#B7D1EA] text-white shadow-sm"
                        : "border border-[#8E8B83]/20 bg-[#F0EEE9] text-[#4E4B44] hover:bg-[#A5C2DE]/10 hover:text-[#1C1C1A]",
                    )}
                  >
                    <Layers className="h-4 w-4 stroke-[2] text-current" />
                    <span>
                      {locale === "th"
                        ? "3. สถานะดำเนินงาน"
                        : "3. Project Progress"}
                    </span>
                    {pendingRequiredDocumentCount > 0 && (
                      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-[#1C1C1A]">
                        {pendingRequiredDocumentCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="hidden shrink-0 items-center gap-2 pr-1 sm:flex">
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#8E8B83]/20 bg-[#F0EEE9] px-4 py-1.5 text-xs font-medium text-[#1C1C1A] shadow-sm">
                  <ShieldCheck className="h-4 w-4 stroke-[2.5] text-emerald-600" />
                  <span>
                    Ref:{" "}
                    {currentProposal.erpnextQuotationId || trackRequestNumber}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* TAB 1 PANEL: QUOTATION & SYSTEM SPECS */}
          <TabsContent value="quotation" className="contents">
            <>
              {!isSigned && quotationVersion > 1 && (
                <div className="flex flex-col items-start justify-between gap-4 rounded-[28px] border border-amber-300/60 bg-amber-50/70 p-5 text-amber-950 sm:flex-row sm:items-center lg:col-span-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className="h-5 w-5 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                      <h3 className="text-base font-bold text-amber-950">
                        {locale === "th"
                          ? `ใบเสนอราคาฉบับปรับปรุง (เวอร์ชัน ${quotationVersion})`
                          : `Updated Quotation Document (Version ${quotationVersion})`}
                      </h3>
                    </div>
                    <p className="max-w-3xl text-xs font-medium leading-relaxed text-amber-800">
                      {locale === "th"
                        ? `SolarDream ได้ทำการอัปเดตและเปลี่ยนใบเสนอราคาเป็นเวอร์ชัน ${quotationVersion} กรุณาตรวจสอบเอกสารฉบับใหม่ด้านล่างและลงนามอิเล็กทรอนิกส์อีกครั้งเพื่ออนุมัติใบเสนอราคาฉบับปรับปรุงนี้`
                        : `SolarDream has updated your quotation to Version ${quotationVersion}. Please review the updated document below and re-sign to approve this revised quotation.`}
                    </p>
                  </div>
                  <a
                    href="#quotation-document"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-amber-900 px-5 text-xs font-medium text-white shadow-sm transition-all duration-300 hover:bg-amber-800 hover:shadow-md active:scale-95"
                  >
                    {locale === "th" ? "ตรวจสอบและลงนาม" : "Review & Sign"}
                  </a>
                </div>
              )}

              <div className="space-y-6 lg:col-span-2">
                <ProposalEmbeddedPdfViewer
                  pdfUrl={nativePdfUrl}
                  version={quotationVersion}
                  isSigned={isSigned}
                  onReviewComplete={() => setHasReviewedQuotation(true)}
                />

                <ProposalSignatureCtaCard
                  isSigned={isSigned}
                  signatureLocked={signatureLocked}
                  revisionRequested={revisionRequested}
                  isSignableStatus={isSignableStatus}
                  notSignableReason={notSignableReason}
                  hasReviewedDocument={hasReviewedQuotation}
                  onOpenSignModal={handleOpenSignModal}
                />
              </div>

              <aside className="space-y-6 lg:col-span-1 lg:sticky lg:top-24 lg:self-start">
                <ProposalFinancialsCard proposal={currentProposal} />

                <ProposalRevisionRequestCard
                  proposalId={proposal.id}
                  magicTokenSlug={magicTokenSlug}
                  paymentHasStarted={paymentHasStarted}
                  onRevisionRequested={({
                    status,
                    dispatchStatus,
                    updatedAt,
                  }) => {
                    setCurrentProposal((current) => ({
                      ...current,
                      status,
                      dispatchStatus: dispatchStatus || current.dispatchStatus,
                      signedDocumentDriveUrl: null,
                      updatedAt: updatedAt || new Date().toISOString(),
                    }));
                    void refreshSnapshot();
                  }}
                />
              </aside>
            </>
          </TabsContent>

          {/* TAB 2 PANEL: PAYMENT & BILLING HUB */}
          <TabsContent value="payment" className="lg:col-span-3">
            <PortalRevisionAndBilling
              proposal={currentProposal}
              magicTokenSlug={magicTokenSlug}
              initialPaymentRequests={paymentRequests}
              onRevisionRequested={(status, dispatchStatus, updatedAt) => {
                setCurrentProposal((current) => ({
                  ...current,
                  status,
                  dispatchStatus: dispatchStatus || current.dispatchStatus,
                  updatedAt: updatedAt || new Date().toISOString(),
                }));
                void refreshSnapshot();
              }}
              onPaymentRequestsChange={setPaymentRequests}
              section="billing"
            />
          </TabsContent>

          {/* TAB 3 PANEL: PROJECT INSTALLATION PROGRESS & UTILITY DOCUMENTS */}
          <TabsContent value="progress" className="contents">
            <>
              {isDocumentUploadPriority && (
                <section
                  id="required-uploads"
                  className="scroll-mt-24 rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-5 shadow-sm sm:p-6 lg:col-span-3"
                  aria-labelledby="required-uploads-title"
                >
                  <div className="flex flex-col gap-4 border-b border-[#8E8B83]/15 pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#DCE8F5] text-[#4F7FA8]">
                        <AlertTriangle
                          className="h-5 w-5"
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#4F7FA8]">
                          {t("documentsPriorityEyebrow")}
                        </p>
                        <h2
                          id="required-uploads-title"
                          className="mt-1 text-lg font-bold text-[#1C1C1A] sm:text-xl"
                        >
                          {t("documentsPriorityTitle")}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#4E4B44]">
                          {t("documentsPriorityDescription", {
                            count: pendingRequiredDocumentCount,
                          })}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex w-fit shrink-0 rounded-full border border-[#8E8B83]/20 bg-[#F0EEE9] px-3.5 py-1.5 text-xs font-medium text-[#1C1C1A] shadow-sm">
                      {t("documentsPriorityCount", {
                        count: pendingRequiredDocumentCount,
                      })}
                    </span>
                  </div>

                  <div className="mt-5">
                    <DocumentRequestUploadGrid
                      key={documentStateKey}
                      proposalId={proposal.id}
                      magicTokenSlug={magicTokenSlug}
                      initialRequests={documentRequests}
                      onRequestsChange={setDocumentRequests}
                    />
                  </div>
                </section>
              )}

              <div className="space-y-6 lg:col-span-2">
                <section className="rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-5 shadow-sm sm:p-6">
                  <ProjectTaskStepper
                    installation={installation}
                    refresh={refreshSnapshot}
                  />
                  {installation?.project.status === "FINISHED" ? (
                    <Link
                      href={`/${locale}/proposals/${proposal.id}/registration`}
                      className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#B7D1EA] px-6 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/90 hover:shadow-md active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:ring-offset-2"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {locale === "th"
                        ? "ลงทะเบียนการรับประกัน"
                        : "Register warranty"}
                    </Link>
                  ) : null}
                </section>
              </div>

              <aside className="space-y-6 lg:col-span-1">
                {!isDocumentUploadPriority && (
                  <section className="rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-5 shadow-sm">
                    <div className="flex items-center gap-3 border-b border-[#8E8B83]/15 pb-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#DCE8F5] text-[#4F7FA8]">
                        <PackageCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-[#1C1C1A]">
                          {t("documentsTitle")}
                        </h2>
                        <p className="mt-1 text-sm leading-5 text-[#4E4B44]">
                          เอกสารสำหรับยื่นขออนุญาตขนานไฟ
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <DocumentRequestUploadGrid
                        key={documentStateKey}
                        variant="compact"
                        proposalId={proposal.id}
                        magicTokenSlug={magicTokenSlug}
                        initialRequests={documentRequests}
                        onRequestsChange={setDocumentRequests}
                      />
                    </div>
                  </section>
                )}
              </aside>
            </>
          </TabsContent>

          <div className="pt-4 lg:col-span-3">
            <footer
              className="border-t border-[#8E8B83]/20 py-8"
              aria-label="SolarDream customer portal footer"
            >
              <div className="flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 md:justify-start">
                    <span className="text-lg font-bold tracking-tight text-[#1C1C1A]">
                      SolarDream
                    </span>
                    <span className="rounded-full bg-[#DCE8F5] px-3 py-0.5 text-[11px] font-medium text-[#2E2C27]">
                      Customer Portal
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm font-normal leading-6 text-[#4E4B44]">
                    Official engineering & residential solar quotation portal.
                    Certified Tier-1 hardware, PEA/MEA utility permit management,
                    and lifetime warranty tracking.
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-[#4E4B44] md:justify-end">
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-[#4F7FA8]" />
                    <span>02-123-4567</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-[#4F7FA8]" />
                    <span>support@solardream.co.th</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>SSL 256-bit encrypted</span>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </Tabs>
      </div>

      <ProposalSignatureModal
        isOpen={isSignModalOpen}
        onClose={() => setIsSignModalOpen(false)}
        proposal={currentProposal}
        customerName={customerName}
        onSignComplete={handleSignComplete}
      />
    </div>
  );
}
