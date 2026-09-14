"use client";

import { Download, FileText, ExternalLink, ShieldCheck, PackageCheck, FileCheck2 } from "@/components/ui/icons";
import type { ClientProposal } from "@/types/proposals";
import { useTranslations } from "next-intl";

interface DeliveryDocItem {
  deliveryType: string;
  title: string;
  description: string;
  fileUrl?: string | null;
  status?: string;
  required?: boolean;
  metadata?: {
    originalFileName?: string;
    kind?: string;
    extension?: string;
    byteSize?: number;
  } | null;
}

interface WarrantyRowItem {
  equipment: string;
  coverage: string;
}

interface ProposalFileCenterCardProps {
  proposal: ClientProposal;
  deliveryDocuments: DeliveryDocItem[];
  warrantyRows: readonly WarrantyRowItem[];
  onOpenPdfViewer?: (url: string, title?: string) => void;
}

export function ProposalFileCenterCard({
  proposal,
  deliveryDocuments,
  warrantyRows,
  onOpenPdfViewer,
}: ProposalFileCenterCardProps) {
  const t = useTranslations("ProposalFileCenter");
  const effectiveStatus = (
    proposal.dispatchStatus && proposal.dispatchStatus !== "PENDING_DISPATCH"
      ? proposal.dispatchStatus
      : proposal.status
  ).toUpperCase();
  const isSigned = [
    "SIGNED",
    "FULLY_SIGNED",
    "CLIENT_SIGNED_PENDING_REVIEW",
    "APPROVED",
    "APPROVED_BY_CUSTOMER",
    "CUSTOMER_APPROVED",
  ].includes(effectiveStatus);

  const pdfUrl =
    isSigned && proposal.signedDocumentDriveUrl
      ? proposal.signedDocumentDriveUrl
      : proposal.revisedPdfUrl || proposal.pdfUrl;

  const handlePdfClick = (e: React.MouseEvent, url: string, title?: string) => {
    if (onOpenPdfViewer) {
      e.preventDefault();
      onOpenPdfViewer(url, title);
    }
  };

  return (
    <section className="space-y-6 rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between border-b border-[#8E8B83]/15 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DCE8F5] text-[#2E2C27] shadow-xs">
            <PackageCheck className="h-5 w-5 text-[#4F7FA8]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1C1C1A]">{t("title")}</h2>
            <p className="text-xs text-[#4E4B44]">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Primary proposal document */}
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-2xl border border-[#8E8B83]/15 bg-[#F0EEE9] p-3.5 shadow-xs transition-colors hover:bg-[#DCE8F5]/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#DCE8F5] text-[#4F7FA8]">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#1C1C1A]">{t("mainDocumentTitle")}</p>
              <p className="text-[11px] font-medium text-[#4E4B44]">
                {isSigned ? t("signedPdfDesc") : t("officialPdfDesc")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {pdfUrl ? (
              <>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => handlePdfClick(e, pdfUrl, t("mainDocumentTitle"))}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-[#DCE8F5] px-4 text-xs font-bold text-[#2E2C27] transition-all hover:bg-[#DCE8F5] active:scale-95 shadow-xs"
                >
                  <ExternalLink className="h-3 w-3 text-[#4F7FA8]" />
                  {t("view")}
                </a>
                <a
                  href={pdfUrl}
                  download
                  className="inline-flex min-h-9 w-9 items-center justify-center rounded-full border border-[#8E8B83]/20 bg-[#F0EEE9] text-[#4E4B44] transition-all hover:bg-[#DCE8F5]/40 active:scale-95"
                  title={t("download")}
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <span className="text-[11px] font-medium text-[#4E4B44]/60">{t("filePreparing")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Additional Deliverables */}
      <div className="space-y-3 pt-2 border-t border-[#8E8B83]/15">
        <h3 className="text-xs font-bold uppercase text-[#4E4B44] tracking-wider flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-[#4F7FA8]" />
          {t("deliverables")}
        </h3>

        <div className="space-y-2">
          {deliveryDocuments.map((doc) => (
            <div
              key={doc.deliveryType}
              className="flex items-center justify-between rounded-2xl border border-[#8E8B83]/15 bg-[#F0EEE9] p-3.5 transition-colors hover:bg-[#DCE8F5]/30"
            >
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-xs font-bold text-[#1C1C1A] truncate">{doc.title}</p>
                <p className="text-[11px] font-medium text-[#4E4B44] truncate">{doc.description}</p>
              </div>

              {doc.fileUrl ? (
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => handlePdfClick(e, doc.fileUrl!, doc.title)}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#DCE8F5] px-4 text-xs font-bold text-[#2E2C27] transition-all hover:bg-[#DCE8F5] active:scale-95 shadow-xs"
                >
                  <ExternalLink className="h-3 w-3 text-[#4F7FA8]" />
                  {t("view")}
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[#F7F6F3] px-3 py-1 text-[10px] font-bold text-[#4E4B44]">
                  {t("pending")}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Warranty Highlights */}
      <div className="space-y-3 pt-2 border-t border-[#8E8B83]/15">
        <h3 className="text-xs font-bold uppercase text-[#4E4B44] tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          {t("warrantyDisclosures")}
        </h3>

        <div className="space-y-2">
          {warrantyRows.slice(0, 3).map((row) => (
            <div key={row.equipment} className="space-y-0.5 rounded-2xl border border-[#8E8B83]/15 bg-[#F0EEE9] p-3 shadow-xs">
              <p className="text-xs font-bold text-[#1C1C1A]">{row.equipment}</p>
              <p className="text-[11px] font-medium text-[#4E4B44] leading-snug">{row.coverage}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
