"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Download, ExternalLink, FileText } from "@/components/ui/icons";

import type { ProposalEmbeddedPdfViewerProps } from "@/components/proposals/detail/ProposalEmbeddedPdfViewer";
import { trackProductEvent } from "@/lib/productAnalytics";

export default function ProposalEmbeddedPdfViewerClient(props: ProposalEmbeddedPdfViewerProps) {
  return <ProposalEmbeddedPdfViewerClientContent key={`${props.pdfUrl}:${props.version ?? 1}:${props.isSigned ? "signed" : "review"}`} {...props} />;
}

function ProposalEmbeddedPdfViewerClientContent({
  pdfUrl,
  title,
  version = 1,
  isSigned = false,
  onReviewComplete,
}: ProposalEmbeddedPdfViewerProps) {
  const t = useTranslations("ProposalEmbeddedPdfViewer");
  const reviewReportedRef = useRef(false);
  const [reviewComplete, setReviewComplete] = useState(isSigned);
  const normalizedVersion = Number.isInteger(version) && version > 0 ? version : 1;

  const markReviewComplete = useCallback(() => {
    if (reviewReportedRef.current) return;
    reviewReportedRef.current = true;
    setReviewComplete(true);
    void trackProductEvent("proposal_document_opened", {
      document_type: isSigned ? "signed_quotation" : "quotation",
      document_version: normalizedVersion,
    });
    onReviewComplete?.();
  }, [isSigned, normalizedVersion, onReviewComplete]);

  useEffect(() => {
    if (isSigned) {
      markReviewComplete();
    }
  }, [isSigned, markReviewComplete]);

  if (!pdfUrl) {
    return (
      <section className="rounded-2xl border-[3px] border-[#000000] bg-white p-6 text-center shadow-[4px_4px_0_#000000]">
        <FileText className="mx-auto h-9 w-9 text-[#4F7FA8]" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">{t("preparingTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#334155]">{t("preparingDescription")}</p>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-[3px] border-[#000000] bg-white shadow-[4px_4px_0_#000000]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-[#000000] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-[#0F172A]" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold text-slate-900">{title || t("defaultTitle")}</h2>
            <span className="inline-flex shrink-0 items-center rounded-full bg-[#B7D1EA]/35 px-2.5 py-1 text-[11px] font-bold text-slate-800">
              {t("version", { version: normalizedVersion })}
            </span>
            <span className={`inline-flex shrink-0 items-center rounded-lg border-2 border-[#000000] px-2.5 py-1 text-[11px] font-black text-[#0F172A] ${isSigned ? "bg-emerald-100" : "bg-[#F0EEE9]"}`}>
              {isSigned ? t("signedCopy") : t("reviewRequired")}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#334155]">{t("reviewDescription")}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-[#000000] bg-white px-3.5 py-1.5 text-xs font-black text-slate-700 transition-all hover:bg-[#F0EEE9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7FA8] focus-visible:ring-offset-2"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open
          </a>
          <a
            href={pdfUrl}
            download
            onClick={() => {
              void trackProductEvent("proposal_document_downloaded", {
                document_type: isSigned ? "signed_quotation" : "quotation",
                document_version: normalizedVersion,
              });
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-[#000000] bg-white px-3.5 py-1.5 text-xs font-black text-slate-700 transition-all hover:bg-[#F0EEE9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7FA8] focus-visible:ring-offset-2"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t("download")}
          </a>
        </div>
      </header>

      <div className="relative min-h-[26rem] w-full bg-[#F0EEE9] p-2 sm:min-h-[34rem] sm:p-4" style={{ height: "min(75dvh, 880px)" }}>
        <iframe
          src={pdfUrl}
          title={title || t("defaultTitle")}
          className="h-full w-full rounded-xl border-2 border-[#000000] bg-white shadow-inner"
          onLoad={markReviewComplete}
        />
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t-2 border-[#000000] px-4 py-3 sm:px-5">
        <p className="text-xs font-medium text-[#475569]">Document ready</p>
        <p className={`inline-flex items-center gap-1.5 text-xs font-semibold ${reviewComplete ? "text-emerald-700" : "text-[#475569]"}`}>
          {reviewComplete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
          {reviewComplete ? t("reviewComplete") : t("scrollToUnlock")}
        </p>
      </footer>
    </section>
  );
}
