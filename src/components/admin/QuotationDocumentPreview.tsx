"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, ExternalLink, FileWarning } from "@/components/ui/icons";
import { useTranslations } from "next-intl";

export type QuotationDocumentPreviewKind = "pdf" | "image" | "unknown";

type QuotationDocumentPreviewProps = {
  name: string;
  url: string;
  kind: QuotationDocumentPreviewKind;
  pdfFile?: Blob | ArrayBuffer;
};

export default function QuotationDocumentPreview({
  name,
  url,
  kind,
  pdfFile,
}: QuotationDocumentPreviewProps) {
  const t = useTranslations("AdminCrmDocumentPreview");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (pdfFile) {
      const blob = pdfFile instanceof Blob ? pdfFile : new Blob([pdfFile], { type: "application/pdf" });
      const created = URL.createObjectURL(blob);
      setObjectUrl(created);
      return () => URL.revokeObjectURL(created);
    }
  }, [pdfFile]);

  const targetUrl = objectUrl || url;

  if (kind === "image") {
    return (
      <div className="relative h-full min-h-[22rem] w-full overflow-hidden bg-[#0B1121]">
        <Image
          src={url}
          alt={name}
          fill
          unoptimized
          sizes="(max-width: 1024px) 100vw, 90vw"
          className="object-contain p-4 sm:p-8"
        />
      </div>
    );
  }

  if (kind === "unknown") {
    return (
      <div className="flex h-full min-h-[22rem] flex-col items-center justify-center gap-3 bg-[#0B1121] px-6 text-center">
        <FileWarning className="h-10 w-10 text-slate-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-200">{t("previewUnavailable")}</p>
        <p className="max-w-md text-xs leading-5 text-slate-400">{t("previewUnavailableDescription")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-300 bg-white px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold text-slate-600 truncate max-w-xs">{name}</p>
        <div className="flex items-center gap-2">
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
          <a
            href={targetUrl}
            download={name || "document.pdf"}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-2 sm:p-4">
        <iframe
          src={targetUrl}
          title={name}
          className="h-full w-full rounded-xl border border-slate-300 bg-white shadow-inner"
        />
      </div>
    </div>
  );
}
