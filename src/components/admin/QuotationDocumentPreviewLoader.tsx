"use client";

import dynamic from "next/dynamic";

import type { QuotationDocumentPreviewKind } from "@/components/admin/QuotationDocumentPreview";

export type { QuotationDocumentPreviewKind };

type QuotationDocumentPreviewProps = {
  name: string;
  url: string;
  kind: QuotationDocumentPreviewKind;
  pdfFile?: Blob | ArrayBuffer;
};

const QuotationDocumentPreviewClient = dynamic(
  () => import("@/components/admin/QuotationDocumentPreview"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[22rem] items-center justify-center bg-[#0B1121] px-6 text-sm font-semibold text-slate-300">
        Preparing document preview…
      </div>
    ),
  },
);

export default function QuotationDocumentPreviewLoader(props: QuotationDocumentPreviewProps) {
  return <QuotationDocumentPreviewClient {...props} />;
}
